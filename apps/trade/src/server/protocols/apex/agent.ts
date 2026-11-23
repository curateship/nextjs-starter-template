import type { NetworkId } from "@/lib/protocols/contracts"
import { readApexAccount } from "@/server/protocols/apex/account"
import { parseApexCredential } from "@/server/protocols/apex/client"
import { apexPublicKeyOf } from "@/server/protocols/apex/signer"

/**
 * Proves an ApeX Omni wallet's four values before anything is saved.
 *
 * - **The key, secret and passphrase** are proved by one signed read of the
 *   account. A wrong one of any of the three is refused by ApeX with the
 *   same code, 10002, so the sentence names all three.
 * - **The address** must be the wallet ApeX has this account under, or the
 *   values belong to someone else's account.
 * - **The omni key** is proved by signing with it. Any 130 hex characters
 *   sign something, so signing alone proves nothing; what proves it is that
 *   the signature's public key is the `l2Key` ApeX holds for this account.
 *   A wrong omni key is refused here rather than at the first order.
 *
 * Costs two requests (the account and its balance, read together) and one
 * signature. Nothing is sent that could change the account.
 */
export async function verifyApexAgentKey(
  network: NetworkId,
  accountAddress: string,
  agentKey: string
): Promise<{ validUntil: number | null; positionMode: null }> {
  const credential = parseApexCredential(agentKey)
  let facts
  try {
    facts = (await readApexAccount(network, credential, "order")).read.facts
  } catch (error) {
    throw asKeyRefusal(error)
  }
  if (facts.ethereumAddress === null) {
    throw new Error(
      "KEY_NOT_APPROVED:ApeX Omni did not say which wallet this account belongs to, so the address could not be checked. Nothing was saved."
    )
  }
  if (facts.ethereumAddress !== accountAddress.trim().toLowerCase()) {
    throw new Error(
      "KEY_NOT_APPROVED:These API values belong to a different wallet than the address entered. Enter the wallet address you signed in to ApeX Omni with."
    )
  }
  if (facts.l2Key === null) {
    throw new Error(
      "KEY_NOT_APPROVED:ApeX Omni did not say which signing key this account uses, so the omni key could not be checked. Nothing was saved."
    )
  }
  const publicKey = await apexPublicKeyOf(credential.omniKey)
  if (publicKey !== facts.l2Key.toLowerCase()) {
    throw new Error(
      "KEY_NOT_APPROVED:The omni key does not belong to this account: it signs as a different key than the one ApeX Omni holds for it. Copy the omni key again from ApeX's API management page."
    )
  }
  if (facts.makerFeeRate === "" || facts.takerFeeRate === "") {
    throw new Error(
      "KEY_NOT_APPROVED:ApeX Omni did not state this account's fee rates, which every order has to sign. Nothing was saved."
    )
  }
  return { validUntil: null, positionMode: null }
}

/**
 * The wallet window reads a reason out of `KEY_NOT_APPROVED:` and says "the
 * exchange could not be reached" for `KEY_CHECK_UNAVAILABLE`. ApeX's own
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
      "KEY_NOT_APPROVED:ApeX Omni answered with an account Trade could not read. Nothing was saved."
    )
  }
  return new Error("KEY_CHECK_UNAVAILABLE")
}
