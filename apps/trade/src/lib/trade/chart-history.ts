import type { CandleBar, CandleInterval } from "@/lib/protocols/contracts"
import { MAX_BACKTEST_DAYS } from "@/lib/recipes/trade-markets"
import type {
  ChartInterval,
  GroupedChartInterval,
} from "@/lib/trade/chart-interval"

/**
 * How much price history a chart loads, where each part comes from, and in
 * what order it arrives.
 *
 * **The venue supplies the last 30 days. The store supplies the rest.** A
 * candle from last Tuesday is finished and never changes, so it is fetched
 * once from the source with the longest memory (Binance for coins, Dukascopy
 * for stocks, indices, metals and currency pairs) and kept. The exchange is
 * only asked for the bars it is uniquely right about: the recent ones, where
 * its own price is the one an order would fill at.
 *
 * Tyler, 2 Sep 2026: "We only need the first 30 days of real data from the
 * protocol. The rest we can use our candle storage."
 *
 * **It arrives in two goes.** The venue's slice is one request and is drawn
 * at once. The store's rows follow a moment later and go in behind it without
 * anything flickering, because the newer bars are the same bars and the chart
 * keeps its own zoom.
 *
 * Read by the browser to decide how to ask, and by the server to decide how
 * far to go, so the two can never disagree.
 */

const DAY_MS = 86_400_000

/** The stretch the venue itself is asked for. */
export const VENUE_HISTORY_MS = 30 * DAY_MS

/**
 * The most bars the venue is asked for in that stretch.
 *
 * Thirty days of minute bars is 43,200 rows, which on Lighter is 87 requests
 * against an allowance of sixty a minute. One thousand is one page on most
 * venues and two on Lighter; on the fast timeframes the store fills in behind
 * it exactly as it does behind the 30 days.
 */
export const VENUE_SLICE_BARS = 1_000

/** The moment the venue's own slice starts from. */
export function venueSliceFrom(interval: CandleInterval, now: number): number {
  return now - Math.min(VENUE_HISTORY_MS, VENUE_SLICE_BARS * intervalMs(interval))
}

/**
 * The timeframes the store fills all the way back to the source's first bar.
 *
 * Four hours is the timeframe the strategies are judged on, and a day is the
 * one a crash is read on; a few hundred bars of either is not enough to see a
 * coin through a fall and out the other side. Every other timeframe holds
 * `MOST_BARS_A_CHART_ASKS_FOR`: a minute chart two weeks, an hour chart about
 * two years.
 */
const FULL_HISTORY: ReadonlySet<CandleInterval> = new Set<CandleInterval>([
  "4h",
  "1d",
])

export function wantsFullHistory(interval: CandleInterval): boolean {
  return FULL_HISTORY.has(interval)
}

/**
 * How long one bar of each timeframe lasts. One table, read everywhere.
 *
 * A month is written as 30 days. Months really run 28 to 31, so the number is
 * only good for sizing things on screen; the month bars themselves start on
 * each calendar 1st (see `groupCandles`).
 */
const INTERVAL_MS: Record<ChartInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": DAY_MS,
  "1w": 7 * DAY_MS,
  "1M": 30 * DAY_MS,
}

export function intervalMs(interval: ChartInterval): number {
  return INTERVAL_MS[interval]
}

/**
 * When the week or month holding `time` opened, in UTC.
 *
 * Weeks open on Monday at midnight, as they do on Binance and TradingView.
 * 1 January 1970 was a Thursday, so a day number plus three, divided by
 * seven, leaves how many days since the Monday.
 */
function periodOpenTime(
  interval: GroupedChartInterval,
  time: number
): number {
  if (interval === "1M") {
    const date = new Date(time)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  }
  const day = Math.floor(time / DAY_MS)
  return (day - ((day + 3) % 7)) * DAY_MS
}

/** Several bars as one: the first open, the highest high, the lowest low, the last close. */
function combineBars(
  openTime: number,
  bars: readonly CandleBar[]
): CandleBar {
  let high = Number.NEGATIVE_INFINITY
  let low = Number.POSITIVE_INFINITY
  let volume = 0
  for (const bar of bars) {
    if (bar.high > high) high = bar.high
    if (bar.low < low) low = bar.low
    volume += bar.volume
  }
  return {
    openTime,
    open: bars[0].open,
    high,
    low,
    close: bars[bars.length - 1].close,
    volume,
  }
}

/**
 * Day bars, oldest first, added up into one bar per calendar week or month.
 *
 * The newest week or month is still going, so its bar holds only the days so
 * far. That is the same thing an exchange's own weekly bar shows.
 */
export function groupCandles(
  days: readonly CandleBar[],
  interval: GroupedChartInterval
): CandleBar[] {
  const grouped: CandleBar[] = []
  let periodOpen = Number.NaN
  let periodDays: CandleBar[] = []
  for (const day of days) {
    const open = periodOpenTime(interval, day.openTime)
    if (open !== periodOpen) {
      if (periodDays.length > 0) {
        grouped.push(combineBars(periodOpen, periodDays))
      }
      periodOpen = open
      periodDays = []
    }
    periodDays.push(day)
  }
  if (periodDays.length > 0) grouped.push(combineBars(periodOpen, periodDays))
  return grouped
}

/**
 * The forming week or month, given the day bar that is moving right now.
 *
 * The streamed bar is today's. The earlier days of the same week or month
 * come from the day bars already loaded, so the bar on screen moves with
 * today's price without losing Monday's high.
 */
export function groupLiveBar(
  days: readonly CandleBar[],
  today: CandleBar,
  interval: GroupedChartInterval
): CandleBar {
  const open = periodOpenTime(interval, today.openTime)
  // Read from the newest end: this runs on every tick, and the days it wants
  // are the last thirty at most out of years of them.
  const earlier: CandleBar[] = []
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index]
    if (day.openTime < open) break
    if (day.openTime < today.openTime) earlier.unshift(day)
  }
  return combineBars(open, [...earlier, today])
}

/**
 * The most bars a chart will ever ask for on a timeframe that does not load
 * in full.
 *
 * **This is a limit on us, not on the exchange.** Twenty thousand bars is more
 * than any chart can draw, and it bounds what a first look at a minute chart
 * costs the source: twenty pages from Binance, once, then nothing.
 */
export const MOST_BARS_A_CHART_ASKS_FOR = 20_000

/** The oldest moment the store is asked to hold for a timeframe that does not load in full. */
export function storeDepthFrom(interval: CandleInterval, now: number): number {
  return now - MOST_BARS_A_CHART_ASKS_FOR * intervalMs(interval)
}

/**
 * The oldest moment the store keeps at all: the daily sweep removes bars
 * older than the longest backtest window. A fill that reached further back
 * would fetch gold from 2003 today and have it swept tomorrow, every day.
 */
export function storeKeepsFrom(now: number): number {
  return now - MAX_BACKTEST_DAYS * DAY_MS
}

/**
 * The venue's bars over the store's, one list, oldest first.
 *
 * Where both have a bar the venue wins: its price is the one an order would
 * fill at. The seam is the venue's first bar, and everything before it is
 * the source's, which the header says out loud.
 */
export function stitchCandles(
  older: readonly CandleBar[],
  venue: readonly CandleBar[]
): CandleBar[] {
  const byTime = new Map<number, CandleBar>()
  for (const bar of older) byTime.set(bar.openTime, bar)
  for (const bar of venue) byTime.set(bar.openTime, bar)
  return [...byTime.values()].sort((left, right) => left.openTime - right.openTime)
}
