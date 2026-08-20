import type { NetworkId } from "@/lib/protocols/contracts"
import { fetchKucoinAccount } from "@/server/protocols/kucoin/account"
import { isKucoinCredentialRefusal } from "@/server/protocols/kucoin/client"

/**
 * Proving a pasted KuCoin credential before it is stored.
 *
 * There is no approval list to read the way Hyperliquid has — three values
 * either sign or they do not. So the proof is one signed, harmless read of
 * the account: if the exchange answers, the key id, secret and passphrase are
 * real and belong together, and they can at least read this account.
 *
 * What this cannot prove is that the key may also TRADE, or that this machine
 * is on the key's allowed-addresses list if one is set — KuCoin only says so
 * when an order is placed. The credential form's help text asks for both, and
 * the first order is where a missing permission would show.
 *
 * Refusals speak the app's shared KEY_ codes so the dialog's sentences work
 * unchanged, and KuCoin's own auth codes (unknown key, bad passphrase, bad
 * signature, no permission, wrong address) all mean one thing to a person.
 *
 * KuCoin states no key expiry over the API, so `validUntil` is null and the
 * wallet card simply never warns of one.
 */
export async function verifyKucoinAgentKey(
  network: NetworkId,
  accountAddress: string,
  agentKey: string
): Promise<{ validUntil: number | null }> {
  try {
    await fetchKucoinAccount(network, accountAddress, () => agentKey)
  } catch (error) {
    if (isKucoinCredentialRefusal(error)) throw new Error("KEY_NOT_APPROVED")
    const message = error instanceof Error ? error.message : ""
    // A blob this folder could not read is a paste problem, not the
    // exchange's — the dialog asks for the missing field by name.
    if (message === "LIVE_WALLET_KEY") throw new Error("KEY_REQUIRED")
    // Anything the exchange itself refused by name still proves it was
    // reached, so the credential is what it did not like.
    if (message.startsWith("KUCOIN_4")) throw new Error("KEY_NOT_APPROVED")
    throw new Error("KEY_CHECK_UNAVAILABLE")
  }
  return { validUntil: null }
}
