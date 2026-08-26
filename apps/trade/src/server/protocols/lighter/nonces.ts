import { z } from "zod"

import type { NetworkId } from "@/lib/protocols/contracts"
import { lighterPublic } from "@/server/protocols/lighter/client"

/**
 * The number every Lighter transaction has to carry, and the one thing most
 * likely to jam the order path.
 *
 * Lighter counts transactions per API key. Each one must carry the next
 * number in that key's sequence, and a number that is not the expected one is
 * refused — so getting this wrong does not lose money, it stops trading
 * altogether until somebody notices.
 *
 * **A refused transaction may or may not have spent its number.** Lighter
 * burns the number for a transaction it accepted and then rejected on its
 * merits, and does not for one it could not read at all. From out here the
 * two look the same, so this file does not try to tell them apart: any
 * refusal throws the count away and the next order asks Lighter where the
 * sequence really is. One wasted request beats a stuck wallet.
 */

const NEXT_NONCE_WEIGHT = 6

const nonceSchema = z.object({ nonce: z.number() })

type Sequence = {
  /** The next number to use, once known. */
  next: number
  /** An in-flight read, so two orders at once do not both ask. */
  loading: Promise<number> | null
}

const sequences = new Map<string, Sequence>()

const keyOf = (network: NetworkId, accountIndex: number, apiKeyIndex: number) =>
  `${network}:${accountIndex}:${apiKeyIndex}`

async function askLighter(
  network: NetworkId,
  accountIndex: number,
  apiKeyIndex: number
): Promise<number> {
  const answer = await lighterPublic(
    network,
    "/api/v1/nextNonce",
    NEXT_NONCE_WEIGHT,
    { account_index: accountIndex, api_key_index: apiKeyIndex }
  )
  const parsed = nonceSchema.safeParse(answer)
  if (!parsed.success || !Number.isSafeInteger(parsed.data.nonce)) {
    throw new Error("LIGHTER_NONCE_UNREADABLE")
  }
  return parsed.data.nonce
}

/**
 * The number to put on the next transaction for this key.
 *
 * Asked of Lighter once and then counted on locally, because this app is the
 * only thing signing for the key — the task's rule that one key belongs to
 * one process is what makes counting safe. Anything that signs for the same
 * key elsewhere would make both wrong, which is why a refusal resets.
 */
export async function nextLighterNonce(
  network: NetworkId,
  accountIndex: number,
  apiKeyIndex: number
): Promise<number> {
  const key = keyOf(network, accountIndex, apiKeyIndex)
  const held = sequences.get(key) ?? { next: -1, loading: null }
  sequences.set(key, held)

  if (held.next >= 0) {
    const using = held.next
    held.next = using + 1
    return using
  }
  held.loading ??= askLighter(network, accountIndex, apiKeyIndex).finally(() => {
    held.loading = null
  })
  const start = await held.loading
  // Two callers waiting on one read must not both take the same number.
  const current = sequences.get(key)
  if (!current) return start
  const using = current.next >= 0 ? current.next : start
  current.next = using + 1
  return using
}

/**
 * Throws the count away after a refusal, so the next order asks Lighter
 * where its sequence really is rather than guessing from a number that may
 * or may not have been spent.
 */
export function forgetLighterNonce(
  network: NetworkId,
  accountIndex: number,
  apiKeyIndex: number
): void {
  sequences.delete(keyOf(network, accountIndex, apiKeyIndex))
}

/** Tests must not inherit a sequence from an earlier case. */
export function clearLighterNonces(): void {
  sequences.clear()
}
