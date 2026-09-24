import { z } from "zod"

import type { NetworkId } from "@/lib/protocols/contracts"
import type { KeyPermission } from "@/lib/trade/wallets"
import {
  BINANCE_ONE_WAY_REQUIRED,
  binanceCredentialOf,
  fetchBinanceAccount,
  fetchBinancePositionMode,
} from "@/server/protocols/binance/account"
import { binanceSigned } from "@/server/protocols/binance/client"
import { isKeyRefusal } from "@/server/protocols/binance/refusals"
import { scrubbedMessage } from "@/server/protocols/scrub"

const restrictionsSchema = z.object({
  enableWithdrawals: z.boolean(),
  enableFutures: z.boolean(),
})

/**
 * What this key may do, from Binance's key-restrictions read on its spot
 * host. The field names were read from Binance's own wallet SDK on
 * 24 Sep 2026.
 */
async function readRestrictions(
  network: NetworkId,
  credential: () => string | null
) {
  const answer = await binanceSigned(
    network,
    binanceCredentialOf(credential),
    "GET",
    "/sapi/v1/account/apiRestrictions",
    {},
    { host: "spot" }
  )
  const parsed = restrictionsSchema.safeParse(answer)
  if (!parsed.success) throw new Error("BINANCE_ACCOUNT_UNREADABLE")
  return parsed.data
}

export async function readBinanceKeyPermission(
  network: NetworkId,
  _address: string,
  credential: () => string | null
): Promise<KeyPermission> {
  const restrictions = await readRestrictions(network, credential)
  if (restrictions.enableWithdrawals) return "can-withdraw"
  return restrictions.enableFutures ? "trade-only" : "unknown"
}

const WHY =
  "Binance would not accept this API key and secret. Copy both again from Binance's API Management page. If the key is restricted to certain internet addresses, this server's address must be on its list."

const NO_FUTURES =
  "This API key cannot trade futures. On Binance's API Management page, edit the key and tick Enable Futures, then add the wallet again."

/**
 * Proves a pasted Binance key before it is stored, in three signed reads
 * that change nothing:
 *
 * 1. The key's own permissions. A key without futures trading is refused
 *    here, because every order it sent would be refused later.
 * 2. The account's position mode. Hedge Mode is refused, since Trade holds
 *    one direction per coin; the mode is returned and saved on the wallet.
 * 3. The futures account itself, which proves the account can be read.
 *
 * An account Binance has limited to closing positions may still pass all
 * three, because none of them opens anything. Its refusal (`-4087`,
 * `binance.md`) would then arrive at the first new order, in its own
 * sentence.
 */
export async function verifyBinanceAgentKey(
  network: NetworkId,
  _accountAddress: string,
  blob: string
): Promise<{ validUntil: number | null; positionMode: "one-way" }> {
  const credential = () => blob
  try {
    const restrictions = await readRestrictions(network, credential)
    if (!restrictions.enableFutures) {
      throw new Error(`KEY_NOT_APPROVED:${NO_FUTURES}`)
    }
    if ((await fetchBinancePositionMode(network, credential)) === "two-sided") {
      throw new Error(`WALLET_POSITION_MODE:${BINANCE_ONE_WAY_REQUIRED}`)
    }
    await fetchBinanceAccount(network, "", credential)
    return { validUntil: null, positionMode: "one-way" }
  } catch (error) {
    if (isKeyRefusal(error)) throw new Error(`KEY_NOT_APPROVED:${WHY}`)
    const message = scrubbedMessage(error)
    if (
      message.startsWith("KEY_NOT_APPROVED:") ||
      message.startsWith("WALLET_POSITION_MODE:") ||
      message.startsWith("EXCHANGE_BUSY")
    ) {
      throw new Error(message)
    }
    // Binance answered, in words, and refused something other than the key:
    // the region block is the likely one. Its sentence is the reason.
    if (message.startsWith("LIVE_ORDER_REFUSED:")) {
      throw new Error(
        `KEY_NOT_APPROVED:${message.slice("LIVE_ORDER_REFUSED:".length)}`
      )
    }
    throw new Error("KEY_CHECK_UNAVAILABLE")
  }
}
