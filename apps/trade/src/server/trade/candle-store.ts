import { and, asc, eq, gte, lt, sql } from "drizzle-orm"

import {
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
  type MarketKey,
} from "@/lib/protocols/contracts"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { fetchBinanceCandleRange } from "@/server/trade/backtest/binance-history"
import {
  tradeCandleCoverage,
  tradeCandleGaps,
  tradeCandles,
} from "@/server/trade/schema"

/**
 * The candle store: months of price history, fetched once and read many times.
 *
 * The chart asks the exchange for the last 500 bars every time it draws, and
 * that is the right shape for a chart. A backtest is the other shape entirely —
 * twenty coins over ninety days, walked bar by bar, and very likely walked
 * again tomorrow with one setting changed. Fetching that from the exchange
 * every time would be thousands of repeated requests for facts that cannot
 * change: a bar from last Tuesday is finished.
 *
 * Two ideas hold the whole thing up.
 *
 * **Only the missing ends are fetched.** The store remembers the stretch it has
 * already asked about. A second ask for the same window fetches nothing at all;
 * an ask for a wider one fetches only the parts sticking out either side.
 *
 * **What was missing is written down, never papered over.** A coin listed three
 * weeks ago has no price from ninety days ago. That comes back as fewer bars
 * than were asked for, and the shortfall is recorded as a gap. A backtest reads
 * those to skip a coin with a plain reason, or to warn about a hole in the
 * middle of its window — rather than quietly testing a shorter period and
 * calling it ninety days.
 *
 * **The bars come from Binance, not the exchange the run trades on.** That is
 * the old app's decision, ported with it: Binance keeps years of history and
 * lists far more coins, where Hyperliquid has a ~5,000-bar wall and rate-limits
 * a fifty-coin run into the ground. Live trading, order books and slippage stay
 * on Hyperliquid; only the history moves. The cost is named rather than hidden —
 * Binance prices are not Hyperliquid prices, so a run tests **the strategy**,
 * not that venue's exact fills.
 */

/**
 * How many bars have to be missing in a row before it counts as a hole worth
 * recording.
 *
 * One absent bar is ordinary: the exchange leaves out a period nothing traded
 * in, and the ladder engine carries the last price across it without noticing.
 * Three in a row is long enough to be a real outage, and a run of them in the
 * middle of a test window is something the results page should say out loud.
 */
const GAP_BARS = 3

/** Rows go in in batches, so one coin-year is not one enormous statement. */
const WRITE_BATCH = 500

export type CandleGap = {
  from: number
  to: number
  reason: string
}

export type CandleCoverageReport = {
  /** Epoch ms of the oldest bar actually stored inside the asked-for window. */
  firstBar: number | null
  /** Epoch ms of the newest bar actually stored inside it. */
  lastBar: number | null
  barCount: number
  /** Every stretch inside the window the exchange had nothing for. */
  gaps: readonly CandleGap[]
}

function intervalMs(marketKey: MarketKey, interval: CandleInterval): number {
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error(`"${marketKey}" is not a market this app knows.`)
  return getProtocol(ref.protocol).markets.intervalMs(interval)
}

/**
 * Fills in whatever part of `[from, to)` the store does not already have, and
 * says what it ended up with.
 *
 * Safe to run again with the same window: the second time fetches nothing and
 * writes nothing. Safe to run again with a wider one: only the new ends are
 * fetched. Bars are written by their own open time, so even a fetch that
 * overlaps what is already stored leaves the table exactly as it was.
 *
 * `to` is treated as exclusive and should already be a finished bar — asking
 * for a bar that is still being filled in would store a half-formed candle and
 * then never look at it again, because the window would count as covered.
 */
export async function ensureCandleCoverage(
  marketKey: MarketKey,
  interval: CandleInterval,
  from: number,
  to: number,
  database: CustomShellDb = db
): Promise<CandleCoverageReport> {
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error(`"${marketKey}" is not a market this app knows.`)
  if (!(to > from)) {
    return { firstBar: null, lastBar: null, barCount: 0, gaps: [] }
  }

  const [covered] = await database
    .select()
    .from(tradeCandleCoverage)
    .where(
      and(
        eq(tradeCandleCoverage.marketKey, marketKey),
        eq(tradeCandleCoverage.interval, interval)
      )
    )

  // The ends sticking out either side of what has already been asked about.
  // A window entirely inside the covered span leaves both of these empty, and
  // nothing is fetched at all.
  const missing: Array<{ from: number; to: number }> = []
  if (!covered) {
    missing.push({ from, to })
  } else {
    if (from < covered.fromTime) {
      missing.push({ from, to: Math.min(to, covered.fromTime) })
    }
    if (to > covered.toTime) {
      missing.push({ from: Math.max(from, covered.toTime), to })
    }
  }

  for (const end of missing) {
    if (!(end.to > end.from)) continue
    const bars = await fetchBinanceCandleRange(
      ref.marketId,
      interval,
      end.from,
      end.to
    )
    await writeCandles(marketKey, interval, bars, database)
  }

  // Written after the fetches, never before: a fetch that throws must leave
  // the window looking un-asked, or the failure would be remembered as "there
  // is nothing there" and never retried.
  if (missing.length > 0) {
    await recordCoverage(
      marketKey,
      interval,
      Math.min(from, covered?.fromTime ?? from),
      Math.max(to, covered?.toTime ?? to),
      database
    )
  }

  const report = await readCoverageReport(
    marketKey,
    interval,
    from,
    to,
    database
  )
  await recordGaps(marketKey, interval, report.gaps, database)
  return report
}

async function writeCandles(
  marketKey: MarketKey,
  interval: CandleInterval,
  bars: readonly CandleBar[],
  database: CustomShellDb
): Promise<void> {
  for (let start = 0; start < bars.length; start += WRITE_BATCH) {
    const batch = bars.slice(start, start + WRITE_BATCH)
    await database
      .insert(tradeCandles)
      .values(
        batch.map((bar) => ({
          marketKey,
          interval,
          openTime: bar.openTime,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        }))
      )
      // A bar is finished and cannot change, so the copy already stored is as
      // good as the one that just arrived. Doing nothing is also what makes a
      // repeat run cost nothing.
      .onConflictDoNothing()
  }
}

async function recordCoverage(
  marketKey: MarketKey,
  interval: CandleInterval,
  fromTime: number,
  toTime: number,
  database: CustomShellDb
): Promise<void> {
  await database
    .insert(tradeCandleCoverage)
    .values({ marketKey, interval, fromTime, toTime })
    .onConflictDoUpdate({
      target: [tradeCandleCoverage.marketKey, tradeCandleCoverage.interval],
      set: {
        // Widened, never narrowed. Two runs asking for different windows both
        // add to what is known; the smaller one must not throw the larger
        // one's history away.
        fromTime: sql`least(${tradeCandleCoverage.fromTime}, ${fromTime})`,
        toTime: sql`greatest(${tradeCandleCoverage.toTime}, ${toTime})`,
        updatedAt: sql`now()`,
      },
    })
}

/**
 * What is actually stored for this window, and where the holes are.
 *
 * Read back from the table rather than worked out from what the fetch
 * returned, so a window half of which was stored last week reports the whole
 * truth rather than only the new part.
 */
async function readCoverageReport(
  marketKey: MarketKey,
  interval: CandleInterval,
  from: number,
  to: number,
  database: CustomShellDb
): Promise<CandleCoverageReport> {
  const step = intervalMs(marketKey, interval)
  const times = await database
    .select({ openTime: tradeCandles.openTime })
    .from(tradeCandles)
    .where(candleWindow(marketKey, interval, from, to))
    .orderBy(asc(tradeCandles.openTime))

  if (times.length === 0) {
    return {
      firstBar: null,
      lastBar: null,
      barCount: 0,
      gaps: [
        {
          from,
          to,
          reason: "The exchange has no price history at all for this window.",
        },
      ],
    }
  }

  const firstBar = times[0].openTime
  const lastBar = times[times.length - 1].openTime
  const gaps: CandleGap[] = []

  // The leading hole, which is the one that matters most: it is what a coin
  // younger than the test window looks like.
  if (firstBar - from >= step * GAP_BARS) {
    gaps.push({
      from,
      to: firstBar,
      reason: `The exchange has no price for this coin before ${new Date(firstBar).toISOString().slice(0, 10)}.`,
    })
  }

  for (let index = 1; index < times.length; index += 1) {
    const previous = times[index - 1].openTime
    const current = times[index].openTime
    if (current - previous >= step * (GAP_BARS + 1)) {
      gaps.push({
        from: previous + step,
        to: current,
        reason: "The exchange had no price for this stretch.",
      })
    }
  }

  if (to - lastBar >= step * (GAP_BARS + 1)) {
    gaps.push({
      from: lastBar + step,
      to,
      reason: "The exchange had no price for the end of this window.",
    })
  }

  return { firstBar, lastBar, barCount: times.length, gaps }
}

async function recordGaps(
  marketKey: MarketKey,
  interval: CandleInterval,
  gaps: readonly CandleGap[],
  database: CustomShellDb
): Promise<void> {
  if (gaps.length === 0) return
  await database
    .insert(tradeCandleGaps)
    .values(
      gaps.map((gap) => ({
        marketKey,
        interval,
        fromTime: gap.from,
        toTime: gap.to,
        reason: gap.reason,
      }))
    )
    // Keyed by where it starts, so asking the same question again records the
    // same gap rather than a second copy of it. The end can grow as a wider
    // window is asked for, which is why it is updated rather than left alone.
    .onConflictDoUpdate({
      target: [
        tradeCandleGaps.marketKey,
        tradeCandleGaps.interval,
        tradeCandleGaps.fromTime,
      ],
      set: { toTime: sql`excluded.to_time`, reason: sql`excluded.reason` },
    })
}

function candleWindow(
  marketKey: MarketKey,
  interval: CandleInterval,
  from: number,
  to: number
) {
  return and(
    eq(tradeCandles.marketKey, marketKey),
    eq(tradeCandles.interval, interval),
    gte(tradeCandles.openTime, from),
    lt(tradeCandles.openTime, to)
  )
}

/**
 * The stored bars for a window, oldest first.
 *
 * Reads only. Whether the window is there at all is `ensureCandleCoverage`'s
 * question, and a backtest asks that first — this is the walk itself, and it
 * must not reach the network in the middle of one.
 */
export async function loadStoredCandles(
  marketKey: MarketKey,
  interval: CandleInterval,
  from: number,
  to: number,
  database: CustomShellDb = db
): Promise<CandleBar[]> {
  const rows = await database
    .select({
      openTime: tradeCandles.openTime,
      open: tradeCandles.open,
      high: tradeCandles.high,
      low: tradeCandles.low,
      close: tradeCandles.close,
      volume: tradeCandles.volume,
    })
    .from(tradeCandles)
    .where(candleWindow(marketKey, interval, from, to))
    .orderBy(asc(tradeCandles.openTime))

  return rows
}

/** Every recorded hole touching this window, for the credibility warnings. */
export async function listCandleGaps(
  marketKey: MarketKey,
  interval: CandleInterval,
  from: number,
  to: number,
  database: CustomShellDb = db
): Promise<CandleGap[]> {
  const rows = await database
    .select()
    .from(tradeCandleGaps)
    .where(
      and(
        eq(tradeCandleGaps.marketKey, marketKey),
        eq(tradeCandleGaps.interval, interval),
        lt(tradeCandleGaps.fromTime, to),
        gte(tradeCandleGaps.toTime, from)
      )
    )
    .orderBy(asc(tradeCandleGaps.fromTime))

  return rows.map((row) => ({
    from: row.fromTime,
    to: row.toTime,
    reason: row.reason,
  }))
}
