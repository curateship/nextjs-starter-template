import { z } from "zod"

import type {
  NetworkId,
  WalletAccountFigures,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/kucoin/translate"
import {
  kucoinSigned,
  parseKucoinCredential,
} from "@/server/protocols/kucoin/client"

/**
 * What a KuCoin Futures account holds and is worth — the exchange's own
 * answer, in one signed read.
 *
 * KuCoin states every piece separately, and states the total too, so nothing
 * here is derived: `accountEquity` already counts the open positions' profit,
 * `availableBalance` is what a new order may spend, and the margin held is
 * the position margin plus whatever resting orders have reserved.
 *
 * Like every API-key exchange, the account cannot be read by its public
 * identifier alone — the credential arrives as a function and is opened here,
 * for this one call.
 */

const overviewSchema = z.object({
  accountEquity: z.union([z.string(), z.number()]).optional(),
  availableBalance: z.union([z.string(), z.number()]).optional(),
  positionMargin: z.union([z.string(), z.number()]).optional(),
  orderMargin: z.union([z.string(), z.number()]).optional(),
  unrealisedPNL: z.union([z.string(), z.number()]).optional(),
})

export async function fetchKucoinAccount(
  network: NetworkId,
  _address: string,
  credential: () => string | null
): Promise<WalletAccountFigures> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const answer = await kucoinSigned(
    network,
    // The blob carries its own key id — the one the secret actually belongs
    // to — so a mistyped address column can never sign as somebody else.
    parseKucoinCredential(blob),
    "GET",
    "/api/v1/account-overview",
    { currency: "USDT" }
  )
  const account = overviewSchema.parse(answer)

  const openProfit = num(account.unrealisedPNL) ?? 0
  const inTrades =
    (num(account.positionMargin) ?? 0) + (num(account.orderMargin) ?? 0)

  return {
    equity: num(account.accountEquity) ?? 0,
    free: num(account.availableBalance) ?? 0,
    inTrades,
    openProfit,
  }
}
