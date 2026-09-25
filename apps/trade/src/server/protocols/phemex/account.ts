import { z } from "zod"

import type { NetworkId, WalletAccountFigures } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/phemex/translate"
import { loadHeldPromise } from "@/server/protocols/connector-helpers"
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

/**
 * How long one account read stands in for the next.
 *
 * **Three parts of one screen ask this same question at once.** The wallet
 * card wants the balance, the positions panel wants what is held, and the
 * ladder engine wants both before it decides anything — and each of them was
 * asking the exchange separately, several times every few seconds, on one
 * API key. Phemex counts signed requests per key and started refusing them,
 * so the wallet card said it could not be reached while the exchange was
 * answering everyone else perfectly well.
 *
 * Two seconds is long enough that one cycle of the screen shares a single
 * answer, and short enough that nothing on screen is visibly behind.
 */
const ACCOUNT_GOOD_FOR_MS = 2_000

type AccountAnswer = {
  account: z.infer<typeof answerSchema>["account"]
  positions: unknown[]
}

const accountCache = new Map<
  string,
  { at: number; answer: Promise<AccountAnswer> }
>()

/** Empties the shared answer. Tests drive their own time; see `orders.ts`. */
export function clearPhemexAccountCache(): void {
  accountCache.clear()
}

/** The raw signed read, shared with the portfolio side of `orders.ts`. */
export async function phemexAccountPositions(
  network: NetworkId,
  _address: string,
  credential: () => string | null
): Promise<AccountAnswer> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  // The blob carries its own key id — the one the secret actually belongs
  // to — so a mistyped address column can never sign as somebody else.
  const parsed = parsePhemexCredential(blob)

  const key = `${network}:${parsed.keyId}`
  return loadHeldPromise(
    accountCache,
    key,
    (at) => Date.now() - at < ACCOUNT_GOOD_FOR_MS,
    () =>
      phemexSigned(network, parsed, "GET", "/g-accounts/positions", {
        currency: "USDT",
      }).then((raw) => answerSchema.parse(raw))
  )
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
