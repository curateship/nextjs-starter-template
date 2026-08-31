import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  KNOWN_PROTOCOLS,
  parseMarketKey,
  protocolLabel,
  type PlaceOrderOutcome,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import type { PollScope } from "@/lib/api/trade/paper"
import type { LiveRefusal } from "@/lib/trade/live"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"
import { orderIdSchema } from "@/lib/trade/order-id"
import type { SmartOrder } from "@/lib/trade/smart-plan"
import {
  isMarketable,
  type TradeOrder,
  type TradePosition,
} from "@/lib/trade/paper"
import { getProtocol } from "@/server/protocols/registry"
import { formatUsd } from "@/lib/trade/format"
import { userGet, userPost } from "@/server/guards"
import {
  cancelLiveOrder as cancelOrderRow,
  closeLivePosition as closePositionRow,
  loadLivePortfolio,
  placeLiveOrder as placeOrderRow,
  setLiveBrackets as setBracketsRow,
  moveLiveOrder as moveOrderRow,
  changeLiveLeverage as changeLeverageRow,
  changeLiveMargin as changeMarginRow,
} from "@/server/trade/live-orders"
import {
  hideLiveTrade as hideTradeRows,
  loadLiveHistoryBefore,
} from "@/server/trade/live-fills"
import { closeLivePositions as closePositionRows } from "@/server/trade/close-live-positions"
import { loadOrderStyle } from "@/server/trade/prefs"
import { runLiveOrderAction } from "@/server/trade/order-rate-limit"
import {
  listActiveSmartOrdersIfChanged,
  placeWatchOrder,
} from "@/server/trade/smart-orders"
import {
  findWallet,
  listWallets,
  listWalletsWithCredentials,
} from "@/server/trade/wallets"

import { describeAuthError } from "../error-message"

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
  orderId: orderIdSchema,
  side: z.enum(["buy", "sell"]).optional(),
  px: z.number().positive().finite().optional(),
  sz: z.number().positive().finite().optional(),
})

const targetSchema = z.object({
  px: z.number().positive().finite(),
  sz: z.number().positive().finite().nullable(),
})

const bracketsSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
  targets: z.array(targetSchema).max(3),
  slPx: z.number().positive().finite().nullable(),
})

const positionSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
})

/** The same scope the paper poll takes — see `PollScope` in `paper.ts`. */
const pollScopeSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS).optional(),
  /** The stamp of the Journal the browser holds — same idea, for fills. */
  journalStamp: z.string().max(200).optional(),
  /**
   * The stamp that came back with the smart orders the browser holds. When
   * nothing has changed since, the answer says so instead of carrying every
   * ladder's plan again — see `activeSmartOrdersStamp`.
   */
  smartOrdersStamp: z.string().max(200).optional(),
  /**
   * Whether the Journal is actually on screen.
   *
   * The Journal is history: it changes only when a fill lands, and nobody is
   * reading it while another tab is showing. Keeping it up to date anyway
   * meant asking the exchange for a trade history every half minute, forever,
   * on a venue that allows sixty requests a minute in total. When this is
   * false the sweep is skipped — except for a wallet that has just filled,
   * which is read whatever tab is open so the notice and the row agree.
   */
  journalOpen: z.boolean().optional(),
})

const loadLiveTradingFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(pollScopeSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      positions: TradePosition[]
      orders: TradeOrder[]
      /** Every visible fill, including entries for positions still open. */
      fills: LiveFill[]
      /** Finished round trips, newest first — what the Journal tab draws. */
      trades: LiveTrade[]
      nextBefore: number | null
      /** True when the Journal is the browser's own, unchanged. */
      journalUnchanged: boolean
      journalStamp: string
      /** `null` means "the ones you already hold" — see the stamp. */
      smartOrders: SmartOrder[] | null
      smartOrdersStamp: string
      /** Each live wallet's name, for the Wallet column. */
      wallets: { id: string; label: string }[]
      /** The last refusal on each market, so a stuck level can say why. */
      refusals: LiveRefusal[]
      unreachable: string[]
    }> => {
      const read = await listWalletsWithCredentials(context.user.id)
      const wallets = read.wallets.filter(
        (wallet) =>
          data.protocol === undefined || wallet.protocol === data.protocol
      )
      const liveWallets = wallets.filter((wallet) => wallet.kind === "live")
      // The exchange read and the smart-order read do not depend on each
      // other, so they go out together.
      const [portfolio, smart] = await Promise.all([
        loadLivePortfolio(context.user.id, wallets, {
          journalStamp: data.journalStamp,
          journalOpen: data.journalOpen ?? false,
          credentials: read.credentials,
        }),
        listActiveSmartOrdersIfChanged(
          context.user.id,
          liveWallets.map((wallet) => wallet.id),
          data.smartOrdersStamp
        ),
      ])
      return {
        ...portfolio,
        smartOrders: smart.smartOrders,
        smartOrdersStamp: smart.stamp,
        wallets: liveWallets.map((wallet) => ({
          id: wallet.id,
          label: wallet.label,
        })),
      }
    }
  )

const loadOlderLiveTradesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ before: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    const wallets = (await listWallets(context.user.id)).filter(
      (wallet) => wallet.kind === "live"
    )
    const { trades, nextBefore } = await loadLiveHistoryBefore(
      context.user.id,
      wallets.map((wallet) => wallet.id),
      data.before
    )
    return { trades, nextBefore }
  })

const placeLiveOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(placeSchema)
  .handler(
    async ({ data, context }): Promise<{ outcome: PlaceOrderOutcome }> => {
      // Started before the rate-limit check rather than after it: the two
      // reads do not depend on each other, and one behind the other they were
      // two waits where one would do. The catch keeps a rate-limited request
      // from leaving an unhandled refusal behind; the await below still
      // surfaces a real failure.
      const style = loadOrderStyle(context.user.id)
      style.catch(() => undefined)
      return await runLiveOrderAction(context.user.id, "order", async () => {
        // Watched rather than rested, when that is what the account is set to.
        // Nothing reaches the exchange until the price is actually there, so the
        // answer here is "it is waiting", the same shape a resting order gives.
        if ((await style) === "watch") {
          const wallet = await findWallet(context.user.id, data.walletId)
          if (!wallet) throw new Error("LIVE_WALLET")
          // A click at a price the market is already through is not a level
          // to wait at — it is this order, now, and the engine's next pass
          // would only fire it at market a few seconds later. Firing it in
          // the same call takes those seconds out of every marketable
          // click, through the exact door the engine uses: `marketOnly`
          // with the level as its guard, so a quote that slipped away
          // between the two reads refuses the fire and the click becomes
          // the watch it always was.
          if (wallet.kind === "live") {
            const ref = parseMarketKey(data.marketKey)
            const protocol = getProtocol(wallet.protocol)
            const mark = ref
              ? (
                  await protocol.markets.prices(wallet.network, [ref.marketId])
                ).get(ref.marketId)
              : undefined
            if (mark !== undefined && isMarketable(data.side, data.px, mark)) {
              try {
                return {
                  outcome: await placeOrderRow(context.user.id, {
                    ...data,
                    marketOnly: true,
                    marketGuardPx: data.px,
                  }),
                }
              } catch (error) {
                if (!(
                  error instanceof Error &&
                  error.message === "LIVE_SMART_ORDER_PRICE_MOVED"
                )) {
                  throw error
                }
              }
            }
          }
          await placeWatchOrder(context.user.id, wallet, data)
          return {
            outcome: {
              status: "resting",
              // No exchange order to name: there is not one yet, and the whole
              // point is that there will not be until the price is reached.
              orderId: null,
              avgPx: null,
              filledSz: null,
              // The stop and target travel with the watch and are handed to the
              // position it opens, so there is nothing to report on here.
              protection: null,
              protectionNote: null,
            },
          }
        }
        return { outcome: await placeOrderRow(context.user.id, data) }
      })
    }
  )

const moveSchema = z.object({
  walletId: z.string().max(36),
  marketKey: z.string().max(120),
  orderId: orderIdSchema,
  px: z.number().positive().finite(),
  // The rest of the order, from the row on screen — so the move is one
  // exchange call instead of a read and then a call. It is the user's own
  // order on their own account; the exchange checks the id belongs to them.
  side: z.enum(["buy", "sell"]),
  sz: z.number().positive().finite(),
  reduceOnly: z.boolean(),
})

const moveLiveOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(moveSchema)
  .handler(async ({ data, context }): Promise<{ moved: true }> => {
    return await runLiveOrderAction(context.user.id, "order", async () => {
      await moveOrderRow(context.user.id, data)
      return { moved: true }
    })
  })

const cancelLiveOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(cancelSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: true }> => {
    return await runLiveOrderAction(context.user.id, "cancel", async () => {
      await cancelOrderRow(context.user.id, data)
      return { cancelled: true }
    })
  })

const setLiveBracketsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(bracketsSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    return await runLiveOrderAction(context.user.id, "order", async () => {
      await setBracketsRow(context.user.id, data)
      return { saved: true }
    })
  })

/**
 * Changes the leverage on a position that is already open.
 *
 * The exchange is asked and nothing is written here: the row's leverage,
 * margin and liquidation price all come from the next portfolio read, so what
 * is on screen afterwards is the venue's own answer rather than what was
 * asked for.
 */
const changeLiveLeverageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    positionSchema.extend({
      leverage: z.number().int().min(1).max(200),
      positionSide: z.enum(["long", "short"]).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<{ asked: true }> => {
    return await runLiveOrderAction(context.user.id, "order", async () => {
      await changeLeverageRow(context.user.id, data)
      return { asked: true }
    })
  })

/**
 * Adds or takes back the cash behind one isolated position. Signed dollars:
 * negative takes margin out, which is refused when it would bring the
 * liquidation price inside the position's own stop.
 */
const changeLiveMarginFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    positionSchema.extend({
      dollars: z
        .number()
        .finite()
        .refine((value) => value !== 0, { message: "LIVE_MARGIN_NOTHING" }),
      positionSide: z.enum(["long", "short"]).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<{ asked: true }> => {
    return await runLiveOrderAction(context.user.id, "order", async () => {
      await changeMarginRow(context.user.id, data)
      return { asked: true }
    })
  })

const closeLivePositionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(positionSchema)
  .handler(async ({ data, context }): Promise<{ closed: true }> => {
    return await runLiveOrderAction(context.user.id, "order", async () => {
      await closePositionRow(context.user.id, data)
      return { closed: true }
    })
  })

const closeLivePositionsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ positions: z.array(positionSchema).min(1).max(50) })
  )
  .handler(
    async ({ data, context }): Promise<{ closed: number; refused: string[] }> =>
      await runLiveOrderAction(context.user.id, "order", () =>
        closePositionRows(context.user.id, data.positions)
      )
  )

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

export function moveLiveOrder(input: z.infer<typeof moveSchema>) {
  return moveLiveOrderFn({ data: input })
}

export function loadLiveTrading(scope: PollScope = {}) {
  return loadLiveTradingFn({ data: scope })
}

export function loadOlderLiveTrades(before: number) {
  return loadOlderLiveTradesFn({ data: { before } })
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

export function closeLivePositions(
  positions: { walletId: string; marketKey: string }[]
) {
  return closeLivePositionsFn({ data: { positions } })
}

export function changeLiveLeverage(input: {
  walletId: string
  marketKey: string
  leverage: number
  positionSide?: "long" | "short"
}) {
  return changeLiveLeverageFn({ data: input })
}

export function changeLiveMargin(input: {
  walletId: string
  marketKey: string
  dollars: number
  positionSide?: "long" | "short"
}) {
  return changeLiveMarginFn({ data: input })
}

const LIVE_SENTENCES: Record<string, string> = {
  TRADE_ORDER_RATE_LIMITED:
    "The app is sending orders too fast. Try again in a moment.",
  LIVE_WALLET_NOT_FOUND:
    "That wallet is not there any more — it may have been deleted in another tab.",
  LIVE_WALLET_KIND: "Only a live wallet trades this way.",
  LIVE_WALLET_KEY:
    "This wallet has no trading key saved. Open its settings and add one.",
  WALLET_INACTIVE: "Make this wallet active before placing a new order.",
  LIVE_MARKET: "That market is not one this wallet can trade.",
  SMART_LADDER_EXISTS:
    "This market already has a ladder, grid or watched price in that wallet. There can only be one of them per market — cancel it before setting another.",
  LIVE_WALLET: "That wallet is not there any more.",
  LIVE_NETWORK_MISMATCH:
    "This wallet and this chart are on different networks — a test-network wallet cannot trade a real-money market, or the reverse.",
  LIVE_MAINNET_OFF:
    "Real-money trading is switched off on this server. Turn it on in Settings before placing a live order.",
  LIVE_NO_PRICE:
    "The exchange would not give a price for that market, so nothing was sent.",
  LIVE_UNLISTED: "The exchange does not list that market for orders.",
  LIVE_TAKE_PROFIT_SIDE:
    "A take profit has to be where the trade wins — above the entry on a long, below it on a short.",
  LIVE_TAKE_PROFIT_SIZE:
    "The take profit cannot sell more than the position holds.",
  LIVE_TAKE_PROFIT_COUNT: "A position can have no more than three targets.",
  LIVE_TAKE_PROFIT_LIST_SIZE:
    "Each target needs its own size when a position has more than one target.",
  LIVE_STOP_SIDE:
    "A stop must stay beyond the current price — below it on a long, above it on a short.",
  LIVE_STOP_SIZE: "The stop cannot sell more than the position holds.",
  LIVE_SIZED_STOP_UNSUPPORTED:
    "This exchange cannot hold a stop that sells only part of the position, so nothing was placed.",
  SMART_PAIR_LIVE_ONLY:
    "A grid and a ladder can share a coin on a live wallet only — a practice wallet can hold one stop per position and cannot play the handoff honestly.",
  SMART_PAIR_PROTOCOL:
    "This exchange cannot hold the grid's own part-size stop beside the ladder's, so the pairing is refused here. It works on Hyperliquid, Aster and KuCoin.",
  SMART_PAIR_GRID_STOP_REQUIRED:
    "To share a coin with a ladder the grid needs a stop — the stop is what hands the coin over to the ladder on the way down.",
  SMART_PAIR_GRID_STOP_BASE:
    "A stop riding the 4h base can move down later, below where the ladder starts buying. Give the grid a plain percent or fixed stop to pair it with a ladder.",
  SMART_PAIR_STOP_BELOW_BASE:
    "The grid's stop must sit above the price where the ladder starts buying — that ordering is what makes the pairing safe, so it is refused, not warned about.",
  LIVE_SIZE: "That size is smaller than this market's smallest step.",
  LIVE_PRICE: "That price cannot be used. Pick a level on the chart again.",
  LIVE_ORDER_ID: "That order id is not one the exchange would recognise.",
  LIVE_ORDER_GONE:
    "That order is not on the exchange any more — it may have filled or been cancelled elsewhere.",
  LIVE_POSITION_GONE: "That position is not on the exchange any more.",
  LIVE_LEVERAGE_UNSUPPORTED:
    "This exchange cannot change leverage on a position that is already open.",
  LIVE_MARGIN_UNSUPPORTED:
    "This exchange cannot add or take back the cash behind one position.",
  LIVE_MARGIN_NOTHING:
    "Type how much margin to add or take back. Zero changes nothing.",
  LIVE_UNREADABLE:
    "The exchange answered with figures that could not be read, so nothing was done.",
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
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  const auth = describeAuthError(message)
  if (auth) return auth
  const busy = message.match(/EXCHANGE_BUSY(?::(spent .+))?$/s)
  if (busy) {
    return busy[1]
      ? `The exchange could not answer because Trade had ${busy[1].trim()}. Wait for the minute to roll over, then close again.`
      : "The exchange could not answer the close right now. Wait a moment, then close again."
  }
  const targetTotal = message.match(/LIVE_TAKE_PROFIT_TOTAL:([^:]+):([^:]+)/)
  if (targetTotal) {
    return `The targets add up to ${formatUsd(Number(targetTotal[1]))}, but the position holds ${formatUsd(Number(targetTotal[2]))}. Lower one or more target sizes.`
  }
  const stopTotal = message.match(/LIVE_STOP_TOTAL:([^:]+):([^:]+)/)
  if (stopTotal) {
    return `The stop would sell ${formatUsd(Number(stopTotal[1]))}, but the position holds ${formatUsd(Number(stopTotal[2]))}. Lower the stop's size.`
  }
  const bracketReplacement = message.match(
    /LIVE_BRACKET_REPLACE_(?:PARTIAL|DOUBLED):(.*)$/s
  )
  if (bracketReplacement) return bracketReplacement[1].trim()
  const known = Object.keys(LIVE_SENTENCES).find((code) =>
    message.includes(code)
  )
  if (known) return LIVE_SENTENCES[known]
  // A move on a venue with no amend command. Both endings carry their whole
  // sentence from the rails, because what to do next differs: one says the
  // order never moved, the other says two of them are resting.
  const move = message.match(/LIVE_MOVE_(?:REFUSED|DOUBLED):(.*)$/s)
  if (move) return move[1].trim()
  const tooSmall = message.match(/LIVE_ORDER_TOO_SMALL:(.*)$/s)
  if (tooSmall) return tooSmall[1].trim()
  const setting = message.match(/LIVE_(?:LEVERAGE|MARGIN_MODE):(.*)$/s)
  if (setting) return setting[1].trim()
  // The rails' own refusals about leverage and margin on an open position.
  // Each carries its whole sentence because each names figures — the cap this
  // market allows, what the position is holding, where liquidation would land
  // against the stop — and a fixed sentence could not say any of them.
  const holding = message.match(
    /LIVE_(?:LEVERAGE_TOO_HIGH|MARGIN_TOO_MUCH|MARGIN_PAST_STOP):(.*)$/s
  )
  if (holding) return holding[1].trim()
  // The exchange's own refusal, already scrubbed server-side. Shown because
  // with real money the reason IS the answer.
  const exchange = message.match(/LIVE_(?:EXCHANGE|ORDER_REFUSED):(.*)$/s)
  if (exchange) return humanizeExchangeReason(exchange[1].trim())
  // The stop went on and only the target was refused. Said apart from the
  // sentence below because "UNPROTECTED" is the wrong word for a position
  // that is standing there with its stop.
  const targetGone = message.match(/LIVE_TARGET_GONE:(.*)$/s)
  if (targetGone) {
    return `The stop is on, but the new take profit was refused (${humanizeExchangeReason(targetGone[1].trim())}). The position has no target — set it again.`
  }
  const gone = message.match(/LIVE_BRACKETS_GONE:(.*)$/s)
  if (gone) {
    return `The old stop and target were removed but the new ones were refused (${humanizeExchangeReason(gone[1].trim())}). The position is UNPROTECTED — set them again now.`
  }
  /**
   * An exchange this app can hold a wallet on but cannot yet trade.
   *
   * **"Try it again" is the wrong thing to say here**, because trying again
   * can never work, and it is said on a screen about real money. The venue is
   * named from the id the refusal carries rather than compared against, so
   * this stays true for whichever exchange is next.
   */
  const noOrders = message.match(/PROTOCOL_NO_ORDERS:([a-z]+)/)
  if (noOrders) {
    const id = noOrders[1] as ProtocolId
    const named = KNOWN_PROTOCOLS.includes(id)
      ? protocolLabel(id)
      : "This exchange"
    return `Trade cannot place ${named} orders yet — the wallet is connected and its positions are readable, but ordering is still being built. Use ${named}'s own site to trade for now.`
  }
  return "That did not go through. Try it again."
}
