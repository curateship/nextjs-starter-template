import { randomUUID } from "node:crypto"

import { and, desc, eq, inArray, sql } from "drizzle-orm"

import {
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
  type NetworkId,
  type ProtocolId,
  type WalletAccountFigures,
} from "@/lib/protocols/contracts"
import {
  applyPaperFill,
  bracketsTie,
  candleLegs,
  capReduceOnly,
  defaultPaperCosts,
  isMarketable,
  liquidationPx,
  nextEventOnLeg,
  paperAccountFigures,
  positionMargin,
  positionProfit,
  slippedPx,
  type PaperFillReason,
  type PaperJournalEntry,
  type PaperCosts,
  type PaperOrder,
  type PaperPosition,
  type PaperSide,
} from "@/lib/trade/paper"
import {
  buildLiveTrades,
  fillsOutsideTrades,
  type LiveFill,
  type LiveTrade,
  type LiveTradeEnding,
  type LiveTriggerKind,
} from "@/lib/trade/live-trades"
import {
  canOpenAnother,
  type EntryLimit,
} from "@/lib/trade/entry-limit"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { marketRules } from "@/server/trade/market-rules"
import {
  tradePaperJournal,
  tradePaperOrders,
  tradePaperPositions,
  tradePaperState,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"
import {
  advanceLadders,
  ladderBarsKey,
  ladderCandleNeeds,
  type LadderBars,
} from "./smart-ladders"

/**
 * The practice trading engine: what a paper wallet does when price moves.
 *
 * Nothing runs in the background. Reading an account settles it first — the
 * price that happened since the last look is replayed, in order, and anything
 * it should have triggered is triggered before a single figure is reported.
 * That is what lets a wallet nobody watched for a day still tell the truth the
 * moment somebody opens it, and it is why there is no worker to keep alive.
 *
 * Settling is in two halves, and they cover different gaps:
 *
 * - **The candles**, for time that has properly passed. Each bar is walked as
 *   a path — see `candleLegs` — and everything the path runs into happens in
 *   the order it was reached. Only fetched when a bar could have completed.
 * - **The price right now**, every single time. Any level already on the wrong
 *   side of it has plainly been passed, so it fires. This needs no history at
 *   all, which is what makes a four-second poll cheap and still exact.
 *
 * Both halves are safe to run twice. A bar only applies to a position or order
 * that already existed when the bar opened, and a level checked against today's
 * price either fires now or was never reached — so a settle that runs again
 * changes nothing, which matters because two browser tabs will do exactly that.
 *
 * Failures are thrown as bare codes ("PAPER_MARGIN"); the API layer owns the
 * sentences, the same split the rest of this app uses.
 */

/** Practice wallets stay a hand-made thing: enough orders to work, not a fleet. */
export const MAX_OPEN_ORDERS = 50

/** Below this the engine will not open anything — a dust order is a mistake. */
const MIN_ORDER_VALUE_USD = 0.01

/**
 * How stale the watermark has to be before candles are worth fetching. Below
 * one minute not even the finest bar has closed, so the price-right-now half
 * has already covered every moment of it.
 */
const CATCH_UP_AFTER_MS = 60_000

/** How many bars the exchange hands over in one read. */
const CANDLE_LIMIT = 500

const CATCH_UP_STEPS: { interval: CandleInterval; ms: number }[] = [
  { interval: "1m", ms: 60_000 },
  { interval: "5m", ms: 300_000 },
  { interval: "15m", ms: 900_000 },
  { interval: "1h", ms: 3_600_000 },
  { interval: "4h", ms: 14_400_000 },
  { interval: "1d", ms: 86_400_000 },
]

/** The finest timeframe that can cover this much time in one read. */
function catchUpStep(gapMs: number): { interval: CandleInterval; ms: number } {
  return (
    CATCH_UP_STEPS.find((step) => gapMs <= step.ms * CANDLE_LIMIT) ??
    CATCH_UP_STEPS[CATCH_UP_STEPS.length - 1]
  )
}

// ----- Rows in, shapes out ----------------------------------------------

type PositionRow = typeof tradePaperPositions.$inferSelect
type OrderRow = typeof tradePaperOrders.$inferSelect
type JournalRow = typeof tradePaperJournal.$inferSelect

function toPosition(row: PositionRow): PaperPosition {
  return {
    id: row.id,
    walletId: row.walletId,
    marketKey: row.marketKey,
    szi: row.szi,
    entryPx: row.entryPx,
    leverage: row.leverage,
    maxLeverage: row.maxLeverage,
    tpPx: row.tpPx,
    slPx: row.slPx,
    feesPaid: row.feesPaid,
    updatedAt: row.updatedAt.getTime(),
  }
}

function toOrder(row: OrderRow): PaperOrder {
  return {
    id: row.id,
    walletId: row.walletId,
    marketKey: row.marketKey,
    side: row.side,
    px: row.px,
    sz: row.sz,
    leverage: row.leverage,
    maxLeverage: row.maxLeverage,
    reduceOnly: row.reduceOnly,
    tpPx: row.tpPx,
    slPx: row.slPx,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

/** Practice fills need no order lookup, so the map they are built with is empty. */
const NO_TRIGGERS = new Map<string, { kind: LiveTriggerKind; px: number | null }>()

// ----- The wallet as the engine holds it --------------------------------

/**
 * One wallet mid-settlement: what it holds, what it has asked for, and what
 * has changed so far. Everything happens here in memory and is written once at
 * the end, so a half-applied candle can never reach the database.
 */
export type WalletBook = {
  wallet: TradeWallet
  /**
   * What trading costs this book. Filled with `defaultPaperCosts()` for a real
   * practice wallet, which is the exchange's own fees and no slippage — the
   * same arithmetic, to the penny, as when these were read off the two
   * constants directly.
   *
   * On the book rather than read from the constants because a backtest is
   * allowed to ask "what if it cost more?", and the answer has to reach every
   * fill without a second copy of the engine to keep in step.
   */
  costs: PaperCosts
  /** Starting balance plus everything banked — the cash the account has. */
  cash: number
  positions: Map<string, PaperPosition>
  orders: PaperOrder[]
  /** Fills to record, in the order they happened. */
  fills: PaperJournalEntry[]
  /** Markets whose position row must be rewritten or removed. */
  touchedMarkets: Set<string>
  /** Orders that filled or were cancelled by the engine. */
  goneOrderIds: Set<string>
  /**
   * How many coins this wallet may open in a stretch of time, and when it last
   * opened one. Null is off, which is every wallet that has not asked.
   *
   * On the BOOK rather than on a plan because the question is about the wallet:
   * forty-four separate ladders each opening one coin is the thing being
   * limited, and no single ladder can see the other forty-three.
   */
  entryLimit: EntryLimit | null
  /** Every moment this wallet went from flat to holding, oldest first. */
  openedAt: number[]
  /**
   * Markets liquidated inside the current pass.
   *
   * The ladder asks "did a liquidation just take my position?" to keep its
   * waiting rungs alive — and it used to read the answer off `fills`, which a
   * minute-walked candle drains every minute. The evidence vanished before
   * the question was asked, and the ladder died exactly where it was built to
   * survive. This set is cleared by whoever owns the pass, never by the
   * drain.
   */
  liquidatedThisPass: Set<string>
  /**
   * The whole market is falling off a cliff right now, and the least leverage
   * the exchange must allow on a coin before a NEW one may be opened while it
   * lasts. Null is off.
   *
   * On the book because it stops a FILL, and a fill does not go through a
   * ladder — the replay's rungs are orders its own wick fills. Set once a bar
   * by whoever knows the answer.
   */
  crashEntry: { cascading: boolean; leastLeverage: number | null }
  /**
   * Orders the engine itself put on the book — today only the exits that ride
   * on a rung's buy. Everything else here is written down when it is asked
   * for, so this is the one list that has to be saved after the fact.
   */
  addedOrders: PaperOrder[]
  /**
   * Bumped every time `orders` gains or loses one, so the answer to "is this
   * order still on the book?" can be worked out once and kept.
   *
   * **Anything that changes `orders` must change this too.** It is a counter
   * rather than a flag so nothing has to remember to clear it, and the six
   * places that touch the list all sit beside a `bumpOrders` call. `liveOrderIds`
   * is the only reader; `ordersMatchVersion` is the test that keeps them honest.
   */
  ordersVersion: number
  /**
   * What each market this book holds is worth right now.
   *
   * **Here so that free cash can mean what an exchange means by it.** Buying
   * power is the account's VALUE less the margin already posted, and the value
   * moves with every position that is down — cash alone does not, because cash
   * only changes when something closes. Without these prices a wallet whose
   * positions had halved still looked as though it had every dollar of its
   * cash to spend, and went on buying.
   *
   * A market with no price in here contributes nothing rather than a loss:
   * silence is not a fall.
   */
  marks: Map<string, number>
}

/** One order on or off the book. Every such change goes through here. */
export function bumpOrders(book: WalletBook): void {
  book.ordersVersion += 1
}

/**
 * Every order id on the book right now — worked out once per change, not once
 * per question.
 *
 * A ladder asks this to tell an order that FILLED from one that is still
 * waiting, and it is the single hottest question in the app. Each ladder asked
 * it four times, and each ask walked the whole book: on a replay of 500 coins
 * that is 500 ladders reading 5,500 orders, four times over, on every one of
 * 4,380 bars — about fifty billion reads, and the reason a big run took twenty
 * minutes rather than two.
 *
 * The list only changes when an order is placed or comes off, so the answer is
 * kept until that happens. On a quiet bar it is worked out no times at all.
 */
const liveIds = new WeakMap<
  WalletBook,
  { version: number; ids: ReadonlySet<string> }
>()

export function liveOrderIds(book: WalletBook): ReadonlySet<string> {
  const known = liveIds.get(book)
  if (known && known.version === book.ordersVersion) return known.ids
  const ids = new Set(book.orders.map((order) => order.id))
  liveIds.set(book, { version: book.ordersVersion, ids })
  return ids
}

/** The id an order's own exit carries, so the ladder can find it again. */
export function exitOrderIdOf(orderId: string): string {
  return `${orderId}:exit`
}

/** Everything written down; nothing left to save. */
function markSaved(book: WalletBook): void {
  book.fills = []
  book.touchedMarkets.clear()
  book.goneOrderIds.clear()
  book.addedOrders = []
}

/**
 * What is left to put behind a new trade: the account's value, less the margin
 * already posted.
 *
 * **Value, not cash.** A position sitting 40% down has not banked anything, so
 * the cash is untouched — and for a long time this said the wallet could still
 * spend it. On 13 June 2022 one replay held $12,460 of margin against a wallet
 * worth $9,273 and kept buying, which no exchange would have allowed: on
 * Hyperliquid the money available is the account value minus what is in use,
 * and the account value carries every open loss with it.
 *
 * Goes negative when the losses have eaten past the margin. That is a real
 * answer and the callers all read it as "no": every one of them compares the
 * cost of what it wants against this.
 */
export function freeCash(book: WalletBook): number {
  let held = 0
  let openProfit = 0
  for (const position of book.positions.values()) {
    held += positionMargin(position)
    const mark = book.marks.get(position.marketKey)
    if (mark !== undefined && mark > 0) {
      openProfit += positionProfit(position, mark)
    }
  }
  return book.cash + openProfit - held
}

/**
 * Puts one fill through the arithmetic and writes the result back into the
 * book — the single door every fill goes through, whether it came from a
 * candle, from the price right now, or from somebody pressing Close.
 */
export function fill(
  book: WalletBook,
  input: {
    marketKey: string
    side: PaperSide
    px: number
    sz: number
    feeRate: number
    leverage: number
    maxLeverage: number
    reason: PaperFillReason
    at: number
    /** Brackets to hand the position this fill opens, if it opens one. */
    brackets?: { tpPx: number | null; slPx: number | null }
    /** The order behind this fill, when there was one. */
    orderId?: string | null
  }
): void {
  const held = book.positions.get(input.marketKey) ?? null
  const outcome = applyPaperFill(held, {
    side: input.side,
    px: input.px,
    sz: input.sz,
    feeRate: input.feeRate,
    leverage: input.leverage,
    maxLeverage: input.maxLeverage,
  })

  if (!outcome.position) {
    book.positions.delete(input.marketKey)
  } else {
    const opened =
      !held || Math.sign(outcome.position.szi) !== Math.sign(held.szi)
    // A coin going from holding nothing to holding something. Adding to one
    // already held is not an entry — leaving room for exactly that is what the
    // limit is for.
    if (opened) book.openedAt.push(input.at)
    book.positions.set(input.marketKey, {
      // One row per market, so a turn-around reuses the slot it turned in.
      id: held?.id ?? randomUUID(),
      walletId: book.wallet.id,
      marketKey: input.marketKey,
      ...outcome.position,
      // A fill that opened a position takes the brackets the order carried;
      // one that added to a position leaves the ones already set alone.
      tpPx: opened ? (input.brackets?.tpPx ?? null) : outcome.position.tpPx,
      slPx: opened ? (input.brackets?.slPx ?? null) : outcome.position.slPx,
      updatedAt: input.at,
    })
  }

  book.cash += outcome.closedPnl - outcome.fee
  book.fills.push({
    id: randomUUID(),
    walletId: book.wallet.id,
    marketKey: input.marketKey,
    side: input.side,
    px: input.px,
    sz: input.sz,
    fee: outcome.fee,
    closedPnl: outcome.closedPnl,
    reason: input.reason,
    fillTime: input.at,
    orderId: input.orderId ?? null,
  })
  book.touchedMarkets.add(input.marketKey)
  if (input.reason === "liquidated") {
    book.liquidatedThisPass.add(input.marketKey)
  }
}

function dropOrder(book: WalletBook, orderId: string): void {
  book.orders = book.orders.filter((order) => order.id !== orderId)
  bumpOrders(book)
  book.goneOrderIds.add(orderId)
}

/**
 * A waiting order reaching its price.
 *
 * Two things can still stop it. A reduce-only order with nothing left to
 * reduce is cancelled rather than turned into a new position the other way,
 * and an opening order the account can no longer afford is cancelled rather
 * than filled — waiting orders hold no margin aside, so by the time one fills
 * the cash may be somewhere else.
 */
function fillOrder(
  book: WalletBook,
  order: PaperOrder,
  input: {
    px: number
    feeRate: number
    at: number
    /**
     * Whether this fill takes what is there rather than waiting for somebody to
     * come to it. A taker fill pays the book's slippage; an order that sat and
     * waited gets the price it asked for.
     */
    slip?: boolean
    }
): void {
  const held = book.positions.get(order.marketKey) ?? null
  let sz = order.sz

  if (order.reduceOnly) {
    const capped = capReduceOnly(held, order.side, order.sz)
    if (capped === null || capped <= 0) {
      dropOrder(book, order.id)
      return
    }
    sz = capped
  } else if (
    !book.positions.has(order.marketKey) &&
    book.crashEntry.cascading &&
    book.crashEntry.leastLeverage !== null &&
    order.maxLeverage < book.crashEntry.leastLeverage
  ) {
    // Mid-crash, and the exchange does not give this coin enough room. Opening
    // it now buys a position that gets closed out before the rung below it can
    // buy. Left resting: the moment the crash rule lets go, it is an ordinary
    // coin again and this rung buys as it always would.
    return
  } else if (
    !book.positions.has(order.marketKey) &&
    !canOpenAnother(book.entryLimit, book.openedAt, input.at)
  ) {
    // The wallet has opened its allowance of coins for now. The order is left
    // exactly where it is rather than dropped: the level has not stopped being
    // worth buying, the wallet has run out of room for NEW coins, and room
    // comes back on its own as the window moves.
    return
  } else if ((input.px * sz) / order.leverage > freeCash(book) + 1e-9) {
    dropOrder(book, order.id)
    return
  }

  fill(book, {
    marketKey: order.marketKey,
    side: order.side,
    px: input.slip
      ? slippedPx(input.px, order.side, book.costs.slippageRate)
      : input.px,
    sz,
    feeRate: input.feeRate,
    leverage: order.leverage,
    maxLeverage: order.maxLeverage,
    reason: "order",
    at: input.at,
    brackets: { tpPx: order.tpPx, slPx: order.slPx },
    orderId: order.id,
  })

  // The exit goes on the book here, not after the candle finishes — see
  // `exitPx`. It is stamped with the buy's own time so the same candle walk
  // can reach it, and that walk only ever looks at prices AHEAD of where the
  // buy filled, so it can never sell into the move that bought it.
  if (!order.reduceOnly && order.exitPx !== null && order.exitPx !== undefined) {
    if (order.exitPx > 0) {
      const exit: PaperOrder = {
        id: exitOrderIdOf(order.id),
        walletId: order.walletId,
        marketKey: order.marketKey,
        side: order.side === "buy" ? "sell" : "buy",
        px: order.exitPx,
        sz,
        leverage: order.leverage,
        maxLeverage: order.maxLeverage,
        reduceOnly: true,
        tpPx: null,
        slPx: null,
        exitPx: null,
        createdAt: order.updatedAt,
        updatedAt: order.updatedAt,
      }
      book.orders.push(exit)
      bumpOrders(book)
      book.addedOrders.push(exit)
    }
  }

  dropOrder(book, order.id)
}

/** Closing the whole of a position at one price. */
function closeAt(
  book: WalletBook,
  position: PaperPosition,
  input: {
    px: number
    feeRate: number
    reason: PaperFillReason
    at: number
    /** A stop or a liquidation takes what is there, so it pays slippage. */
    slip?: boolean
  }
): void {
  const side: PaperSide = position.szi > 0 ? "sell" : "buy"
  fill(book, {
    marketKey: position.marketKey,
    side,
    px: input.slip ? slippedPx(input.px, side, book.costs.slippageRate) : input.px,
    sz: Math.abs(position.szi),
    feeRate: input.feeRate,
    leverage: position.leverage,
    maxLeverage: position.maxLeverage,
    reason: input.reason,
    at: input.at,
  })
}

// ----- Replaying one market ---------------------------------------------

/** The worse of two prices for whoever holds this position. */
function worseOf(szi: number, a: number, b: number): number {
  return szi > 0 ? Math.min(a, b) : Math.max(a, b)
}

/**
 * The levels today's price has plainly already gone past, nearest to the entry
 * first — the order price would have met them coming away from the trade.
 *
 * A stop set inside the liquidation price is reached first and takes the
 * trade; a stop set beyond it never gets the chance, because the position was
 * already gone. Reading them in this order is what tells those two apart.
 */
function passedLevels(
  position: PaperPosition,
  mark: number
): { reason: PaperFillReason; px: number }[] {
  const long = position.szi > 0
  const through = (level: number) => (long ? mark <= level : mark >= level)
  const levels: { reason: PaperFillReason; px: number }[] = []

  const liq = liquidationPx(position)
  if (liq !== null && through(liq)) levels.push({ reason: "liquidated", px: liq })
  if (position.slPx !== null && through(position.slPx)) {
    levels.push({ reason: "stop_loss", px: position.slPx })
  }
  if (position.tpPx !== null && (long ? mark >= position.tpPx : mark <= position.tpPx)) {
    levels.push({ reason: "take_profit", px: position.tpPx })
  }

  return levels.sort((a, b) =>
    Math.abs(a.px - position.entryPx) - Math.abs(b.px - position.entryPx)
  )
}

/**
 * Walks the candles of one market, then checks the price right now. Everything
 * that should have happened to this wallet in this market happens here.
 *
 * Exported because a backtest is exactly this, over and over: hand it a book in
 * memory, a bar, and **no price right now**, and it becomes a candles-only
 * replay. That is the whole seam — the tested ladder and the practice one are
 * the same code, so they cannot drift into two strategies with one name.
 */
/**
 * The bar is starting on every coin: value the book at the worst each of them
 * gets to inside it.
 *
 * **Because a crash is not one coin at a time.** The replay walks coins in
 * turn, so while coin one is filling rungs the other sixty-six are still
 * valued where they closed yesterday — a wallet that looks untouched while the
 * whole market is falling through it. That is how $125,274 of coin was bought
 * on a wallet worth $10,151 on 10 October 2025.
 *
 * A long is valued at the bar's low, which is the price it demonstrably had to
 * live through. It is the conservative reading on purpose: what a run may
 * spend has to survive the worst moment of the bar, not the best.
 */
export function openBar(
  book: WalletBook,
  lows: ReadonlyMap<string, number>
): void {
  for (const [marketKey, low] of lows) {
    if (low > 0) book.marks.set(marketKey, low)
  }
}

/**
 * The bar is over on every coin: this is what they are all worth now.
 *
 * Called once the whole list has been walked, so nothing inside the bar was
 * ever valued at a price the bar only reached later. See `settleMarket`.
 */
export function closeBar(
  book: WalletBook,
  closes: ReadonlyMap<string, number>
): void {
  for (const [marketKey, close] of closes) {
    if (close > 0) book.marks.set(marketKey, close)
  }
}

export function settleMarket(
  book: WalletBook,
  marketKey: string,
  input: { bars: CandleBar[]; barMs: number; mark: number | null; now: number }
): void {
  // What this market is worth, kept on the book so free cash can see what the
  // positions are down.
  //
  // **Never the bar being walked.** A bar is not a moment: on 10 October 2025
  // coins fell 80% and came back inside one four-hour candle, and marking the
  // book at that candle's CLOSE while its own wick was still filling rungs
  // turned the recovery into buying power for the next coin's rungs — 208 of
  // them across 67 coins in a single bar, on a wallet holding $10,151. The
  // price a trade inside this bar may be valued against is the last one that
  // had finished happening.
  for (const bar of input.bars) {
    const barOpen = bar.openTime
    // Anything created after the bar opened is left out of it: part of that
    // bar happened before the order existed, and filling on price that
    // predates an order would be an invention. It gets the next bar, and the
    // price right now, which is where it would have been caught anyway.
    const settled = (updatedAt: number) => updatedAt <= barOpen
    // A fill inside a bar is stamped at the bar's close: it happened somewhere
    // in there, and the close is the only moment it had definitely happened by.
    const at = barOpen + input.barMs

    for (const leg of candleLegs(bar)) {
      let reached = leg.from
      // Every pass either fills an order or closes the position, and both are
      // finite. The cap is a backstop, not a rule.
      for (let step = 0; step < MAX_OPEN_ORDERS + 2; step += 1) {
        const held = book.positions.get(marketKey) ?? null
        // A position is liable from the moment it exists — including a
        // position this very bar has just opened or added to.
        //
        // It used to be held to the same "existed before the bar" test as an
        // order, and that is wrong for a position in a way it is not for an
        // order. An order must not fill on price that predates it. A position
        // that exists NOW is exposed to every price the bar has left to go,
        // and the leg is walked in price order, so what remains is exactly the
        // price it has not met yet.
        //
        // What the old test did was make a ladder un-liquidatable during the
        // crash that built it. HEI bought seven rungs down the 10 Oct 2025
        // candle, from 0.22376 to 0.02481, while its liquidation price fell
        // from 0.18647 to 0.02803 — it traded through its own floor three
        // rungs before the end and nothing closed it, because every one of
        // those fills was stamped at the bar's close. The next bar it was back
        // at 0.17 and safe. Every leveraged run was flattered on exactly the
        // days the deep rungs exist for.
        const eligibleHeld = held
        const eligibleOrders = book.orders.filter(
          (order) => order.marketKey === marketKey && settled(order.updatedAt)
        )
        const event = nextEventOnLeg({
          leg,
          at: reached,
          position: eligibleHeld,
          orders: eligibleOrders,
          ignoreTakeProfit: bracketsTie(bar, eligibleHeld),
        })
        if (!event) break

        // Buying power during this walk reads the mark `openBar` set — the
        // bar's LOW — so every fill is checked against the worst this candle
        // got to, not against where the coin started it. That floor is what
        // stopped 10 October 2025 buying $125,274 of coin on a wallet holding
        // $10,151: 208 fills across 67 coins in one candle, each funded by a
        // recovery the next coin had not had yet.
        if (event.kind === "order") {
          const order = eligibleOrders.find((one) => one.id === event.orderId)
          if (order) {
            fillOrder(book, order, {
              px: event.px,
              feeRate: book.costs.makerFeeRate,
              at,
            })
          }
        } else if (eligibleHeld) {
          closeAt(book, eligibleHeld, {
            px: event.px,
            // A target is a limit sitting at your price; a stop and a
            // liquidation are market orders that take what is there.
            feeRate:
              event.kind === "take_profit"
                ? book.costs.makerFeeRate
                : book.costs.takerFeeRate,
            // A stop and a liquidation are market orders and pay slippage; a
            // target is a limit sitting at your price and does not.
            slip: event.kind !== "take_profit",
            reason: event.kind,
            at,
          })
        }
        reached = event.px
      }
    }
  }

  // **Deliberately not the bar's close.** In a replay every coin's bar covers
  // the same four hours, and they are walked one after another — so writing
  // coin A's recovered close here hands coin B a wallet fattened by a recovery
  // that, for B, has not happened yet. The walk above leaves the mark at the
  // last price this coin actually traded at, which is the conservative answer
  // and the honest one. The caller settles every coin, then says what the bar
  // closed at: `closeBar` below.

  const mark = input.mark
  if (mark === null || !(mark > 0)) return
  // A price right now beats any bar's close.
  book.marks.set(marketKey, mark)

  for (let step = 0; step < MAX_OPEN_ORDERS + 2; step += 1) {
    const waiting = book.orders.find(
      (order) =>
        order.marketKey === marketKey && isMarketable(order.side, order.px, mark)
    )
    if (waiting) {
      // Filled at the price it asked for rather than today's better one: it
      // was sitting there as price went past, so that is where it was taken.
      fillOrder(book, waiting, {
        px: waiting.px,
        feeRate: book.costs.makerFeeRate,
        at: input.now,
      })
      continue
    }

    const held = book.positions.get(marketKey) ?? null
    if (!held) break
    const level = passedLevels(held, mark)[0]
    if (!level) break

    closeAt(book, held, {
      // A target is a limit at your price, and running past it does not pay
      // more. A stop and a liquidation are market orders, so a price that has
      // gapped past fills where the market actually is — the cost of the gap.
      px:
        level.reason === "take_profit"
          ? level.px
          : worseOf(held.szi, level.px, mark),
      feeRate:
        level.reason === "take_profit"
          ? book.costs.makerFeeRate
          : book.costs.takerFeeRate,
      slip: level.reason !== "take_profit",
      reason: level.reason,
      at: input.now,
    })
  }
}

// ----- Loading, settling, saving ----------------------------------------

/**
 * Everything this wallet has banked: profit less fees, over every fill it has
 * ever had. Added up in the database rather than read out row by row, because
 * this runs on every poll and a year of practice is a lot of rows.
 */
async function realizedTotal(
  database: CustomShellDb,
  userId: string,
  walletId: string
): Promise<number> {
  const rows = await database
    .select({
      total: sql<string>`coalesce(sum(${tradePaperJournal.closedPnl} - ${tradePaperJournal.fee}), 0)`,
    })
    .from(tradePaperJournal)
    .where(
      and(
        eq(tradePaperJournal.userId, userId),
        eq(tradePaperJournal.walletId, walletId)
      )
    )
  return Number(rows[0]?.total ?? 0)
}

async function readBook(
  database: CustomShellDb,
  userId: string,
  wallet: TradeWallet
): Promise<WalletBook> {
  const [positions, orders, banked] = await Promise.all([
    database
      .select()
      .from(tradePaperPositions)
      .where(
        and(
          eq(tradePaperPositions.userId, userId),
          eq(tradePaperPositions.walletId, wallet.id)
        )
      ),
    database
      .select()
      .from(tradePaperOrders)
      .where(
        and(
          eq(tradePaperOrders.userId, userId),
          eq(tradePaperOrders.walletId, wallet.id)
        )
      ),
    realizedTotal(database, userId, wallet.id),
  ])

  return {
    wallet,
    costs: defaultPaperCosts(),
    cash: wallet.startingBalance + banked,
    // Empty until the settle walks a market and says what it is worth. A
    // position with no price counts as neither up nor down, which is the only
    // honest thing to do with silence.
    marks: new Map(),
    positions: new Map(positions.map((row) => [row.marketKey, toPosition(row)])),
    orders: orders.map(toOrder),
    fills: [],
    touchedMarkets: new Set(),
    goneOrderIds: new Set(),
    entryLimit: null,
    // The moments the coins still open were opened, so the entry limit means
    // the same thing across settles — this book is rebuilt on every poll, and
    // an empty list here made "5 coins an hour" into "5 coins per poll".
    // Coins opened AND closed inside the window are not in this seed, so the
    // cap can run slightly loose, never slightly tight.
    openedAt: positions
      .map((row) => row.createdAt.getTime())
      .sort((left, right) => left - right),
    liquidatedThisPass: new Set(),
    crashEntry: { cascading: false, leastLeverage: null },
    ordersVersion: 0,
    addedOrders: [],
  }
}

/**
 * Writes back only what moved. `settledTo` is left null on a poll that changed
 * nothing and had no catching up to do — the watermark is only there to say
 * how far back the candles must be read from, and rewriting it every four
 * seconds would be a write per poll for no gain.
 */
export async function saveBook(
  database: CustomShellDb,
  userId: string,
  book: WalletBook,
  settledTo: Date | null
): Promise<void> {
  // Written before the deletes: an exit that filled in the same pass is in
  // both lists, and it has to exist before it can be removed.
  if (book.addedOrders.length > 0) {
    await database
      .insert(tradePaperOrders)
      .values(
        book.addedOrders.map((order) => ({
          userId,
          id: order.id,
          walletId: book.wallet.id,
          marketKey: order.marketKey,
          side: order.side,
          px: order.px,
          sz: order.sz,
          leverage: order.leverage,
          maxLeverage: order.maxLeverage,
          reduceOnly: order.reduceOnly,
          tpPx: order.tpPx,
          slPx: order.slPx,
          createdAt: new Date(order.createdAt),
          updatedAt: new Date(order.updatedAt),
        }))
      )
      .onConflictDoNothing()
  }

  if (book.goneOrderIds.size > 0) {
    await database
      .delete(tradePaperOrders)
      .where(
        and(
          eq(tradePaperOrders.userId, userId),
          inArray(tradePaperOrders.id, [...book.goneOrderIds])
        )
      )
  }

  for (const marketKey of book.touchedMarkets) {
    const position = book.positions.get(marketKey)
    if (!position) {
      await database
        .delete(tradePaperPositions)
        .where(
          and(
            eq(tradePaperPositions.userId, userId),
            eq(tradePaperPositions.walletId, book.wallet.id),
            eq(tradePaperPositions.marketKey, marketKey)
          )
        )
      continue
    }
    const values = {
      szi: position.szi,
      entryPx: position.entryPx,
      leverage: position.leverage,
      maxLeverage: position.maxLeverage,
      tpPx: position.tpPx,
      slPx: position.slPx,
      feesPaid: position.feesPaid,
      updatedAt: new Date(position.updatedAt),
    }
    await database
      .insert(tradePaperPositions)
      .values({
        userId,
        id: position.id,
        walletId: book.wallet.id,
        marketKey,
        ...values,
      })
      .onConflictDoUpdate({
        target: [
          tradePaperPositions.userId,
          tradePaperPositions.walletId,
          tradePaperPositions.marketKey,
        ],
        set: values,
      })
  }

  if (book.fills.length > 0) {
    await database.insert(tradePaperJournal).values(
      book.fills.map((entry) => ({
        userId,
        id: entry.id,
        walletId: book.wallet.id,
        marketKey: entry.marketKey,
        side: entry.side,
        px: entry.px,
        sz: entry.sz,
        fee: entry.fee,
        closedPnl: entry.closedPnl,
        reason: entry.reason,
        fillTime: new Date(entry.fillTime),
        orderId: entry.orderId,
      }))
    )
  }

  if (settledTo) {
    await database
      .insert(tradePaperState)
      .values({ userId, walletId: book.wallet.id, settledTo })
      .onConflictDoUpdate({
        target: [tradePaperState.userId, tradePaperState.walletId],
        set: { settledTo },
      })
  }
  markSaved(book)
}

/**
 * The markets these wallets have anything riding on. Three small reads rather
 * than loading every position and order, because this runs before the exchange
 * is asked anything and only needs the names.
 *
 * Smart orders are counted even when they are holding nothing and resting
 * nothing, which is not a corner case: a grid below its range has sold
 * everything and taken its buys off the book, and a ladder whose every rung sits
 * under the stop is in the same state. Left to positions and orders alone their
 * market drops off the price list, so the engine stops looking at the coin — and
 * a smart order that cannot see price come back is one that never wakes up.
 */
export async function exposedMarketKeys(
  userId: string,
  walletIds: readonly string[]
): Promise<string[]> {
  if (walletIds.length === 0) return []
  const [positions, orders, smart] = await Promise.all([
    db
      .selectDistinct({ marketKey: tradePaperPositions.marketKey })
      .from(tradePaperPositions)
      .where(
        and(
          eq(tradePaperPositions.userId, userId),
          inArray(tradePaperPositions.walletId, [...walletIds])
        )
      ),
    db
      .selectDistinct({ marketKey: tradePaperOrders.marketKey })
      .from(tradePaperOrders)
      .where(
        and(
          eq(tradePaperOrders.userId, userId),
          inArray(tradePaperOrders.walletId, [...walletIds])
        )
      ),
    db
      .selectDistinct({ marketKey: tradeSmartLadders.marketKey })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          inArray(tradeSmartLadders.walletId, [...walletIds]),
          eq(tradeSmartLadders.status, "active")
        )
      ),
  ])
  return [
    ...new Set([...positions, ...orders, ...smart].map((row) => row.marketKey)),
  ]
}

/**
 * Today's price for a mixed list of markets, whichever exchange each belongs
 * to. The key carries its own protocol and network, so the venues to ask fall
 * out of the keys themselves and each is asked exactly once.
 */
export async function marksForKeys(
  marketKeys: readonly string[]
): Promise<Map<string, number>> {
  const venues = new Map<
    string,
    { protocol: ProtocolId; network: NetworkId; keys: string[] }
  >()
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (!ref) continue
    const venueKey = `${ref.protocol}:${ref.network}`
    const venue = venues.get(venueKey) ?? {
      protocol: ref.protocol,
      network: ref.network,
      keys: [],
    }
    venue.keys.push(key)
    venues.set(venueKey, venue)
  }

  const marks = new Map<string, number>()
  await Promise.all(
    [...venues.values()].map(async (venue) => {
      const answered = await marksFor(venue.protocol, venue.network, venue.keys)
      for (const [key, price] of answered) marks.set(key, price)
    })
  )
  return marks
}

async function marksFor(
  protocol: ProtocolId,
  network: NetworkId,
  marketKeys: readonly string[]
): Promise<Map<string, number>> {
  const ids = new Map<string, string>()
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (ref) ids.set(ref.marketId, key)
  }
  if (ids.size === 0) return new Map()

  const prices = await getProtocol(protocol)
    .markets.prices(network, [...ids.keys()])
    .catch(() => new Map<string, number>())

  const marks = new Map<string, number>()
  for (const [marketId, price] of prices) {
    const key = ids.get(marketId)
    if (key) marks.set(key, price)
  }
  return marks
}

async function loadBars(
  wallet: TradeWallet,
  marketKey: string,
  interval: CandleInterval,
  since: number
): Promise<CandleBar[]> {
  const ref = parseMarketKey(marketKey)
  if (!ref) return []
  return await getProtocol(wallet.protocol)
    .markets.candles(wallet.network, ref.marketId, interval, since)
    .then((candles) => candles.filter((bar) => bar.openTime >= since))
    .catch(() => [])
}

/**
 * Brings one wallet up to date and hands back its book, already saved.
 *
 * The exchange is asked before the transaction opens, never inside it: holding
 * a row locked across a network call would leave every other tab waiting on
 * Hyperliquid. The rows are then read again inside, so nothing is decided from
 * a copy that went stale while the prices were on their way.
 */
export async function settleWallet(
  userId: string,
  wallet: TradeWallet,
  shared?: { marks: ReadonlyMap<string, number> }
): Promise<WalletBook> {
  const markets = await exposedMarketKeys(userId, [wallet.id])
  const now = Date.now()

  // The candles the ladders are watching — a two-green ladder's own timeframe,
  // and the 4h a base stop reads its level off. Asked out here, before the
  // transaction, for the same reason the marks are: a network call must never
  // sit inside the lock. Costs nothing when no ladder is watching.
  const ladderBars = new Map<string, { bars: CandleBar[]; barMs: number }>()
  // One feed per settle, for the same reason the live pass paces itself: a
  // wallet with a hundred ladders asking for a hundred 4h histories at once
  // is a burst the exchange refuses wholesale. The rest keep their old
  // `seenTo`, so the next settle simply picks up where this one stopped.
  for (const need of (await ladderCandleNeeds(userId, wallet.id, now)).slice(
    0,
    1
  )) {
    ladderBars.set(ladderBarsKey(need.use, need.marketKey), {
      bars: await loadBars(wallet, need.marketKey, need.interval, need.since),
      barMs: need.barMs,
    })
  }

  const stateRows = await db
    .select()
    .from(tradePaperState)
    .where(
      and(
        eq(tradePaperState.userId, userId),
        eq(tradePaperState.walletId, wallet.id)
      )
    )
    .limit(1)
  const settledTo = stateRows[0]?.settledTo.getTime() ?? now
  const gap = now - settledTo
  const catchingUp = markets.length > 0 && gap >= CATCH_UP_AFTER_MS

  const marks =
    markets.length === 0
      ? new Map<string, number>()
      : (shared ?? {
          marks: await marksFor(wallet.protocol, wallet.network, markets),
        }).marks

  // Candles only when a bar could actually have closed since the last look.
  // Below that the price-right-now half has covered every moment already, and
  // asking would be one call per market per poll for nothing.
  const step = catchUpStep(gap)
  const bars = new Map<string, CandleBar[]>()
  if (catchingUp) {
    await Promise.all(
      markets.map(async (key) => {
        bars.set(key, await loadBars(wallet, key, step.interval, settledTo))
      })
    )
  }

  return await db.transaction(async (tx) => {
    // Two tabs polling at once would otherwise both replay the same candle and
    // fill the same order twice. Whoever arrives second waits here, re-reads,
    // and finds the work already done.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id)))
      .for("update")

    const book = await readBook(tx, userId, wallet)
    for (const key of new Set([
      ...book.positions.keys(),
      ...book.orders.map((order) => order.marketKey),
    ])) {
      settleMarket(book, key, {
        bars: bars.get(key) ?? [],
        barMs: step.ms,
        mark: marks.get(key) ?? null,
        now,
      })
    }
    // The smart-order ladders react to what the replay just did — a rung that
    // bought gets its sell, a stop that fired ends its ladder — before the
    // book is saved, so their changes ride the same write.
    await advanceLadders(
      { tx, userId, book, marks, ladderBars: ladderBars as LadderBars, now },
      { fill, dropOrder, freeCash }
    )
    const moved = book.fills.length > 0 || book.goneOrderIds.size > 0
    await saveBook(tx, userId, book, catchingUp || moved ? new Date(now) : null)
    return book
  })
}

// ----- What the screens ask for -----------------------------------------

export type PaperAccount = {
  positions: PaperPosition[]
  orders: PaperOrder[]
  /** Every visible fill, including the entries of positions still open. */
  fills: LiveFill[]
  /** Finished practice round trips — the Journal, alongside the real ones. */
  trades: LiveTrade[]
}

/**
 * How many fills the Journal is built from. Bounded because this runs on every
 * poll: a year of practice must not make the panel slower every week.
 */
const JOURNAL_PAGE = 2_000

/**
 * How a practice fill's own reason reads as the end of a trade.
 *
 * The practice engine fires its own stops and writes down which level was hit,
 * so unlike a real fill there is nothing to look up afterwards. The four
 * remaining reasons belong to live rows and never appear in this table.
 */
const PAPER_ENDINGS: Partial<Record<PaperFillReason, LiveTradeEnding>> = {
  take_profit: "target",
  stop_loss: "stop",
  liquidated: "liquidated",
  manual: "closed",
  order: "closed",
}

/** One practice fill in the shape the trade builder reads. */
function toTradeFill(row: JournalRow): LiveFill {
  return {
    fillId: row.id,
    // The order that placed it, where one did. It falls back to the fill's own
    // id so that a stop or a liquidation — which nothing placed — still groups
    // as one arrow, and so rows written before the column existed still read.
    orderId: row.orderId ?? row.id,
    walletId: row.walletId,
    marketKey: row.marketKey,
    side: row.side,
    px: row.px,
    sz: row.sz,
    at: row.fillTime.getTime(),
    closedPnl: row.closedPnl,
    fee: row.fee,
    // Stands in for the exchange's own word, and does the one job that word
    // does here: a fill that closed something while nothing is held belongs to
    // a trade older than the slice read, and is left out rather than drawn
    // backwards.
    dir: row.closedPnl !== 0 ? "Close" : "",
    liquidation: row.reason === "liquidated",
    ending: PAPER_ENDINGS[row.reason] ?? "closed",
    live: false,
  }
}

/**
 * One or more practice wallets' finished trades, read from what is already
 * written down.
 *
 * **No settle and no exchange.** `loadPaperPortfolio` above replays the candles
 * first, because it is answering "what am I holding right now". This one is
 * answering "what did these wallets do", which is a question about rows that
 * are already there — and it is asked by a list page that must not cost a
 * round of exchange calls per wallet to draw.
 */
export async function loadPaperHistory(
  userId: string,
  walletIds: readonly string[]
): Promise<{ fills: LiveFill[]; trades: LiveTrade[] }> {
  if (walletIds.length === 0) return { fills: [], trades: [] }
  const rows = await db
    .select()
    .from(tradePaperJournal)
    .where(
      and(
        eq(tradePaperJournal.userId, userId),
        inArray(tradePaperJournal.walletId, [...walletIds]),
        eq(tradePaperJournal.hidden, false)
      )
    )
    .orderBy(desc(tradePaperJournal.fillTime))
    .limit(JOURNAL_PAGE)

  const fills = rows.map(toTradeFill)
  const trades = buildLiveTrades(fills, NO_TRIGGERS)
  return { fills: fillsOutsideTrades(fills, trades), trades }
}

/**
 * Everything the trading screens draw, across every practice wallet at once —
 * settled first, so the answer is current rather than merely stored.
 *
 * Deliberately not scoped to whichever wallet is active. Which wallet an order
 * goes to is a choice you make when you place it; what you are holding
 * afterwards is something you need to see all of, whichever wallet it is in.
 * Every row carries its own wallet, and every action takes that wallet with it.
 *
 * The exchange is asked once for every market all the wallets are in together,
 * rather than once per wallet.
 */
export async function loadPaperPortfolio(
  userId: string,
  wallets: readonly TradeWallet[]
): Promise<PaperAccount> {
  const paper = wallets.filter((wallet) => wallet.kind === "paper")
  if (paper.length === 0) {
    return { positions: [], orders: [], fills: [], trades: [] }
  }

  const keys = await exposedMarketKeys(
    userId,
    paper.map((wallet) => wallet.id)
  )
  const marks = await marksForKeys(keys)

  const positions: PaperPosition[] = []
  const orders: PaperOrder[] = []
  for (const wallet of paper) {
    const book = await settleWallet(userId, wallet, { marks })
    positions.push(...book.positions.values())
    orders.push(...book.orders)
  }

  const fills = await db
    .select()
    .from(tradePaperJournal)
    .where(
      and(
        eq(tradePaperJournal.userId, userId),
        inArray(
          tradePaperJournal.walletId,
          paper.map((wallet) => wallet.id)
        ),
        // Binned rows are still rows — they still count towards the wallet's
        // cash, which is why they are hidden rather than removed. They just
        // stop being shown.
        eq(tradePaperJournal.hidden, false)
      )
    )
    .orderBy(desc(tradePaperJournal.fillTime))
    .limit(JOURNAL_PAGE)

  const tradeFills = fills.map(toTradeFill)
  const trades = buildLiveTrades(tradeFills, NO_TRIGGERS)
  return {
    positions: positions.sort((a, b) => a.marketKey.localeCompare(b.marketKey)),
    orders: orders.sort((a, b) => a.createdAt - b.createdAt),
    fills: fillsOutsideTrades(tradeFills, trades),
    // No triggers to look up: a practice fill carries its own reason.
    trades,
  }
}

/**
 * The five account rows for every paper wallet at once — what the account
 * panel polls.
 *
 * Every wallet is settled, and the exchange is asked once for all of their
 * markets together rather than once per wallet.
 */
export async function paperWalletFigures(
  userId: string,
  wallets: readonly TradeWallet[]
): Promise<Map<string, WalletAccountFigures>> {
  const figures = new Map<string, WalletAccountFigures>()
  if (wallets.length === 0) return figures

  const keys = await exposedMarketKeys(
    userId,
    wallets.map((wallet) => wallet.id)
  )
  const marks = await marksForKeys(keys)

  for (const wallet of wallets) {
    const book = await settleWallet(userId, wallet, { marks })
    figures.set(
      wallet.id,
      paperAccountFigures({
        startingBalance: wallet.startingBalance,
        realized: book.cash - wallet.startingBalance,
        positions: [...book.positions.values()],
        marks,
      })
    )
  }
  return figures
}

// ----- Doing something ---------------------------------------------------

/** The one price every action prices itself against. */
async function markOf(wallet: TradeWallet, marketKey: string): Promise<number> {
  const marks = await marksFor(wallet.protocol, wallet.network, [marketKey])
  const mark = marks.get(marketKey)
  if (mark === undefined || !(mark > 0)) throw new Error("PAPER_NO_PRICE")
  return mark
}

/** Sizes go only as fine as the market allows, and never round up into more risk. */
function roundSize(sz: number, sizeDecimals: number | null): number {
  if (!Number.isFinite(sz) || sz <= 0) return 0
  const factor = 10 ** Math.max(0, sizeDecimals ?? 0)
  return Math.floor(sz * factor) / factor
}

export async function placePaperOrder(
  userId: string,
  wallet: TradeWallet,
  input: {
    marketKey: string
    side: PaperSide
    px: number
    sz: number
    leverage: number
    reduceOnly: boolean
    tpPx: number | null
    slPx: number | null
  }
): Promise<void> {
  const ref = parseMarketKey(input.marketKey)
  if (!ref || ref.protocol !== wallet.protocol || ref.network !== wallet.network) {
    throw new Error("PAPER_MARKET")
  }
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")

  const maxLeverage = rules.maxLeverage ?? 1
  if (input.leverage < 1 || input.leverage > maxLeverage) {
    throw new Error("PAPER_LEVERAGE")
  }

  const protocol = getProtocol(wallet.protocol)
  const px = protocol.markets.roundPx(input.px, rules.sizeDecimals)
  const sz = roundSize(input.sz, rules.sizeDecimals)
  if (!(px > 0)) throw new Error("PAPER_PRICE")
  if (!(sz > 0) || px * sz < MIN_ORDER_VALUE_USD) throw new Error("PAPER_SIZE")

  const mark = await markOf(wallet, input.marketKey)
  const book = await settleWallet(userId, wallet)

  if (book.orders.length >= MAX_OPEN_ORDERS) throw new Error("PAPER_ORDER_LIMIT")

  const taken = isMarketable(input.side, px, mark)
  // A price already through the market is not going to wait for anything, so
  // it is taken now — at the market's price, never at the worse one asked for.
  // Which means the price this order opens at is not always the price it asked
  // for. Everything below is judged against the price it will really get: a
  // sell placed under the market fills above the price asked for, so checking
  // the margin against that price would let a trade through that the account
  // cannot actually afford.
  const entryPx = taken ? mark : px
  const long = input.side === "buy"

  const held = book.positions.get(input.marketKey) ?? null
  const reducible = input.reduceOnly
    ? capReduceOnly(held, input.side, sz)
    : null
  if (input.reduceOnly && (reducible === null || reducible <= 0)) {
    throw new Error("PAPER_REDUCE_ONLY")
  }
  if (!input.reduceOnly && (entryPx * sz) / input.leverage > freeCash(book)) {
    throw new Error("PAPER_MARGIN")
  }
  // Brackets belong to a position this order opens; one that only reduces
  // never opens anything, so they could not apply and are dropped at the door.
  const tpPx = input.reduceOnly
    ? null
    : input.tpPx === null
      ? null
      : protocol.markets.roundPx(input.tpPx, rules.sizeDecimals)
  const slPx = input.reduceOnly
    ? null
    : input.slPx === null
      ? null
      : protocol.markets.roundPx(input.slPx, rules.sizeDecimals)

  if (tpPx !== null && (long ? tpPx <= entryPx : tpPx >= entryPx)) {
    throw new Error("PAPER_TAKE_PROFIT_SIDE")
  }
  if (slPx !== null && (long ? slPx >= entryPx : slPx <= entryPx)) {
    throw new Error("PAPER_STOP_SIDE")
  }

  const now = Date.now()
  if (taken) {
    fill(book, {
      marketKey: input.marketKey,
      side: input.side,
      px: mark,
      sz: reducible ?? sz,
      feeRate: book.costs.takerFeeRate,
      leverage: input.leverage,
      maxLeverage,
      reason: "order",
      at: now,
      brackets: { tpPx, slPx },
    })
    await db.transaction((tx) => saveBook(tx, userId, book, new Date(now)))
    return
  }

  await db.insert(tradePaperOrders).values({
    userId,
    id: randomUUID(),
    walletId: wallet.id,
    marketKey: input.marketKey,
    side: input.side,
    px,
    sz,
    leverage: input.leverage,
    maxLeverage,
    reduceOnly: input.reduceOnly,
    tpPx,
    slPx,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  })
}

/**
 * Dragging a waiting order to a new price. Dragged through the market it stops
 * waiting and is taken there and then, which is exactly what the exchange
 * would do with it.
 */
export async function movePaperOrder(
  userId: string,
  wallet: TradeWallet,
  input: { orderId: string; px: number }
): Promise<void> {
  const book = await settleWallet(userId, wallet)
  const order = book.orders.find((one) => one.id === input.orderId)
  if (!order) throw new Error("PAPER_ORDER_NOT_FOUND")

  const ref = parseMarketKey(order.marketKey)
  if (!ref) throw new Error("PAPER_MARKET")
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  const px = getProtocol(wallet.protocol).markets.roundPx(
    input.px,
    rules?.sizeDecimals ?? null
  )
  if (!(px > 0)) throw new Error("PAPER_PRICE")

  const mark = await markOf(wallet, order.marketKey)
  const now = Date.now()

  if (isMarketable(order.side, px, mark)) {
    fillOrder(book, order, {
      px: mark,
      feeRate: book.costs.takerFeeRate,
      at: now,
    })
    await db.transaction((tx) => saveBook(tx, userId, book, new Date(now)))
    return
  }

  await db
    .update(tradePaperOrders)
    .set({ px, updatedAt: new Date(now) })
    .where(
      and(
        eq(tradePaperOrders.userId, userId),
        eq(tradePaperOrders.walletId, wallet.id),
        eq(tradePaperOrders.id, input.orderId)
      )
    )
}

/**
 * Changing a waiting order without moving it: how much it is for, and where it
 * gets out once it fills.
 *
 * Its price is not touched here — that is the drag on the chart — which is what
 * makes this safe to check against `order.px`: an order that is still waiting
 * has not been reached, so the price it fills at is the price it is asking for.
 * Every rule the order had to pass when it was placed is applied again, because
 * the account it has to fit inside is not the one it was placed into.
 */
export async function updatePaperOrder(
  userId: string,
  wallet: TradeWallet,
  input: {
    orderId: string
    sz: number
    tpPx: number | null
    slPx: number | null
  }
): Promise<void> {
  const book = await settleWallet(userId, wallet)
  const order = book.orders.find((one) => one.id === input.orderId)
  if (!order) throw new Error("PAPER_ORDER_NOT_FOUND")

  const ref = parseMarketKey(order.marketKey)
  if (!ref) throw new Error("PAPER_MARKET")
  // Placing one refuses a market with no rules, and so does this: without them
  // the size would round to whole coins and report itself as "too small",
  // which is a true sentence about the wrong problem.
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")
  const protocol = getProtocol(wallet.protocol)

  const sz = roundSize(input.sz, rules.sizeDecimals)
  if (!(sz > 0) || order.px * sz < MIN_ORDER_VALUE_USD) {
    throw new Error("PAPER_SIZE")
  }

  const held = book.positions.get(order.marketKey) ?? null
  if (order.reduceOnly) {
    const reducible = capReduceOnly(held, order.side, sz)
    if (reducible === null || reducible <= 0) throw new Error("PAPER_REDUCE_ONLY")
  } else if ((order.px * sz) / order.leverage > freeCash(book)) {
    // Waiting orders hold no margin aside, so what this one has to fit inside
    // is the cash free right now — not what was free when it was placed.
    throw new Error("PAPER_MARGIN")
  }

  // A reduce-only order never opens a position, so there is nothing for a stop
  // or a target to ride on. Dropped at the door, exactly as when placing one.
  const round = (px: number | null) =>
    px === null ? null : protocol.markets.roundPx(px, rules.sizeDecimals)
  const tpPx = order.reduceOnly ? null : round(input.tpPx)
  const slPx = order.reduceOnly ? null : round(input.slPx)
  const long = order.side === "buy"

  if (tpPx !== null && (!(tpPx > 0) || (long ? tpPx <= order.px : tpPx >= order.px))) {
    throw new Error("PAPER_TAKE_PROFIT_SIDE")
  }
  if (slPx !== null && (!(slPx > 0) || (long ? slPx >= order.px : slPx <= order.px))) {
    throw new Error("PAPER_STOP_SIDE")
  }

  await db
    .update(tradePaperOrders)
    // The stamp matters: a bar that opened before this edit no longer applies
    // to the order, the same rule a drag obeys — see `settleMarket`.
    .set({ sz, tpPx, slPx, updatedAt: new Date() })
    .where(
      and(
        eq(tradePaperOrders.userId, userId),
        eq(tradePaperOrders.walletId, wallet.id),
        eq(tradePaperOrders.id, input.orderId)
      )
    )
}

export async function cancelPaperOrder(
  userId: string,
  walletId: string,
  orderId: string
): Promise<void> {
  const removed = await db
    .delete(tradePaperOrders)
    .where(
      and(
        eq(tradePaperOrders.userId, userId),
        eq(tradePaperOrders.walletId, walletId),
        eq(tradePaperOrders.id, orderId)
      )
    )
    .returning({ id: tradePaperOrders.id })
  if (removed.length === 0) throw new Error("PAPER_ORDER_NOT_FOUND")
}

/**
 * Setting or clearing a position's target and stop.
 *
 * A target stays on the winning side of the entry. A stop stays beyond the
 * current price so it cannot fire the instant it is set; after price moves in
 * the trade's favour, that lets the stop cross the entry and protect profit.
 */
export async function setPaperBrackets(
  userId: string,
  wallet: TradeWallet,
  input: { marketKey: string; tpPx: number | null; slPx: number | null }
): Promise<void> {
  const book = await settleWallet(userId, wallet)
  const held = book.positions.get(input.marketKey)
  if (!held) throw new Error("PAPER_POSITION_NOT_FOUND")
  const mark = await markOf(wallet, input.marketKey)

  const ref = parseMarketKey(input.marketKey)
  const rules = ref
    ? await marketRules(wallet.protocol, wallet.network, ref.marketId)
    : null
  const round = (px: number | null) =>
    px === null
      ? null
      : getProtocol(wallet.protocol).markets.roundPx(
          px,
          rules?.sizeDecimals ?? null
        )

  const tpPx = round(input.tpPx)
  const slPx = round(input.slPx)
  const long = held.szi > 0

  if (
    tpPx !== null &&
    (!(tpPx > 0) || (long ? tpPx <= held.entryPx : tpPx >= held.entryPx))
  ) {
    throw new Error("PAPER_TAKE_PROFIT_SIDE")
  }
  if (
    slPx !== null &&
    (!(slPx > 0) || (long ? slPx >= mark : slPx <= mark))
  ) {
    throw new Error("PAPER_STOP_SIDE")
  }

  await db
    .update(tradePaperPositions)
    .set({ tpPx, slPx, updatedAt: new Date() })
    .where(
      and(
        eq(tradePaperPositions.userId, userId),
        eq(tradePaperPositions.walletId, wallet.id),
        eq(tradePaperPositions.marketKey, input.marketKey)
      )
    )
}

export async function closePaperPosition(
  userId: string,
  wallet: TradeWallet,
  marketKey: string
): Promise<void> {
  const mark = await markOf(wallet, marketKey)
  const book = await settleWallet(userId, wallet)
  const held = book.positions.get(marketKey)
  if (!held) throw new Error("PAPER_POSITION_NOT_FOUND")

  const now = Date.now()
  closeAt(book, held, {
    px: mark,
    feeRate: book.costs.takerFeeRate,
    reason: "manual",
    at: now,
  })
  await db.transaction((tx) => saveBook(tx, userId, book, new Date(now)))
}

/**
 * Turning a position around: out of this one and into the same size the other
 * way, in one go. One fill of twice the size does exactly that — the
 * arithmetic banks the old trade and opens the new one at the same price.
 */
export async function flipPaperPosition(
  userId: string,
  wallet: TradeWallet,
  marketKey: string
): Promise<void> {
  const mark = await markOf(wallet, marketKey)
  const book = await settleWallet(userId, wallet)
  const held = book.positions.get(marketKey)
  if (!held) throw new Error("PAPER_POSITION_NOT_FOUND")

  const size = Math.abs(held.szi)
  // The new half needs its own margin, and the old half's is only given back
  // as it closes — so the test is against what the turn actually costs.
  if ((mark * size) / held.leverage > freeCash(book) + positionMargin(held)) {
    throw new Error("PAPER_MARGIN")
  }

  const now = Date.now()
  fill(book, {
    marketKey,
    side: held.szi > 0 ? "sell" : "buy",
    px: mark,
    sz: size * 2,
    feeRate: book.costs.takerFeeRate,
    leverage: held.leverage,
    maxLeverage: held.maxLeverage,
    reason: "manual",
    at: now,
  })
  await db.transaction((tx) => saveBook(tx, userId, book, new Date(now)))
}

/**
 * Everything closed at once, at whatever each market costs right now — across
 * every practice wallet, because that is what the table it sits above shows.
 */
export async function closeAllPaperPositions(
  userId: string,
  wallets: readonly TradeWallet[]
): Promise<{ closed: number }> {
  const paper = wallets.filter((wallet) => wallet.kind === "paper")
  const keys = await exposedMarketKeys(
    userId,
    paper.map((wallet) => wallet.id)
  )
  const marks = await marksForKeys(keys)
  const now = Date.now()
  let closed = 0

  for (const wallet of paper) {
    const book = await settleWallet(userId, wallet, { marks })
    const held = [...book.positions.values()]
    if (held.length === 0) continue

    let touched = 0
    for (const position of held) {
      const mark = marks.get(position.marketKey)
      // A market the exchange would not price is left alone rather than closed
      // at a made-up number; the count says how many actually went.
      if (mark === undefined || !(mark > 0)) continue
      closeAt(book, position, {
        px: mark,
        feeRate: book.costs.takerFeeRate,
        reason: "manual",
        at: now,
      })
      touched += 1
    }
    if (touched > 0) {
      await db.transaction((tx) => saveBook(tx, userId, book, new Date(now)))
      closed += touched
    }
  }
  return { closed }
}

/**
 * Takes the fills behind one finished practice trade off the Journal.
 *
 * They are not removed. `realizedTotal` above adds these rows up to work out
 * what a practice wallet is worth, so deleting one would move the balance —
 * bin a loss and the wallet hands the money back. Nobody tidying a list has
 * asked for that. The rows stay, stop being shown, and the money does not move.
 *
 * Scoped by the person, so a request carrying somebody else's row id can only
 * ever miss.
 */
export async function hidePaperJournalEntries(
  userId: string,
  ids: readonly string[]
): Promise<void> {
  if (ids.length === 0) return
  await db
    .update(tradePaperJournal)
    .set({ hidden: true })
    .where(
      and(
        eq(tradePaperJournal.userId, userId),
        inArray(tradePaperJournal.id, [...ids])
      )
    )
}
