import { z } from "zod"

import type {
  NetworkId,
  WalletAccountFigures,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/phemex/translate"
import {
  parsePhemexCredential,
  phemexSigned,
} from "@/server/protocols/phemex/client"

/**
 * What a Phemex account holds and is worth — the exchange's own answer.
 *
 * Unlike a wallet-shaped venue, Phemex cannot be asked about an account by
 * its public identifier alone: every read is signed with the API secret. The
 * credential arrives as a thunk and is opened here, for this one call.
 *
 * The exchange reports the pieces, not the total: `accountBalanceRv` is cash
 * plus everything already settled, and each position carries its own
 * `unRealisedPnlRv`. Equity — what the app calls the account's worth — is
 * the sum, worked out here the same way the exchange's own screen does.
 */

const answerSchema = z.object({
  account: z.object({
    accountBalanceRv: z.union([z.string(), z.number()]),
    totalUsedBalanceRv: z.union([z.string(), z.number()]),
  }),
  positions: z.array(z.unknown()).default([]),
})

const positionPnlSchema = z.object({
  unRealisedPnlRv: z.union([z.string(), z.number()]).optional(),
})

/** The raw signed read, shared with the portfolio side of `orders.ts`. */
export async function phemexAccountPositions(
  network: NetworkId,
  _address: string,
  credential: () => string | null
): Promise<{ account: z.infer<typeof answerSchema>["account"]; positions: unknown[] }> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  // The blob carries its own key id — the one the secret actually belongs
  // to — so a mistyped address column can never sign as somebody else.
  const answer = await phemexSigned(
    network,
    parsePhemexCredential(blob),
    "GET",
    "/g-accounts/positions",
    { currency: "USDT" }
  )
  return answerSchema.parse(answer)
}

export async function fetchPhemexAccount(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<WalletAccountFigures> {
  const { account, positions } = await phemexAccountPositions(
    network,
    address,
    credential
  )

  const balance = num(account.accountBalanceRv) ?? 0
  const inTrades = num(account.totalUsedBalanceRv) ?? 0
  let openProfit = 0
  for (const raw of positions) {
    const parsed = positionPnlSchema.safeParse(raw)
    if (!parsed.success) continue
    openProfit += num(parsed.data.unRealisedPnlRv) ?? 0
  }

  return {
    equity: balance + openProfit,
    free: Math.max(0, balance - inTrades),
    inTrades,
    openProfit,
  }
}
