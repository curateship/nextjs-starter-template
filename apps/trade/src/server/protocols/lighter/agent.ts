import { createHash } from "node:crypto"

import { z } from "zod"

import type { NetworkId } from "@/lib/protocols/contracts"
import { lighterPublic, parseLighterCredential } from "@/server/protocols/lighter/client"
import { loadLighterKey } from "@/server/protocols/lighter/signer"

/**
 * Proving a Lighter key, and finding the two numbers Lighter needs to be
 * told before it will sign anything.
 *
 * **A signature alone proves nothing here.** Any forty random bytes can sign
 * a Lighter auth token perfectly well; what matters is whether Lighter has
 * that key registered against the account. So the check is a comparison, not
 * a signature: derive the public key from what was pasted, ask Lighter which
 * public keys it holds for the account, and see whether one of them matches.
 *
 * That comparison also answers the question nobody would otherwise know to
 * ask. Lighter files each key in a numbered slot, and every signed request
 * has to name the slot it came from. Matching the public key finds that
 * number rather than making a person read it off a screen and type it in.
 */

const UNLISTED_WEIGHT = 300

const numeric = z.union([z.string(), z.number()])

const accountsByAddressSchema = z.object({
  sub_accounts: z.array(z.object({ index: numeric }).passthrough()).optional(),
  accounts: z.array(z.object({ index: numeric }).passthrough()).optional(),
})

const apiKeysSchema = z.object({
  api_keys: z
    .array(
      z.object({
        account_index: z.number(),
        api_key_index: z.number(),
        public_key: z.string(),
      })
    )
    .default([]),
})

export type LighterAccountFacts = {
  /** Lighter's own number for the account behind an Ethereum address. */
  accountIndex: number
  /** Which of the account's key slots this credential sits in. */
  apiKeyIndex: number
}

function indexOf(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

/**
 * The account behind one Ethereum address, as its lowest index.
 *
 * One address can carry several accounts on Lighter — the main one plus any
 * sub-accounts — and it hands them back in no promised order. The lowest is
 * the main account, which is the one a person means when they paste their
 * address.
 */
export async function fetchLighterAccountIndex(
  network: NetworkId,
  address: string
): Promise<number> {
  const answer = await lighterPublic(
    network,
    "/api/v1/accountsByL1Address",
    UNLISTED_WEIGHT,
    { l1_address: address }
  )
  const parsed = accountsByAddressSchema.safeParse(answer)
  const rows = parsed.success
    ? [...(parsed.data.sub_accounts ?? []), ...(parsed.data.accounts ?? [])]
    : []
  const indexes = rows
    .map((row) => indexOf(row.index))
    .filter((one): one is number => one !== null)
  if (indexes.length === 0) {
    // `KEY_NOT_APPROVED:` is the shared code the wallet dialog reads a
    // reason out of — anything else, however well worded, is dropped and the
    // person is told only "That did not save. Try it again."
    throw new Error(
      "KEY_NOT_APPROVED:Lighter has no account at that address. Check it on Lighter's own site, and make sure it is the wallet you trade with there."
    )
  }
  return Math.min(...indexes)
}

/**
 * Which slot a key sits in, by matching the public key Lighter holds.
 *
 * A key that matches nothing is refused here rather than at signing time,
 * because a wrong key and a wrong slot both come back from Lighter as a bad
 * signature, and that is not something a person can act on.
 */
export async function findLighterApiKeyIndex(
  network: NetworkId,
  accountIndex: number,
  publicKey: string
): Promise<number> {
  const answer = await lighterPublic(network, "/api/v1/apikeys", UNLISTED_WEIGHT, {
    account_index: accountIndex,
  })
  const parsed = apiKeysSchema.safeParse(answer)
  const wanted = publicKey.trim().toLowerCase().replace(/^0x/, "")
  const found = parsed.success
    ? parsed.data.api_keys.find(
        (row) => row.public_key.trim().toLowerCase() === wanted
      )
    : undefined
  if (!found) {
    throw new Error(
      "KEY_NOT_APPROVED:Lighter has not registered that API key against this account. Make an API key on Lighter's site and paste the private key it shows you, and check the address field is the wallet that key belongs to."
    )
  }
  return found.api_key_index
}

/**
 * Everything Lighter must be told about a wallet before it will sign, looked
 * up rather than stored.
 *
 * Held briefly because two lookups against a sixty-a-minute allowance is not
 * free, and neither number changes on its own. Ten minutes is short enough
 * that registering a key again is noticed without a restart.
 */
const FACTS_HELD_MS = 10 * 60_000

type HeldFacts = { at: number; load: Promise<LighterAccountFacts> }
const heldFacts = new Map<string, HeldFacts>()

export async function lighterAccountFacts(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<LighterAccountFacts> {
  const blob = credential()
  if (blob === null) throw new Error("LIVE_WALLET_KEY")
  const { privateKey } = parseLighterCredential(blob)

  /**
   * Keyed by the address AND the key, so replacing a wallet's key does not
   * quietly answer from the old key's slot.
   *
   * The key's part of it is a one-way fingerprint rather than a slice of the
   * key itself. It only has to tell two keys apart, and putting real key
   * material into a map that outlives the request buys nothing for it.
   */
  const fingerprint = createHash("sha256").update(privateKey).digest("hex")
  const key = `${network}:${address.toLowerCase()}:${fingerprint.slice(0, 16)}`
  const held = heldFacts.get(key)
  if (held && Date.now() - held.at < FACTS_HELD_MS) return held.load

  const load = (async () => {
    const accountIndex = await fetchLighterAccountIndex(network, address)
    // Slot 0 only loads the key so its public key can be derived; the real
    // slot is whatever Lighter turns out to have it filed under, and the key
    // is loaded again under that slot below.
    const { publicKey } = await loadLighterKey({
      privateKey,
      accountIndex,
      apiKeyIndex: 0,
    })
    const apiKeyIndex = await findLighterApiKeyIndex(
      network,
      accountIndex,
      publicKey
    )
    await loadLighterKey({ privateKey, accountIndex, apiKeyIndex })
    return { accountIndex, apiKeyIndex }
  })()

  heldFacts.set(key, { at: Date.now(), load })
  load.catch(() => {
    if (heldFacts.get(key)?.load === load) heldFacts.delete(key)
  })
  return load
}

/**
 * Proves a pasted key before anything is stored.
 *
 * Answers no expiry: Lighter's API keys do not expire on their own, unlike
 * the approvals some venues hand out. The auth tokens signed with them last
 * an hour and are made fresh each time, which is a different thing.
 */
export async function verifyLighterAgentKey(
  network: NetworkId,
  accountAddress: string,
  agentKey: string
): Promise<{ validUntil: number | null }> {
  await lighterAccountFacts(network, accountAddress, () => agentKey)
  return { validUntil: null }
}

/** Tests and a replaced key must not answer from an earlier lookup. */
export function clearLighterAccountFacts(): void {
  heldFacts.clear()
}
