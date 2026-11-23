import { z } from "zod"

import type { NetworkId } from "@/lib/protocols/contracts"
import { infoClient } from "@/server/protocols/hyperliquid/client"
import { agentAddress } from "@/server/protocols/hyperliquid/signing"

/**
 * Proves a pasted trading key before it is ever saved.
 *
 * Three refusals, each its own code so the dialog can say exactly what is
 * wrong in plain words:
 *
 * - **The key IS the account** (`KEY_IS_ACCOUNT`). A Hyperliquid agent key is
 *   a limited helper the account approved: it can trade but the exchange
 *   itself refuses to let it withdraw. The account's own key has no such
 *   limit — it can move the money out — so it is refused outright. The old
 *   app's import path accepted these; this one does not.
 * - **Hyperliquid does not list the key** (`KEY_NOT_APPROVED`). The address
 *   the key signs as must appear on the account's own approved-agents list.
 *   This is the ground truth the exchange enforces at order time, asked at
 *   save time instead — a wrong key is refused while it can still be fixed,
 *   not discovered when an order matters.
 * - **The approval has run out** (`KEY_EXPIRED`). Agent approvals expire;
 *   the expiry comes back so the wallet can warn before it happens again.
 *
 * A network failure is its own code (`KEY_CHECK_UNAVAILABLE`) and refuses the
 * SAVE, never the wallet: an existing wallet is never disabled over a hiccup,
 * but an unproven key is never stored on one either.
 */

const extraAgentsSchema = z.array(
  z.object({
    address: z.string(),
    name: z.string(),
    validUntil: z.number().nullable(),
  })
)

export async function verifyHyperliquidAgentKey(
  network: NetworkId,
  accountAddress: string,
  agentKey: string
): Promise<{ validUntil: number | null }> {
  // Derived locally — the key itself goes nowhere.
  const signer = agentAddress(agentKey)
  if (signer === accountAddress.toLowerCase()) {
    throw new Error("KEY_IS_ACCOUNT")
  }

  let agents: z.infer<typeof extraAgentsSchema>
  try {
    const response = await infoClient(network).extraAgents({
      user: accountAddress as `0x${string}`,
    })
    agents = extraAgentsSchema.parse(response)
  } catch {
    throw new Error("KEY_CHECK_UNAVAILABLE")
  }

  const listed = agents.find((agent) => agent.address.toLowerCase() === signer)
  if (!listed) {
    const approved = agents.map((agent) => agent.address.toLowerCase())
    throw new Error(`KEY_NOT_APPROVED:${whyNotApproved(signer, approved)}`)
  }
  if (listed.validUntil !== null && listed.validUntil <= Date.now()) {
    throw new Error("KEY_EXPIRED")
  }
  return { validUntil: listed.validUntil }
}

/**
 * Why this key is not one of the approved ones, in words the dialog can show
 * as they are.
 *
 * **Hyperliquid writes its own explanation because only Hyperliquid has one.**
 * "Not approved" on its own leaves somebody comparing a key they cannot read
 * against a list they cannot see. The two things worth saying — which address
 * this key signs as, and which addresses the account actually approved — are
 * facts about Hyperliquid's approved-agents list, and no other exchange here
 * has such a list. So the sentence is built here and rides along after the
 * refusal code, rather than a screen somewhere unpacking Hyperliquid's shapes.
 *
 * Both addresses are public. The key itself never travels, and `scrubSecrets`
 * leaves 40-hex addresses alone precisely so this can be said out loud.
 */
function whyNotApproved(signer: string, approved: readonly string[]): string {
  const mine = shortAddress(signer)
  if (approved.length === 0) {
    return `The key you pasted is for ${mine}, and this account has no approved keys at all. Nothing has been authorised on this network yet: make an API key on the exchange, press Authorize, and paste that one.`
  }
  const listed = approved.map(shortAddress).join(" and ")
  return `The key you pasted is for ${mine}. Hyperliquid lists ${listed} as approved, so it is not one of those. A key only counts if you pressed Authorize on that exact one, so copy a fresh key and authorise it in the same breath.`
}

/** `0x1234…5678` — enough to compare two addresses by eye, short enough to read. */
function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}
