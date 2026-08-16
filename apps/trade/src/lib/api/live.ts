import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { parseMarketKey, type PlaceOrderOutcome } from "@/lib/protocols/contracts"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"
import type { SmartOrder } from "@/lib/trade/smart-plan"
import type { PaperOrder, PaperPosition } from "@/lib/trade/paper"
import { userGet, userPost } from "@/server/guards"
import {
  cancelLiveOrder as cancelOrderRow,
  closeLivePosition as closePositionRow,
  loadLivePortfolio,
  placeLiveOrder as placeOrderRow,
  setLiveBrackets as setBracketsRow,
} from "@/server/trade/live-orders"
import { hideLiveTrade as hideTradeRows } from "@/server/trade/live-fills"
import { listActiveSmartOrders } from "@/server/trade/smart-orders"
import { listWallets } from "@/server/trade/wallets"

import { describeAuthError } from "./error-message"

/**
 * Real trading: the poll that draws a live wallet's rows, and the four
 * actions that sign. Everything mutating is `userPost` — signed in AND from
 * this app's own pages — and every input is validated to the same shapes the
 * paper endpoints take, so the screens cannot tell the wallets apart.
 *
 * The error map is honest on purpose: where the exchange itself refused, its
 * (scrubbed) reason is shown rather than a vague sentence — with real money,
 * "Insufficient margin" is the answer, not a detail.
 */

const marketKeySchema = z
  .string()
  .max(120)
  .refine((key) => parseMarketKey(key) !== null, { message: "LIVE_MARKET" })

const placeSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
  side: z.enum(["buy", "sell"]),
  px: z.number().positive().finite(),
  sz: z.number().positive().finite(),
  leverage: z.number().min(1).max(100),
  reduceOnly: z.boolean(),
  tpPx: z.number().positive().finite().nullable(),
  slPx: z.number().positive().finite().nullable(),
})

const cancelSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
  /** The exchange's own order id — digits, not a uuid. */
  orderId: z.string().max(24).regex(/^\d+$/),
})

const bracketsSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
  tpPx: z.number().positive().finite().nullable(),
  slPx: z.number().positive().finite().nullable(),
})

const positionSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
})

const loadLiveTradingFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(
    async ({
      context,
    }): Promise<{
      positions: PaperPosition[]
      orders: PaperOrder[]
      /** Every visible fill, including entries for positions still open. */
      fills: LiveFill[]
      /** Finished round trips, newest first — what the Journal tab draws. */
      trades: LiveTrade[]
      smartOrders: SmartOrder[]
      /** Each live wallet's name, for the Wallet column. */
      wallets: { id: string; label: string }[]
      unreachable: string[]
    }> => {
      const wallets = await listWallets(context.user.id)
      const portfolio = await loadLivePortfolio(context.user.id, wallets)
      const liveWallets = wallets.filter((wallet) => wallet.kind === "live")
      return {
        ...portfolio,
        smartOrders: await listActiveSmartOrders(
          context.user.id,
          liveWallets.map((wallet) => wallet.id)
        ),
        wallets: liveWallets.map((wallet) => ({ id: wallet.id, label: wallet.label })),
      }
    }
  )

const placeLiveOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(placeSchema)
  .handler(async ({ data, context }): Promise<{ outcome: PlaceOrderOutcome }> => {
    return { outcome: await placeOrderRow(context.user.id, data) }
  })

const cancelLiveOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(cancelSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: true }> => {
    await cancelOrderRow(context.user.id, data)
    return { cancelled: true }
  })

const setLiveBracketsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(bracketsSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await setBracketsRow(context.user.id, data)
    return { saved: true }
  })

const closeLivePositionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(positionSchema)
  .handler(async ({ data, context }): Promise<{ closed: true }> => {
    await closePositionRow(context.user.id, data)
    return { closed: true }
  })

/**
 * Takes one finished trade off the Journal, by hiding the fills behind it.
 *
 * The trade itself is not stored anywhere — it is worked out from its fills —
 * so its fill ids are what comes in. Hidden rather than deleted because the
 * sweep would fetch a deleted fill straight back.
 */
const hideLiveTradeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      walletId: z.string().max(36),
      fillIds: z.array(z.string().max(40)).min(1).max(200),
    })
  )
  .handler(async ({ data, context }): Promise<{ hidden: true }> => {
    await hideTradeRows(context.user.id, data.walletId, data.fillIds)
    return { hidden: true }
  })

export function loadLiveTrading() {
  return loadLiveTradingFn()
}

export function placeLiveOrder(input: z.infer<typeof placeSchema>) {
  return placeLiveOrderFn({ data: input })
}

export function cancelLiveOrder(input: z.infer<typeof cancelSchema>) {
  return cancelLiveOrderFn({ data: input })
}

export function setLiveBrackets(input: z.infer<typeof bracketsSchema>) {
  return setLiveBracketsFn({ data: input })
}

export function closeLivePosition(walletId: string, marketKey: string) {
  return closeLivePositionFn({ data: { walletId, marketKey } })
}

const LIVE_SENTENCES: Record<string, string> = {
  LIVE_WALLET_NOT_FOUND:
    "That wallet is not there any more — it may have been deleted in another tab.",
  LIVE_WALLET_KIND: "Only a live wallet trades this way.",
  LIVE_WALLET_KEY:
    "This wallet has no trading key saved. Open its settings and add one.",
  WALLET_INACTIVE: "Make this wallet active before placing a new order.",
  LIVE_MARKET: "That market is not one this wallet can trade.",
  LIVE_NETWORK_MISMATCH:
    "This wallet and this chart are on different networks — a test-network wallet cannot trade a real-money market, or the reverse.",
  LIVE_MAINNET_OFF:
    "Real-money trading is switched off on this server. It stays off until the funded test run passes and TRADE_ENABLE_MAINNET is deliberately set.",
  LIVE_NO_PRICE:
    "Hyperliquid would not give a price for that market, so nothing was sent.",
  LIVE_UNLISTED: "Hyperliquid does not list that market for orders.",
  LIVE_TAKE_PROFIT_SIDE:
    "A take profit has to be where the trade wins — above the entry on a long, below it on a short.",
  LIVE_STOP_SIDE:
    "A stop must stay beyond the current price — below it on a long, above it on a short.",
  LIVE_SIZE: "That size is smaller than this market's smallest step.",
  LIVE_PRICE: "That price cannot be used. Pick a level on the chart again.",
  LIVE_ORDER_ID: "That order id is not one the exchange would recognise.",
  LIVE_ORDER_GONE:
    "That order is not on the exchange any more — it may have filled or been cancelled elsewhere.",
  LIVE_POSITION_GONE: "That position is not on the exchange any more.",
  LIVE_UNREADABLE:
    "Hyperliquid answered with figures that could not be read, so nothing was done.",
  SECRET_UNREADABLE:
    "The stored trading key could not be unlocked on this server. Open the wallet's settings and paste the key again.",
  ENCRYPTION_NOT_CONFIGURED:
    "Secret storage is not set up on this server. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
}

/** A couple of exchange phrasings rewritten where the raw words mislead. */
function humanizeExchangeReason(reason: string): string {
  if (/insufficient margin/i.test(reason)) {
    return "Not enough free cash on the exchange for that order — margin held by resting orders counts against it too."
  }
  return reason
}

/**
 * A journal row's note as the reader should see it. Refusals the rails wrote
 * are stored as bare codes; those become their sentences here. Everything
 * else — exchange prose, the app's own sentences — passes through untouched.
 */
export function hideLiveTrade(walletId: string, fillIds: string[]) {
  return hideLiveTradeFn({ data: { walletId, fillIds } })
}

export function getLiveErrorMessage(error: unknown): string {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : ""
  const auth = describeAuthError(message)
  if (auth) return auth
  const known = Object.keys(LIVE_SENTENCES).find((code) => message.includes(code))
  if (known) return LIVE_SENTENCES[known]
  // The exchange's own refusal, already scrubbed server-side. Shown because
  // with real money the reason IS the answer.
  const exchange = message.match(/LIVE_(?:EXCHANGE|ORDER_REFUSED):(.*)$/s)
  if (exchange) return humanizeExchangeReason(exchange[1].trim())
  const gone = message.match(/LIVE_BRACKETS_GONE:(.*)$/s)
  if (gone) {
    return `The old stop and target were removed but the new ones were refused (${humanizeExchangeReason(gone[1].trim())}). The position is UNPROTECTED — set them again now.`
  }
  return "That did not go through. Try it again."
}
