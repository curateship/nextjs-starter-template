import { and, asc, eq, gte, lt, sql } from "drizzle-orm"

import {
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
  type MarketKey,
  type MarketRef,
} from "@/lib/protocols/contracts"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
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
 * **The market key chooses the source.** A Hyperliquid key stores Hyperliquid
 * candles and a Binance key stores Binance candles. The store reaches either
 * one through the protocol registry, so no exchange package leaks into the
 * backtest and no result quietly mixes one venue's prices with another's.
 */

/**
 * Each page is saved before the next is requested. If page five fails, pages
 * one through four remain covered and the next run starts at page five.
 */
const HISTORY_PAGE_BARS = 1_000

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

  const covered = await database
    .select()
    .from(tradeCandleCoverage)
    .where(
      and(
        eq(tradeCandleCoverage.marketKey, marketKey),
        eq(tradeCandleCoverage.interval, interval)
      )
    )
    .orderBy(asc(tradeCandleCoverage.fromTime))

  // Coverage is kept as separate pieces. Joining two distant windows into one
  // span would claim the untouched middle had already been fetched.
  const missing = missingCoverage(from, to, covered)

  for (const range of missing) {
    await fetchMissingRange(
      ref,
      marketKey,
      interval,
      range.from,
      range.to,
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

function missingCoverage(
  from: number,
  to: number,
  covered: ReadonlyArray<{ fromTime: number; toTime: number }>
): Array<{ from: number; to: number }> {
  const missing: Array<{ from: number; to: number }> = []
  let cursor = from

  for (const range of covered) {
    if (range.toTime <= cursor) continue
    if (range.fromTime >= to) break
    if (range.fromTime > cursor) {
      missing.push({ from: cursor, to: Math.min(to, range.fromTime) })
    }
    cursor = Math.max(cursor, range.toTime)
    if (cursor >= to) return missing
  }

  if (cursor < to) missing.push({ from: cursor, to })
  return missing
}

async function fetchMissingRange(
  ref: MarketRef,
  marketKey: MarketKey,
  interval: CandleInterval,
  from: number,
  to: number,
  database: CustomShellDb
): Promise<void> {
  const protocol = getProtocol(ref.protocol)
  const pageMs = protocol.markets.intervalMs(interval) * HISTORY_PAGE_BARS

  for (let pageFrom = from; pageFrom < to; pageFrom += pageMs) {
    const pageTo = Math.min(to, pageFrom + pageMs)
    const bars = await protocol.markets.history(
      ref.network,
      ref.marketId,
      interval,
      pageFrom,
      pageTo
    )
    await writeCandles(marketKey, interval, bars, database)
    // Written after this page succeeds, never before. A later failure leaves
    // this exact progress on record, so retrying resumes at the failed page.
    await recordCoverage(
      marketKey,
      interval,
      pageFrom,
      pageTo,
      database
    )
  }
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
      target: [
        tradeCandleCoverage.marketKey,
        tradeCandleCoverage.interval,
        tradeCandleCoverage.fromTime,
      ],
      set: {
        // Concurrent runs may finish the same page. Keep the widest successful
        // answer that begins here without joining it to a distant page.
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
  if (firstBar - from >= step) {
    gaps.push({
      from,
      to: firstBar,
      reason: `The exchange has no price for this coin before ${new Date(firstBar).toISOString().slice(0, 10)}.`,
    })
  }

  for (let index = 1; index < times.length; index += 1) {
    const previous = times[index - 1].openTime
    const current = times[index].openTime
    if (current - previous >= step * 2) {
      gaps.push({
        from: previous + step,
        to: current,
        reason: "The exchange had no price for this stretch.",
      })
    }
  }

  if (to - lastBar >= step * 2) {
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
