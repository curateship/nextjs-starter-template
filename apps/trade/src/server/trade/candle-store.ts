import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm"

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
  tradeCandleSplits,
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
 * Each store batch is saved before the next is requested. If a later batch
 * fails, earlier batches remain covered and the next run starts there.
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
  // A source that publishes a day's bars after the day ends must not have
  // today written down as covered, or today would never be asked for again.
  to = Math.min(to, fetchableThrough(marketKey, interval, Date.now()))
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

/**
 * The latest moment worth asking this source for. Unbounded unless the source
 * says its files lag behind the clock; the caller already asks for finished
 * bars only.
 */
export function fetchableThrough(
  marketKey: MarketKey,
  interval: CandleInterval,
  now: number
): number {
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error(`"${marketKey}" is not a market this app knows.`)
  const source = getProtocol(ref.protocol).markets
  return (
    source.historyPublishedThrough?.(now, interval) ?? Number.POSITIVE_INFINITY
  )
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
  const pageBars = protocol.markets.historyBatchBars ?? HISTORY_PAGE_BARS
  const pageMs = protocol.markets.intervalMs(interval) * pageBars

  for (let pageFrom = from; pageFrom < to; pageFrom += pageMs) {
    const pageTo = Math.min(to, pageFrom + pageMs)
    let bars = await protocol.markets.history(
      ref.network,
      ref.marketId,
      interval,
      pageFrom,
      pageTo
    )
    if (protocol.markets.pricesCarrySplits) {
      bars = await inTodaysUnits(marketKey, interval, bars, database)
    }
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

/**
 * How far a step between two sessions may sit from a whole number and still
 * be a split. Tesla's three-for-one on 25 Aug 2022 read as 2.94, because the
 * stock also fell two percent overnight.
 */
const SPLIT_TOLERANCE = 0.03
const SPLIT_MOST = 100
const DAY = 86_400_000

export type CandleSplit = { at: number; ratio: number }

/**
 * A split between two bars, or null.
 *
 * Only across a session boundary, only a whole-number step of two or more
 * (or its reverse), and only within the tolerance above. A stock can fall
 * by half overnight on its own, and a fall that lands on exactly two is
 * read as a split; that is the one guess in this file, and it is written
 * down in `trade_candle_splits` so it can be checked and undone.
 *
 * The answer is old units per new unit: 5 for five-for-one, 0.1 for
 * one-for-ten.
 */
export function splitBetween(prev: CandleBar, next: CandleBar): number | null {
  if (!(prev.close > 0 && next.open > 0)) return null
  if (Math.floor(prev.openTime / DAY) === Math.floor(next.openTime / DAY)) {
    return null
  }
  const down = prev.close / next.open
  for (const [candidate, reverse] of [
    [down, false],
    [1 / down, true],
  ] as const) {
    const whole = Math.round(candidate)
    if (
      whole >= 2 &&
      whole <= SPLIT_MOST &&
      Math.abs(candidate - whole) <= SPLIT_TOLERANCE * whole
    ) {
      return reverse ? 1 / whole : whole
    }
  }
  return null
}

function scaled(bar: CandleBar, ratio: number): CandleBar {
  return {
    openTime: bar.openTime,
    open: bar.open / ratio,
    high: bar.high / ratio,
    low: bar.low / ratio,
    close: bar.close / ratio,
    volume: bar.volume * ratio,
  }
}

/** Every bar before each split, divided by that split's ratio. */
function applySplits(
  bars: readonly CandleBar[],
  splits: readonly CandleSplit[]
): CandleBar[] {
  return bars.map((bar) => {
    let out = bar
    for (const split of splits) {
      if (bar.openTime < split.at) out = scaled(out, split.ratio)
    }
    return out
  })
}

async function knownSplits(
  marketKey: MarketKey,
  database: CustomShellDb
): Promise<CandleSplit[]> {
  const rows = await database
    .select({ at: tradeCandleSplits.at, ratio: tradeCandleSplits.ratio })
    .from(tradeCandleSplits)
    .where(eq(tradeCandleSplits.marketKey, marketKey))
    .orderBy(asc(tradeCandleSplits.at))
  return rows
}

/**
 * Writes a newly found split down and folds every stored bar before it, on
 * every timeframe, into the new units. Prices divide, volume multiplies.
 */
async function recordSplit(
  marketKey: MarketKey,
  split: CandleSplit,
  database: CustomShellDb
): Promise<void> {
  // Two fills of the same market can find the same split at once. The
  // record is what says who folds: only the one whose insert went in does,
  // or the stored bars would be divided twice.
  const recorded = await database
    .insert(tradeCandleSplits)
    .values({ marketKey, at: split.at, ratio: split.ratio })
    .onConflictDoNothing()
    .returning({ at: tradeCandleSplits.at })
  if (recorded.length === 0) return
  await database
    .update(tradeCandles)
    .set({
      open: sql`${tradeCandles.open} / ${split.ratio}`,
      high: sql`${tradeCandles.high} / ${split.ratio}`,
      low: sql`${tradeCandles.low} / ${split.ratio}`,
      close: sql`${tradeCandles.close} / ${split.ratio}`,
      volume: sql`${tradeCandles.volume} * ${split.ratio}`,
    })
    .where(
      and(eq(tradeCandles.marketKey, marketKey), lt(tradeCandles.openTime, split.at))
    )
  console.info(
    `[candle-store] ${marketKey}: split of ${split.ratio} on ${new Date(split.at).toISOString().slice(0, 10)}, older bars folded into today's units`
  )
}

/**
 * Raw bars from a source that publishes splits as they traded, brought into
 * today's units before they are stored.
 *
 * Splits already on record divide the bars dated before them. Then the page
 * is walked for a step that is a new split, including the steps between its
 * ends and the stored bars either side, so a split that lands in a later
 * top-up still folds the years already stored.
 */
async function inTodaysUnits(
  marketKey: MarketKey,
  interval: CandleInterval,
  raw: readonly CandleBar[],
  database: CustomShellDb
): Promise<CandleBar[]> {
  if (raw.length === 0) return []
  const sorted = [...raw].sort((left, right) => left.openTime - right.openTime)
  let bars = applySplits(sorted, await knownSplits(marketKey, database))

  const [before] = await database
    .select()
    .from(tradeCandles)
    .where(
      and(
        eq(tradeCandles.marketKey, marketKey),
        eq(tradeCandles.interval, interval),
        lt(tradeCandles.openTime, bars[0].openTime)
      )
    )
    .orderBy(desc(tradeCandles.openTime))
    .limit(1)
  const [after] = await database
    .select()
    .from(tradeCandles)
    .where(
      and(
        eq(tradeCandles.marketKey, marketKey),
        eq(tradeCandles.interval, interval),
        gte(tradeCandles.openTime, bars[bars.length - 1].openTime + 1)
      )
    )
    .orderBy(asc(tradeCandles.openTime))
    .limit(1)

  const walk: CandleBar[] = [
    ...(before ? [before] : []),
    ...bars,
    ...(after ? [after] : []),
  ]
  for (let index = 1; index < walk.length; index += 1) {
    const ratio = splitBetween(walk[index - 1], walk[index])
    if (ratio === null) continue
    const split = { at: walk[index].openTime, ratio }
    await recordSplit(marketKey, split, database)
    bars = applySplits(bars, [split])
    for (let older = 0; older < index; older += 1) {
      walk[older] = scaled(walk[older], ratio)
    }
  }
  return bars
}

/**
 * Folds splits into bars that were stored raw before the store knew about
 * splits. Walks every stored timeframe for this market; each split found is
 * recorded and applied to every timeframe at once.
 */
export async function adjustStoredSplits(
  marketKey: MarketKey,
  database: CustomShellDb = db
): Promise<CandleSplit[]> {
  const found: CandleSplit[] = []
  const intervals = await database
    .selectDistinct({ interval: tradeCandles.interval })
    .from(tradeCandles)
    .where(eq(tradeCandles.marketKey, marketKey))
  for (const { interval } of intervals) {
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
      .where(
        and(
          eq(tradeCandles.marketKey, marketKey),
          eq(tradeCandles.interval, interval)
        )
      )
      .orderBy(asc(tradeCandles.openTime))
    // Read by the step itself rather than by the record: a split already
    // folded no longer shows a step, so nothing is folded twice.
    const walk: CandleBar[] = [...rows]
    for (let index = 1; index < walk.length; index += 1) {
      const ratio = splitBetween(walk[index - 1], walk[index])
      if (ratio === null) continue
      const split = { at: walk[index].openTime, ratio }
      await recordSplit(marketKey, split, database)
      found.push(split)
      for (let older = 0; older < index; older += 1) {
        walk[older] = scaled(walk[older], ratio)
      }
    }
  }
  return found
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
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error(`"${marketKey}" is not a market this app knows.`)
  const source = getProtocol(ref.protocol).markets
  const step = source.intervalMs(interval)
  const times = await database
    .select({ openTime: tradeCandles.openTime })
    .from(tradeCandles)
    .where(candleWindow(marketKey, interval, from, to))
    .orderBy(asc(tradeCandles.openTime))

  if (source.barsOnlyInSession) {
    return sessionCoverageReport(
      times.map((row) => row.openTime),
      from,
      to
    )
  }

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

const DAY_MS = 86_400_000

/**
 * Gaps for a market that only trades during its exchange's hours.
 *
 * A stock has no bar overnight, none at the weekend and none on a holiday,
 * and none of that is missing data. So bars are counted by trading day: a
 * weekday inside the window with no bar at all is a missing day, and only
 * two or more missing weekdays in a row are written down as a gap. One
 * missing weekday on its own is a holiday, which US markets have about nine
 * of a year, and recording each as a hole would put a warning on every stock
 * result for nothing. Only whole days inside the window count, so the day
 * still in progress is never judged before its market has opened.
 */
function sessionCoverageReport(
  times: readonly number[],
  from: number,
  to: number
): CandleCoverageReport {
  const firstBar = times.length > 0 ? times[0] : null
  const lastBar = times.length > 0 ? times[times.length - 1] : null
  const daysWithBars = new Set(times.map((time) => Math.floor(time / DAY_MS)))

  const gaps: CandleGap[] = []
  let runStart: number | null = null
  let runDays = 0
  const closeRun = (endDay: number) => {
    if (runStart !== null && runDays >= 2) {
      gaps.push({
        from: runStart * DAY_MS,
        to: endDay * DAY_MS,
        reason:
          firstBar !== null && runStart * DAY_MS < firstBar
            ? `The source has no price for this market before ${new Date(firstBar).toISOString().slice(0, 10)}.`
            : "The source had no price on these trading days.",
      })
    }
    runStart = null
    runDays = 0
  }

  const firstDay = Math.ceil(from / DAY_MS)
  const lastDay = Math.floor(to / DAY_MS)
  for (let day = firstDay; day < lastDay; day += 1) {
    const weekday = new Date(day * DAY_MS).getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    if (daysWithBars.has(day)) {
      closeRun(day)
      continue
    }
    if (runStart === null) runStart = day
    runDays += 1
  }
  closeRun(lastDay)

  if (times.length === 0 && gaps.length === 0) {
    gaps.push({
      from,
      to,
      reason: "The source has no price history at all for this window.",
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
