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
    // The addresses go with the refusal, because "not approved" alone leaves
    // somebody comparing a key they cannot read against a list they cannot
    // see. Both sides here are public: the address a key signs as, and the
    // addresses the exchange says are approved. The key itself never travels,
    // and `scrubSecrets` leaves 40-hex addresses alone precisely so this can
    // be said out loud.
    const approved = agents.map((agent) => agent.address.toLowerCase()).join(",")
    throw new Error(`KEY_NOT_APPROVED:${signer}|${approved}`)
  }
  if (listed.validUntil !== null && listed.validUntil <= Date.now()) {
    throw new Error("KEY_EXPIRED")
  }
  return { validUntil: listed.validUntil }
}
