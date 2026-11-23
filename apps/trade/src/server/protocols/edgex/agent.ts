import type { NetworkId } from "@/lib/protocols/contracts"
import { readEdgexAccount } from "@/server/protocols/edgex/account"
import { parseEdgexCredential } from "@/server/protocols/edgex/client"
import { edgexSignerAddress } from "@/server/protocols/edgex/signer"

/**
 * Proves an edgeX wallet's values before anything is saved.
 *
 * - **The account id, key, secret and passphrase** are proved by one signed
 *   read of the account, `getAccountAsset`, which edgeX answers only for the
 *   account the key belongs to. The account it answers about must be the
 *   account id typed in.
 * - **The signer key** is proved as far as edgeX lets it be without an
 *   order. Its address is derived from it; where edgeX's answer names the
 *   account's signing address (`l2Key` holding an address), the two must
 *   match, and a mismatch is refused naming both. edgeX's page shows `l2Key`
 *   as an older, longer key, in which case there is nothing to compare, and
 *   the first order is what proves the signer key.
 *
 * One request, and nothing is sent that could change the account. edgeX
 * states no expiry on its keys, so none is recorded.
 */
export async function verifyEdgexAgentKey(
  network: NetworkId,
  accountAddress: string,
  agentKey: string
): Promise<{ validUntil: number | null; positionMode: null }> {
  const credential = parseEdgexCredential(agentKey)
  if (credential.accountId !== accountAddress.trim()) {
    throw new Error(
      "KEY_NOT_APPROVED:The account id and the values pasted do not belong together. Copy the Account ID from edgeX's API Management list, and the values from the SDK Signer dialog on the same row."
    )
  }
  let read
  try {
    read = await readEdgexAccount(network, credential, "order")
  } catch (error) {
    throw asKeyRefusal(error)
  }
  if (read.accountId !== credential.accountId) {
    throw new Error(
      "KEY_NOT_APPROVED:This API key belongs to a different edgeX account than the account id entered. Enter the Account ID on the same row of edgeX's API Management list."
    )
  }
  const signer = edgexSignerAddress(credential.signerKey)
  if (read.l2Key && /^0x[0-9a-fA-F]{40}$/.test(read.l2Key) && read.l2Key.toLowerCase() !== signer.toLowerCase()) {
    throw new Error(
      `KEY_NOT_APPROVED:The signer key signs as ${signer}, but edgeX holds ${read.l2Key} for this account. Copy the signer key again from the SDK Signer dialog.`
    )
  }
  return { validUntil: null, positionMode: null }
}

/**
 * The wallet window reads a reason out of `KEY_NOT_APPROVED:` and says "the
 * exchange could not be reached" for `KEY_CHECK_UNAVAILABLE`. edgeX's
 * refusal sentences already say what to do, so they are carried over.
 */
function asKeyRefusal(error: unknown): Error {
  const message = error instanceof Error ? error.message : ""
  if (message.startsWith("EXCHANGE_BUSY") || message.startsWith("LIVE_NO_ANSWER")) {
    return new Error("KEY_CHECK_UNAVAILABLE")
  }
  const said = /^LIVE_ORDER_REFUSED:([^]+)$/.exec(message)
  if (said) return new Error(`KEY_NOT_APPROVED:${said[1]}`)
  if (message === "LIVE_UNREADABLE") {
    return new Error(
      "KEY_NOT_APPROVED:edgeX answered with an account Trade could not read. Nothing was saved."
    )
  }
  return new Error("KEY_CHECK_UNAVAILABLE")
}
