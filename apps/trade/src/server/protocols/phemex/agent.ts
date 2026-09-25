import type { NetworkId } from "@/lib/protocols/contracts"
import { phemexAccountPositions } from "@/server/protocols/phemex/account"

/** What to look at on Phemex, shown after the refusal. */
const WHY =
  "Phemex would not accept the signature. Check the key id and the secret, and that the key is allowed to read this account."

/**
 * Proving a pasted Phemex credential before it is stored.
 *
 * There is no approval list to read the way Hyperliquid has — an API key
 * either signs or it does not. So the proof is one signed, harmless read of
 * the account: if the exchange answers, the key id and secret are real, they
 * belong together, and they can at least read this account. Whether the key
 * also has trade permission only shows at the first order; the wallet
 * dialog's help copy says to grant it.
 *
 * Refusals speak the app's shared KEY_ codes so the dialog's sentences work
 * unchanged:
 * - `KEY_NOT_APPROVED` — the exchange rejected the signature: wrong id,
 *   wrong secret, or a key without read permission. What to check about a
 *   PHEMEX key is written here and sent along with the code, because the
 *   dialog showing it has no business knowing which exchange it is on.
 * - `KEY_CHECK_UNAVAILABLE` — the exchange could not be reached at all;
 *   nothing was saved, try again.
 *
 * Phemex does not state a key expiry over the API, so `validUntil` is null
 * and the wallet card simply never warns of one.
 */
export async function verifyPhemexAgentKey(
  network: NetworkId,
  accountAddress: string,
  agentKey: string
): Promise<{ validUntil: number | null }> {
  try {
    await phemexAccountPositions(network, accountAddress, () => agentKey)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message === "PHEMEX_AUTH" || message.startsWith("PHEMEX_401")) {
      throw new Error(`KEY_NOT_APPROVED:${WHY}`)
    }
    // A refusal the exchange worded itself (a PHEMEX_<code> error) still
    // proves the exchange was reached — the credential is what it refused.
    if (message.startsWith("PHEMEX_") && !message.startsWith("PHEMEX_HTTP_5")) {
      throw new Error(`KEY_NOT_APPROVED:${WHY}`)
    }
    throw new Error("KEY_CHECK_UNAVAILABLE")
  }
  return { validUntil: null }
}
