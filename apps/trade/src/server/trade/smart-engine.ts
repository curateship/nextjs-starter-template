import type { CandleBar, CandleInterval } from "@/lib/protocols/contracts"
import type { DcaBaseDetection } from "@/lib/trade/dca"
import { baseLevelsInForce } from "@/lib/trade/indicators/base"
import { ascending, lastClosedIndex } from "@/lib/trade/candle-window"
import type { PaperSide } from "@/lib/trade/paper"
import type { SmartPlan } from "@/lib/trade/smart-plan"
import type { WalletBook } from "@/server/trade/paper"

/**
 * What every smart-order engine is handed, and the few rules all of them share.
 *
 * There are two engines now — the DCA ladder in `smart-ladders.ts` and the grid
 * in `smart-grids.ts` — and they must not import each other. This is the module
 * in the middle: the contract they are both driven through, and the handful of
 * decisions that would be a bug to answer twice.
 *
 * Nothing here touches a database or the exchange. That is the whole point of
 * the `deps` shape below: the practice wallet writes rows, the live wallet asks
 * Hyperliquid, and a replay keeps it in memory and writes nothing, all through
 * the same engine code.
 */

export type LadderOrderInput = {
  marketKey: string
  side: PaperSide
  px: number
  sz: number
  leverage: number
  maxLeverage: number
  reduceOnly: boolean
  now: number
  /**
   * Where this slice sells itself, resting from the instant the buy fills.
   *
   * Only the replay reads it. A practice or real wallet settles seconds after
   * a fill, so placing the exit afterwards costs nothing there; a replay only
   * gets to look once a four-hour candle has finished, and a crash that
   * bounces inside one candle leaves every exit behind. Deliberately not a
   * column on the orders table for that reason — nothing outside a run needs
   * to remember it.
   */
  exitPx?: number | null
}

/** One fill, as an engine matching orders back to its own plan sees it. */
export type EngineFill = {
  id: string
  marketKey: string
  side: PaperSide
  px: number
  sz: number
  reason: string
}

export type LadderEngineDeps = {
  fill: (
    book: WalletBook,
    input: {
      marketKey: string
      side: PaperSide
      px: number
      sz: number
      feeRate: number
      leverage: number
      maxLeverage: number
      /**
       * This fill may only shrink what is held, never open something new.
       *
       * Meaningless to a practice book, which fills from the numbers in front
       * of it — and load-bearing on a real exchange, which is a separate party
       * that may already have closed the position. A market SELL sent without
       * it, into that gap, does not sell nothing: it opens a short. The live
       * side used to hardcode this to false, which was invisible for as long
       * as the only thing that ever came through here was a buy.
       */
      reduceOnly: boolean
      reason: "order"
      at: number
      /**
       * Puts the engine's own bookkeeping back as if this fill never happened.
       *
       * Only the live lane ever calls it, and only on `LIVE_ORDER_REFUSED` —
       * the one error that promises the exchange processed the order and
       * refused it, so nothing stood. Every other failure keeps the
       * conservative "assume it filled" state, because acting on a maybe is
       * how a rung gets bought twice.
       */
      undo?: () => void
    }
  ) => void
  dropOrder: (book: WalletBook, orderId: string) => void
  freeCash: (book: WalletBook) => number
  /**
   * Writes one order down and answers with its id.
   *
   * Required, like the three above it. This used to be optional with the
   * practice tables as a fallback, and that made "where does this order go?"
   * a question with two answers and no way to see which one applied. Now the
   * caller says: the practice wallet writes rows, the live wallet asks the
   * exchange, and a backtest keeps it in memory and writes nothing.
   */
  insertOrder: (input: LadderOrderInput) => Promise<string>
  /** Writes the order's plan and status down, for the same reason. */
  saveLadder: (
    row: SmartRow,
    status: "active" | "done",
    now: number
  ) => Promise<void>
}

/**
 * One smart-order row as an engine holds it mid-pass: which row it is, which
 * coin, and the plan it is editing in place.
 *
 * Both engines' rows fit this, which is what lets one `saveLadder` write either
 * of them without knowing which it has.
 */
export type SmartRow = {
  id: string
  marketKey: string
  plan: SmartPlan
}

/**
 * Which feed a smart order is asking for. One market can want both at once — a
 * two-green ladder on the 15m and a base stop on the 4h — so the key carries
 * the purpose as well as the market.
 */
export type LadderBarsUse = "green" | "base"

export function ladderBarsKey(use: LadderBarsUse, marketKey: string): string {
  return `${use}:${marketKey}`
}

/**
 * One feed a smart order reads: the bars, oldest first, and how long each one
 * lasts.
 *
 * The bars are READ-ONLY, and are expected to be in time order. A replay hands
 * over the same array on every pass — the whole history, thousands of bars — so
 * copying it to be safe, or sorting it to be sure, is the length of the history
 * repeated on every bar of the run. Everything that reads this finds its place
 * with a binary search instead.
 */
export type LadderFeed = { bars: readonly CandleBar[]; barMs: number }

export type LadderBars = ReadonlyMap<string, LadderFeed>

/**
 * What one advance works on: a book in memory, today's prices, the candles the
 * orders are watching, and the moment it is all as of.
 *
 * No database. Everything that would touch one is in `deps`, which is what
 * lets a backtest replay months through this same code without a row being
 * written anywhere.
 */
export type LadderAdvanceInput = {
  book: WalletBook
  marks: ReadonlyMap<string, number>
  ladderBars: LadderBars
  now: number
  /**
   * The whole market is falling off a cliff right now.
   *
   * Worked out ONCE by the caller and handed to every order, because the
   * question is about the market rather than this coin — and because a run
   * watching 400 coins must not answer it 400 times a bar. Undefined means
   * nobody is watching for it, which is every caller that has not asked.
   */
  cascading?: boolean
  /**
   * The candle this pass is inside has not finished yet.
   *
   * A backtest can walk one candle minute by minute, and then a ladder is
   * worked several times inside the same candle instead of once at its end.
   * Two decisions must not be made at a moment half way down a crash:
   *
   * - **A rung is not given up on.** A rung whose order has gone is written
   *   off as "skipped" and never buys again. Judged at the bottom of the wick
   *   that killed every deep rung of every ladder on 10 October 2025.
   * - **A rung is not put back.** Reviving one compares the price now against
   *   the rung, and mid-crash the price is under all of them, which marks them
   *   skipped for the same reason.
   *
   * What a mid-candle pass IS for is reacting to a rung that just bought: its
   * sell goes on, and the position's target and stop are aimed. That is what
   * lets a coin buy and sell inside one candle, which is the whole point of
   * walking the minutes.
   *
   * Undefined everywhere else — the practice and live engines are never inside
   * a candle, they are at the moment itself.
   */
  midCandle?: boolean
}

export const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/** Close enough for two doubles that came from the same arithmetic. */
export function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-9)
}

export function nearNullable(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return near(a, b)
}

/**
 * Matches this pass's fills back to the levels that were waiting for them, and
 * makes sure one fill is never spent twice.
 *
 * Two levels at the same price would otherwise both claim the same fill and
 * both believe they bought — one of them holding coins that do not exist. The
 * claimer is made fresh per advance, so the "already spent" set covers exactly
 * one pass.
 */
export function makeFillClaimer(
  book: { fills: readonly EngineFill[] },
  marketKey: string
): (side: PaperSide, px: number, maxSz: number) => EngineFill | null {
  const used = new Set<string>()
  return (side, px, maxSz) => {
    const found = book.fills.find(
      (fill) =>
        !used.has(fill.id) &&
        fill.marketKey === marketKey &&
        fill.side === side &&
        fill.reason === "order" &&
        near(fill.px, px) &&
        fill.sz <= maxSz + 1e-9
    )
    if (found) used.add(found.id)
    return found ?? null
  }
}

/**
 * Keeps the position's stop where a smart order says it should be — unless a
 * hand has moved it.
 *
 * The plan remembers what it last wrote. A position carrying anything else was
 * changed on purpose, and from then on the stop is left alone rather than
 * quietly dragged back. Shared because it is the subtlest rule in this area and
 * two copies of it would be two chances to get the hand-moved test wrong.
 *
 * `wanted` being null is a real answer, not a missing one: it means "no stop
 * yet", and writing zero instead would be a stop in name only that sat under
 * every level and killed them all.
 */
export function aimStop(
  aimed: { aimedSlPx: number | null },
  position: { slPx: number | null; updatedAt: number },
  wanted: number | null,
  onHandMoved: (px: number | null) => void
): boolean {
  if (!nearNullable(aimed.aimedSlPx, position.slPx)) {
    // Somebody dragged it. Remember where they put it and stop following.
    aimed.aimedSlPx = position.slPx
    onHandMoved(position.slPx)
    return true
  }
  if (nearNullable(wanted, position.slPx)) return false
  position.slPx = wanted
  aimed.aimedSlPx = wanted
  return true
}

/**
 * Where the confirmed base sits right now, off the 4h feed, and how far the
 * watch has read.
 *
 * The window is re-read whole each time rather than added to, because a level
 * depends on the candles either side of it, not on the newest one.
 *
 * `seenTo` is a CLOSE time, not an open time — it decides when this is worth
 * asking for again, and a bar that just closed must not read as four hours old.
 *
 * Null means there was no feed to read; the caller leaves its watch alone.
 */
export function readBaseWatch(
  feed: LadderFeed | undefined,
  detection: DcaBaseDetection,
  now: number,
  lastLevelPx: number | null
): {
  watch: { levelPx: number | null; seenTo: number }
  /** The closed bars, and which one the level was read at. For the clocks. */
  bars: readonly CandleBar[]
  cut: number
} | null {
  if (!feed) return null

  // Found rather than filtered. Copying out the closed bars and running the
  // whole indicator over them again is the length of the feed, on every pass —
  // fine live, where the feed is the handful of bars since the last look, and
  // ruinous in a replay, where it is the entire history and there are thousands
  // of passes.
  const bars = ascending(feed.bars)
  const cut = lastClosedIndex(bars, feed.barMs, now)

  if (cut < 0) {
    // Nothing came back — a market too new to have history, or a call that
    // failed. Note that we looked, so this is not asked again every four
    // seconds, and leave the level exactly as it was.
    return { watch: { levelPx: lastLevelPx, seenTo: now }, bars, cut }
  }

  return {
    watch: {
      levelPx: baseLevelsInForce(bars, detection)[cut] ?? null,
      seenTo: bars[cut].openTime + feed.barMs,
    },
    bars,
    cut,
  }
}
