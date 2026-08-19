import { z } from "zod"

import { CANDLE_INTERVALS } from "@/lib/protocols/contracts"
import { dcaParamsSchema } from "@/lib/trade/dca"
import { flowWaitWords } from "@/lib/trade/flow-waiting"
import { indicatorSettingsSchema } from "@/lib/trade/indicators/registry"
import { formatSignedUsd, formatUsd } from "@/lib/trade/format"

/**
 * What a finished backtest holds, in the app's own words.
 *
 * Browser-safe: the run page draws these, the server writes them. Every figure
 * is a **dollar amount**, worked out once when the run is saved and never
 * again — a page that recalculated would drift from the row it is showing, and
 * a strategy edited afterwards would silently rewrite an old result.
 *
 * The heavy half (every trade, the pot over time) and the light half (the few
 * numbers a list page prints) are separate on purpose, and stored in separate
 * columns, so opening a list of fifty runs does not load fifty months of
 * trades.
 */

/**
 * One round trip: a buy, and the sell that closed it.
 *
 * **Not one row per fill.** A ladder buys five times and sells once, and five
 * fills in a list tells you nothing about whether any of them worked — the row
 * that matters is "this money went in here and came out there, for this". So
 * every buy is matched to the sell that closed it, and each match is a trade
 * with its own entry, exit, and profit.
 *
 * A buy the run never closed is still a row, with no exit on it. Leaving it out
 * would quietly drop the losing half of a strategy that ends holding the bag.
 */
export const backtestTradeSchema = z.object({
  /** Its place in the list, oldest entry first, counted from 1. */
  n: z.number(),
  entryAt: z.number(),
  entryPx: z.number(),
  /** Null while it is still open at the end of the run. */
  exitAt: z.number().nullable(),
  exitPx: z.number().nullable(),
  sz: z.number(),
  /** What went in, in dollars. */
  amountUsd: z.number(),
  /** What came out of it, in dollars, after both fees. Zero while open. */
  pnl: z.number(),
  /** The same as a share of what went in. */
  returnPct: z.number(),
  /** How it ended: a target, a stop, a liquidation — or null while open. */
  exitReason: z.string().nullable(),
})

export type BacktestTrade = z.infer<typeof backtestTradeSchema>

/** One fill exactly as the engine recorded it, before the pairing. */
export type BacktestFill = {
  at: number
  side: "buy" | "sell"
  px: number
  sz: number
  fee: number
  closedPnl: number
  reason: string
  /** Which ladder step this buy was, counted from 0, or null when it was not one. */
  rung: number | null
}

/**
 * One arrow on the chart: a single fill, at the exact price and moment it
 * happened, with the words and the dollars to show when you point at it.
 *
 * **One per fill, not one per round trip.** A ladder that bought five times and
 * sold once really did five things at five prices, and drawing one blended
 * entry hides the whole shape of a ladder — which is the thing you opened the
 * chart to look at.
 */
export const backtestFillMarkSchema = z.object({
  at: z.number(),
  side: z.enum(["buy", "sell"]),
  px: z.number(),
  sz: z.number(),
  /** What this fill was worth, in dollars — what compares across coins. */
  valueUsd: z.number(),
  /** The top line: what happened and for how much — "Sold $200.03 · made +$19.50". */
  label: z.string(),
  /**
   * The second line, or null when there is nothing more to say.
   *
   * Defaulted so runs saved before there was a second line still read back
   * rather than failing to parse. Their top line is the old one-liner; a
   * re-run is what fixes that, not a migration.
   */
  detail: z.string().nullable().default(null),
})

export type BacktestFillMark = z.infer<typeof backtestFillMarkSchema>

/**
 * Names ladder steps as step NUMBERS — "Rung 2", "Rungs 1-3", "Rungs 1, 3".
 *
 * Deliberately not a tally. "all 1 rung" reads as rung #1 rather than "one
 * rung", and throws away the one thing worth knowing: WHICH step just closed.
 */
function rungNames(indexes: readonly number[]): string {
  const steps = [...new Set(indexes)].sort((a, b) => a - b).map((i) => i + 1)
  if (steps.length === 0) return ""
  if (steps.length === 1) return `Rung ${steps[0]}`
  const contiguous = steps.every((n, i) => i === 0 || n === steps[i - 1] + 1)
  return contiguous
    ? `Rungs ${steps[0]}-${steps[steps.length - 1]}`
    : `Rungs ${steps.join(", ")}`
}

/** How each exit reads on the chart, as something that happened. */
const EXIT_WORDS: Record<string, string> = {
  take_profit: "Took profit",
  stop_loss: "Stopped out",
  liquidated: "Liquidated",
  manual: "Closed",
  // Nothing for "order": that is a sale at a rung, which the top line already
  // says. See where this is read.
}

/**
 * The arrows for one coin: every fill, in order, each labelled with what it
 * actually was.
 *
 * A buy says which rung it was. A sell says why it happened and which rungs it
 * closed — the ladder rests one sell for the whole position, so the steps it
 * closed are the ones that were open, and that list is worth more than a count.
 */
/**
 * The arrows for a run, whatever shape its `fills` column happens to hold.
 *
 * The words used to be baked in when the run FINISHED, which meant every
 * change to the wording needed the whole backtest run again — the tooltip on
 * screen was a sentence written days ago. Runs now store the plain fills and
 * the sentence is made here, when somebody looks. Rows saved the old way are
 * already sentences, so they are handed back as they are: their wording is
 * frozen, and re-running that backtest is what unfreezes it.
 */
export function fillMarksFromStored(
  stored: readonly unknown[]
): BacktestFillMark[] {
  const rows = stored as ReadonlyArray<Record<string, unknown>>
  // The old shape carries `label` and no `reason`; the new one is the reverse.
  const alreadyWords = rows.some((row) => typeof row.label === "string")
  if (!alreadyWords) return buildFillMarks(rows as unknown as BacktestFill[])
  return rows.map((row) => {
    // An old one-liner is still split onto the two lines, so a run saved
    // before this reads the same way as a fresh one. What it CANNOT show is
    // the profit — that was never saved — and inventing one would be worse
    // than the run itself being re-run.
    const [first, ...rest] = String(row.label ?? "").split(" · ")
    return {
      at: Number(row.at),
      side: row.side === "sell" ? ("sell" as const) : ("buy" as const),
      px: Number(row.px),
      sz: Number(row.sz),
      valueUsd: Number(row.valueUsd ?? Number(row.px) * Number(row.sz)),
      label: first,
      detail: rest.length > 0 ? rest.join(" · ") : null,
    }
  })
}

export function buildFillMarks(
  fills: readonly BacktestFill[]
): BacktestFillMark[] {
  // The rungs of the cycle currently open, so a sell can name what it closed.
  let openRungs: number[] = []
  /**
   * How much coin is held, running down the fills.
   *
   * This is the ONLY reason the marks need to be built in order: a sell knows
   * its own size but not whether that emptied the position, and "Sold" without
   * that answers nothing.
   */
  let held = 0

  return [...fills]
    .sort((left, right) => left.at - right.at)
    .map((fill) => {
      // Two lines, one idea each. Everything crammed onto one line turns into a
      // row of numbers with dots between them, and by the fourth one nobody can
      // tell which figure answers which question.
      //
      //   Bought $125.04                    Sold $200.03 · made +$19.50
      //   Rung 6                            Took profit · rungs 5-6 · $82.92 left
      //
      // The top line is the money: what it did and what it was worth. The
      // second is the detail, and it is dropped entirely when there is none.
      let label: string
      let detail: string | null

      const amount = formatUsd(fill.px * fill.sz)

      if (fill.side === "buy") {
        // A rung that is not a real number is no rung at all. Saying "Rung
        // NaN" is worse than saying nothing, and a run saved in an older shape
        // is exactly where that comes from.
        const rung = Number.isFinite(fill.rung as number)
          ? (fill.rung as number)
          : null
        if (rung !== null) openRungs.push(rung)
        held += fill.sz
        label = `Bought ${amount}`
        detail = rung === null ? null : `Rung ${rung + 1}`
      } else {
        held = Math.max(0, held - fill.sz)
        // Close enough to nothing is nothing: sizes are floored to the market's
        // step, so a full close can leave a speck behind.
        const flat = held <= 1e-9

        // Both numbers, because they are two different questions. "$200.03" is
        // how much it sold; "+$19.50" is whether that was a good idea — selling
        // $200 of a coin is a win or a loss depending entirely on what it cost.
        // Fees come out of the profit, so the sign is the honest one.
        const net = fill.closedPnl - fill.fee
        label = Number.isFinite(net)
          ? `Sold ${amount} · ${net < 0 ? "lost" : "made"} ${formatSignedUsd(net)}`
          : `Sold ${amount}`

        // The word for HOW it sold, and only when that is news. A plain sale
        // at a rung has nothing to add — the line above already opens with
        // "Sold", so repeating it just pushed the rungs and the amount left
        // along by a word.
        const parts = EXIT_WORDS[fill.reason] ? [EXIT_WORDS[fill.reason]] : []
        // Lower case only when something is in front of it.
        const closed = rungNames(openRungs)
        if (closed) parts.push(parts.length > 0 ? closed.toLowerCase() : closed)
        parts.push(flat ? "all out" : `${formatUsd(held * fill.px)} left`)
        detail = parts.join(" · ")

        openRungs = []
      }

      return {
        at: fill.at,
        side: fill.side,
        px: fill.px,
        sz: fill.sz,
        valueUsd: fill.px * fill.sz,
        label,
        detail,
      }
    })
}

/**
 * Pairs a coin's fills into round trips, oldest buy first.
 *
 * First in, first out: the oldest unsold buy is the one a sell closes. That is
 * the rule the exchange itself uses and the only one that makes a ladder read
 * correctly — the deepest rung is the newest buy, so a partial sell must not be
 * allowed to claim it and flatter the result.
 *
 * Fees are shared out by size, so a sell that closed three buys puts a third of
 * its cost on each. Otherwise one row carries every fee and reads as the loser.
 */
export function pairTrades(
  fills: readonly BacktestFill[]
): BacktestTrade[] {
  const open: Array<{ at: number; px: number; sz: number; fee: number }> = []
  const closed: Array<Omit<BacktestTrade, "n">> = []

  for (const fill of [...fills].sort((left, right) => left.at - right.at)) {
    if (fill.sz <= 0) continue

    if (fill.side === "buy") {
      open.push({ at: fill.at, px: fill.px, sz: fill.sz, fee: fill.fee })
      continue
    }

    let left = fill.sz
    while (left > 1e-12 && open.length > 0) {
      const entry = open[0]
      const matched = Math.min(entry.sz, left)
      const entryFee = entry.sz > 0 ? (entry.fee * matched) / entry.sz : 0
      const exitFee = fill.sz > 0 ? (fill.fee * matched) / fill.sz : 0
      const amountUsd = entry.px * matched
      const pnl = (fill.px - entry.px) * matched - entryFee - exitFee

      closed.push({
        entryAt: entry.at,
        entryPx: entry.px,
        exitAt: fill.at,
        exitPx: fill.px,
        sz: matched,
        amountUsd,
        pnl,
        returnPct: amountUsd > 0 ? (pnl / amountUsd) * 100 : 0,
        exitReason: fill.reason,
      })

      entry.sz -= matched
      entry.fee -= entryFee
      left -= matched
      if (entry.sz <= 1e-12) open.shift()
    }
  }

  // Whatever never sold. Counted as a trade with no exit rather than dropped:
  // a strategy that ends holding its worst coin should say so.
  for (const entry of open) {
    closed.push({
      entryAt: entry.at,
      entryPx: entry.px,
      exitAt: null,
      exitPx: null,
      sz: entry.sz,
      amountUsd: entry.px * entry.sz,
      pnl: 0,
      returnPct: 0,
      exitReason: null,
    })
  }

  return closed
    .sort((left, right) => left.entryAt - right.entryAt)
    .map((trade, index) => ({ n: index + 1, ...trade }))
}

/**
 * The worst the banked money ever fell from its own high on one coin, in
 * dollars — the per-coin version of the run's worst dip.
 *
 * Walked over the trades in the order they closed, because that is the order
 * the money actually moved.
 */
export function coinWorstDip(trades: readonly BacktestTrade[]): number {
  const closed = trades
    .filter((trade) => trade.exitAt !== null)
    .sort((left, right) => (left.exitAt ?? 0) - (right.exitAt ?? 0))

  let running = 0
  let high = 0
  let worst = 0
  for (const trade of closed) {
    running += trade.pnl
    if (running > high) high = running
    worst = Math.max(worst, high - running)
  }
  return worst
}

/**
 * One coin's trades, measured — the old app's `SideStats`, ported.
 *
 * Every figure here comes off the round trips and nothing else, so it can be
 * worked out from what is already stored and checked by hand against the table.
 *
 * There is no long/short split. The ladder only ever goes long, so a short
 * column would be zeros pretending to be a measurement. It comes back the day
 * a strategy can short.
 */
export const sideStatsSchema = z.object({
  trades: z.number(),
  wins: z.number(),
  losses: z.number(),
  /** Everything the winners made, in dollars. */
  grossProfit: z.number(),
  /** Everything the losers lost, in dollars, as a positive number. */
  grossLoss: z.number(),
  /**
   * What the winners made for every dollar the losers lost. Null when nothing
   * lost — a ratio with nothing under the line is not infinity, it is unknown.
   */
  profitFactor: z.number().nullable(),
  avgTrade: z.number(),
  avgWin: z.number(),
  avgLoss: z.number(),
  largestWin: z.number(),
  largestLoss: z.number(),
  /**
   * How steady the returns were, per trade: the average return divided by how
   * much it varied, times the square root of how many there were. Higher is
   * steadier. Zero when there are too few trades to say.
   */
  sharpe: z.number(),
  /** Every fee both sides of every round trip, in dollars. */
  fees: z.number(),
})

export type SideStats = z.infer<typeof sideStatsSchema>

/** The measurements above, off a coin's round trips. */
export function sideStatsFromTrades(
  trades: readonly BacktestTrade[],
  fees: number
): SideStats {
  // An open trip has not made or lost anything yet, so it is not a result.
  const closed = trades.filter((trade) => trade.exitAt !== null)
  const wins = closed.filter((trade) => trade.pnl > 0)
  const losses = closed.filter((trade) => trade.pnl < 0)

  const total = (list: readonly BacktestTrade[]) =>
    list.reduce((sum, trade) => sum + trade.pnl, 0)
  const grossProfit = total(wins)
  const grossLoss = Math.abs(total(losses))

  const returns = closed.map((trade) => trade.returnPct)
  const mean =
    returns.length > 0
      ? returns.reduce((sum, one) => sum + one, 0) / returns.length
      : 0
  const variance =
    returns.length > 1
      ? returns.reduce((sum, one) => sum + (one - mean) ** 2, 0) /
        (returns.length - 1)
      : 0
  const spread = Math.sqrt(variance)

  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgTrade: closed.length > 0 ? total(closed) / closed.length : 0,
    avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
    avgLoss: losses.length > 0 ? -grossLoss / losses.length : 0,
    largestWin: wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0,
    largestLoss: losses.length > 0 ? Math.min(...losses.map((t) => t.pnl)) : 0,
    // Too few to say anything, or every trade identical: no spread to divide by.
    sharpe:
      returns.length > 1 && spread > 0
        ? (mean / spread) * Math.sqrt(returns.length)
        : 0,
    fees,
  }
}

/** The few numbers a list row and a per-coin table row print. */
export const backtestCoinSummarySchema = z.object({
  marketKey: z.string(),
  symbol: z.string(),
  /**
   * Made or lost on this coin, in dollars — **banked plus what it is still
   * holding**, at the last price.
   *
   * Both halves, because a ladder only ever sells at a profit: counting the
   * banked money alone would report a strategy holding a bag on every coin as
   * having never lost anything.
   */
  madeOrLost: z.number(),
  /** Positive when this coin paid funding, negative when it received it. */
  fundingPaid: z.number().default(0),
  /** Round trips, not fills. */
  trades: z.number(),
  /** How many of the closed ones banked money. */
  won: z.number(),
  /** How many closed at all — the denominator for the one above. */
  closed: z.number(),
  /**
   * How many of this coin's trades the exchange closed out, and what they cost.
   *
   * Kept apart from the other losses because it is the one ending the ladder
   * has no answer to: a stop sells and leaves the money to buy back with, and a
   * liquidation takes the position off you at the exchange's price. Defaulted
   * so every run saved before borrowing existed reads back as none, which is
   * what it was.
   */
  liquidated: z.number().default(0),
  liquidatedUsd: z.number().default(0),
  /**
   * Why this coin never got a ladder, when it did not — every reason the run
   * turned it down, and how many bars each one held it back.
   *
   * **Because "it did nothing" is not an answer.** A coin with no trades used
   * to be a blank row, and working out whether it was waiting for a base, was
   * already below one, or simply could not be afforded meant reading the price
   * history by hand against the ladder's settings. The engine decides this on
   * every bar and knew the reason each time; it was thrown away.
   *
   * Only counted on bars where a ladder COULD have been armed — a coin already
   * holding a position is not being refused, it is busy.
   *
   * Empty on runs saved before this existed, which reads correctly as "nothing
   * recorded" rather than as "never refused".
   */
  armRefusals: z
    .array(
      z.object({
        /** The engine's own code, worded by `flowWaitWords`. */
        reason: z.string(),
        /** How many bars it gave this answer. */
        bars: z.number(),
        /** The last bar it did, so it can be found on the chart. */
        lastAt: z.number(),
      })
    )
    .default([]),
  /**
   * Every change to every rung, oldest first — what the ladder actually had on
   * the book, bar by bar.
   *
   * **A fill only says what bought.** It says nothing about the rungs that did
   * not: whether they were waiting with an order, had been skipped because
   * price was already past them, or had been killed under the stop. So "price
   * fell through rung 5 and nothing happened" had no answer but guesswork.
   *
   * Changes only — a rung that sits waiting for a year is one entry, not two
   * thousand.
   */
  rungEvents: z
    .array(
      z.object({
        rung: z.number(),
        at: z.number(),
        px: z.number(),
        state: z.string(),
      })
    )
    .default([]),
  /** The worst this coin's banked money fell from its own high, in dollars. */
  worstDipUsd: z.number(),
  /**
   * The first price this coin had inside the window, or null when it covered
   * the whole of it.
   *
   * Set only for a coin that listed AFTER the window began. The window is a
   * maximum, so a young coin is tested from the day it existed rather than
   * thrown away — and then "made $40" means something different for a coin
   * that had eight months than for one that had ten years. Saying which is
   * the difference between a fair comparison and a misleading one.
   */
  startedAt: z.number().nullable().default(null),
  /** What this coin was still holding when the test ended, in dollars. */
  openAtEndUsd: z.number(),
  /** Just buying at the start and holding to the end, in dollars. */
  buyAndHold: z.number(),
  /** This coin's trades, measured. Absent on runs saved before it existed. */
  stats: sideStatsSchema.nullable().default(null),
})

export type BacktestCoinSummary = z.infer<typeof backtestCoinSummarySchema>

/**
 * The warning a run carries when it did not reach the end of its window.
 *
 * **Written once, here, because two places depend on the exact words.** The
 * engine puts it in the summary; the run page matches on it to raise a toast,
 * because a result that covers less time than it was asked for is not the
 * result of that run — a strategy that ends up well ahead can report almost
 * nothing if its run was cut off while the pot was down. A sentence copied
 * into both places would drift, and the day it drifted the toast would go
 * quiet without anybody noticing.
 */
export const BACKTEST_STOPPED_EARLY =
  "This run was stopped early, so it covers less time than it was set to."

/** True when a run's own summary says it never reached the end of its window. */
export function stoppedEarly(
  summary: Pick<BacktestSummary, "warnings"> | null
): boolean {
  return summary?.warnings.includes(BACKTEST_STOPPED_EARLY) ?? false
}

/** A coin that could not be tested, and the plain reason. */
export const backtestSkipSchema = z.object({
  marketKey: z.string(),
  symbol: z.string(),
  reason: z.string(),
})

export type BacktestSkip = z.infer<typeof backtestSkipSchema>

/**
 * The whole run in a handful of numbers — what a list page shows without
 * loading anything heavy.
 */
export const backtestSummarySchema = z.object({
  startingUsd: z.number(),
  endingUsd: z.number(),
  /** Made or lost over the whole run, in dollars. */
  madeOrLost: z.number(),
  /** The same as a share of what it started with, for the headline. */
  madeOrLostPct: z.number(),
  /** Positive when the wallet paid funding, negative when it received it. */
  fundingPaid: z.number().default(0),
  /**
   * The worst the combined pot ever fell from its own high, in dollars, and
   * when it was at its lowest.
   *
   * Measured on the **one combined line**, never averaged across coins. The
   * old app made that mistake and it flatters every result: twenty coins each
   * having a bad week at a different time averages out to a calm month that
   * nobody lived through.
   */
  worstDipUsd: z.number(),
  worstDipAt: z.number().nullable(),
  /**
   * The same fall as a share of the pot at the top it fell from — the honest
   * base. Absent on runs saved before it was worked out this way.
   */
  worstDipPct: z.number().nullable().default(null),
  /** What the pot was worth at that top, in dollars. */
  worstDipPeakUsd: z.number().nullable().default(null),
  coinsTested: z.number(),
  coinsSkipped: z.number(),
  /** How many of the tested coins ended up ahead. */
  coinsThatMadeMoney: z.number(),
  /** How much was in trades at the moment the wallet was stretched furthest. */
  peakInPlayUsd: z.number(),
  /**
   * The same moment as a share of the wallet **as it stood before that bar** —
   * how close the run came to running out of money.
   *
   * Two things this is deliberately not measured against:
   *
   * - **Not what the run started with.** With compounding on, a run that grew
   *   $10,000 into $31,000 and had $33,000 working read as "334% of the
   *   wallet" when it was using every dollar it had.
   * - **Not the pot at the end of that same bar.** Money is committed at the
   *   start of a bar, so the bar's closing pot already contains what those
   *   trades just made. Oct 10 2025 put $14,132 to work out of $14,178 — all
   *   of it — and closed at $29,332 once the coins bought at the lows were
   *   marked up. Against the close that reads 48%, which says there was room
   *   to spare when there was $46 left.
   *
   * Absent on runs saved before it was worked out this way, and a wrong percent
   * is worse than none — see how max drawdown handles the same gap.
   */
  peakInPlayPct: z.number().nullable().default(null),
  /** When it was stretched furthest. */
  peakInPlayAt: z.number().nullable(),
  /**
   * How long it stayed there, in milliseconds.
   *
   * Real time rather than a share of the run: "held 12h" answers the question
   * on its own, where a percentage sends you off to find how long the run was.
   */
  peakInPlayHeldMs: z.number(),
  /** The typical amount in trades, in dollars — the middle of the run. */
  typicalInPlayUsd: z.number(),
  /**
   * The typical share of the wallet that was in trades — the middle of every
   * bar's own share, not the typical dollars divided by the typical wallet. The
   * wallet moves, so dividing one middle by another answers a question nobody
   * asked.
   */
  typicalInPlayPct: z.number().nullable().default(null),
  /** What was in the pot at the bottom of the worst dip, in dollars. */
  potAtWorstDipUsd: z.number().nullable(),
  /** How many coins were still holding something when the window closed. */
  coinsOpenAtEnd: z.number(),
  /** What was still held when the test ended, in dollars. */
  openAtEndUsd: z.number(),
  /** Buying every tested coin at the start and holding, in dollars. */
  buyAndHold: z.number(),
  /** Round trips across every coin, not fills. */
  trades: z.number(),
  /** How many of them closed at all. */
  tradesClosed: z.number(),
  /** How many of those banked money. */
  tradesWon: z.number(),
  /**
   * How many round trips across every coin ended with the exchange closing the
   * position, and what those cost in dollars.
   *
   * On the results card rather than buried, because it is the whole price of
   * borrowing: at 1× it is always zero, and any other number is the strategy
   * being overruled. Defaulted for runs saved before borrowing existed.
   */
  tradesLiquidated: z.number().default(0),
  liquidatedUsd: z.number().default(0),
  /** Things that make the result less believable, in plain words. */
  warnings: z.array(z.string()),
})

export type BacktestSummary = z.infer<typeof backtestSummarySchema>

/** The heavy half — loaded only when somebody opens the run. */
export const backtestResultSchema = z.object({
  /** The combined pot at each bar, for the line on the run page. */
  equity: z.array(z.object({ t: z.number(), usd: z.number() })),
  /**
   * What was tied up in trades at each of those same bars, in dollars.
   *
   * **Saved so the two wallet figures can be checked.** "Peak wallet" and
   * "avg wallet" were worked out from this and then it was thrown away, which
   * left them as the only numbers on the results page that could not be
   * recomputed from anything — they had to be taken on trust, and this is a
   * page where several numbers have turned out not to deserve it.
   *
   * Same length and same order as `equity`, so a bar's pot and what it had at
   * work line up by position. Empty on runs saved before it was kept.
   */
  inPlay: z.array(z.number()).default([]),
  coins: z.array(backtestCoinSummarySchema),
  skipped: z.array(backtestSkipSchema),
})

export type BacktestResult = z.infer<typeof backtestResultSchema>

/**
 * The flow's settings exactly as they ran, frozen onto the run.
 *
 * Kept whole rather than pointed at, so editing the strategy tomorrow cannot
 * rewrite what yesterday's result says it tested. A run that could change its
 * own past is worse than no record at all.
 */
/**
 * Which strategy a run tested, and everything it needed.
 *
 * A union rather than an optional field, so a screen reading a signals run for
 * a ladder's rung count is a compile error instead of a blank. Runs recorded
 * before there were two strategies were rewritten into the `dca` shape by
 * migration 0126, so there is one shape here rather than two forever.
 */
export const backtestStrategySnapshotSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dca"),
    /** The ladder settings, exactly as the step held them. */
    params: dcaParamsSchema,
  }),
  z.object({
    kind: z.literal("signals"),
    /** Which indicators called the trades, and what each was set to. */
    indicators: indicatorSettingsSchema,
    /** What one buy signal spent, as a share of the pot. */
    stakePct: z.number(),
    /** How far a buy followed a price that ran, as a share of it. */
    chaseGiveUp: z.number(),
  }),
])

export type BacktestStrategySnapshot = z.infer<
  typeof backtestStrategySnapshotSchema
>

export const backtestSpecSnapshotSchema = z.object({
  startingUsd: z.number(),
  takerFeePct: z.number(),
  makerFeePct: z.number(),
  slippagePct: z.number(),
  days: z.number(),
  /** Shared by both strategies — the bar size the run walks. */
  interval: z.enum(CANDLE_INTERVALS),
  marketKeys: z.array(z.string()),
  strategy: backtestStrategySnapshotSchema,
  /** The window that was actually walked, epoch ms. */
  from: z.number(),
  to: z.number(),
})

export type BacktestSpecSnapshot = z.infer<typeof backtestSpecSnapshotSchema>

/** Every state one coin's row can be in. */
export const BACKTEST_STATUSES = [
  "waiting",
  "running",
  "done",
  "error",
  "skipped",
  "stopped",
] as const

export type BacktestStatus = (typeof BACKTEST_STATUSES)[number]

export const BACKTEST_STATUS_LABELS: Record<BacktestStatus, string> = {
  waiting: "Waiting",
  running: "Running",
  done: "Done",
  error: "Error",
  skipped: "Skipped",
  stopped: "Stopped",
}

/**
 * The worst the pot ever fell from its own high, in dollars, and when it was
 * lowest.
 *
 * Walked forward once over the one combined line. The high is the best the pot
 * had ever been *by that moment*, so a fall is measured against money that was
 * really there — not against a peak that came later.
 */
export function worstDip(points: readonly { t: number; usd: number }[]): {
  usd: number
  at: number | null
  /**
   * What the pot was worth at the top it fell from.
   *
   * Carried out with the fall because **a drawdown is measured against the peak
   * it fell from, not against what the run started with**. A pot that grew from
   * $10,000 to $14,700 and then gave back $4,500 fell 31%, not 45% — dividing
   * by the starting balance overstates every drawdown on a run that made money,
   * and the better the run did the more it overstates.
   */
  peak: number
} {
  let high = Number.NEGATIVE_INFINITY
  let worstShare = 0
  let worst = 0
  let at: number | null = null
  let peak = points[0]?.usd ?? 0

  for (const point of points) {
    if (point.usd > high) high = point.usd
    const dip = high - point.usd
    // **The deepest fall as a SHARE of the top it fell from, not the biggest
    // number of dollars.** They are not the same answer on a run that grew,
    // and picking by dollars hides the worse one every time: a run that went
    // from $10,000 to $107,000 reported 19.6% — $25,600 off a $130,000 peak in
    // its last month — while quietly containing a 40.5% collapse from $15,123
    // to $8,997, below what it started with, eighteen months earlier. The
    // better a run did, the more it hid. And it is the percentage that answers
    // the only question anybody has of this figure, which is whether they
    // would still have been in the trade.
    const share = high > 0 ? dip / high : 0
    if (share > worstShare) {
      worstShare = share
      worst = dip
      at = point.t
      peak = high
    }
  }

  return { usd: worst, at, peak }
}

/** The middle value of a list — the typical one, not the average. */
export function middleOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

/**
 * One row of the runs list — the small half, plus how far a live one has got.
 *
 * Its home is here rather than beside the query that builds it, because both
 * the list page and the editor's bottom panel draw it and neither may reach
 * into `@/server/*`.
 */
export type BacktestListRow = {
  id: string
  name: string | null
  automationId: string
  automationName: string
  pinned: boolean
  archived: boolean
  createdAt: number
  finishedAt: number | null
  stopRequested: boolean
  spec: BacktestSpecSnapshot
  summary: BacktestSummary | null
  /** How far the whole run has got, 0 to 1, and what it is doing. */
  progress: number
  progressNote: string
  coinsDone: number
  coinsTotal: number
}

/**
 * A run's figures, or null when it never actually tested anything.
 *
 * **A run that ends early still writes a summary.** The code that finishes a
 * run is the same whether it walked five hundred coins or was stopped in its
 * first fraction of a second, so a run that never started leaves behind a
 * complete-looking set of zeroes. On screen that reads "Made or lost $0.00,
 * Coins tested 0, Finished 9 minutes ago" — a finished backtest that found
 * nothing, rather than one that never ran, which looks exactly like the app
 * being broken.
 *
 * Both places that draw a result ask this instead of reading `summary`
 * directly, so the two can never disagree about what counts as one.
 */
export function resultSummary(
  summary: BacktestSummary | null | undefined
): BacktestSummary | null {
  if (!summary || summary.coinsTested <= 0) return null
  return summary
}

/**
 * Why a coin the run walked never traded, in the words the rest of the app
 * already uses for the same refusals.
 *
 * Null when it did trade, and null on a run saved before the reasons were
 * recorded — "nothing to say" rather than a made-up answer.
 *
 * Only the heaviest reason. A coin can be turned down for two or three
 * different things over five years of bars, but the one that held it back for
 * a thousand bars is the answer and the rest are noise; the full tally is on
 * the summary for anyone who wants it.
 */
export function whyNoLadder(
  summary: Pick<BacktestCoinSummary, "trades" | "armRefusals">
): { words: string; bars: number; lastAt: number } | null {
  if (summary.trades > 0) return null
  const worst = summary.armRefusals[0]
  if (!worst) return null
  return {
    words: flowWaitWords(worst.reason),
    bars: worst.bars,
    lastAt: worst.lastAt,
  }
}
