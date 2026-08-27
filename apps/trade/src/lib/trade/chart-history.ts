import type { CandleInterval } from "@/lib/protocols/contracts"

/**
 * How much price history a chart loads, and in what order it arrives.
 *
 * **Four hours loads everything the exchange has.** It is the timeframe the
 * strategies are judged on, and a few hundred four-hour bars is only a month
 * or two — not enough to see a coin through a crash and out the other side.
 * Every other timeframe stays a recent slice: a minute chart's full history is
 * hundreds of thousands of bars, which is a slow page and nothing anyone
 * scrolls back through.
 *
 * **It arrives in two goes.** The whole history takes a second or two to
 * gather, and a chart that shows nothing for two seconds reads as a chart that
 * is broken. So the last two years are drawn first — under a second — and the
 * rest replaces it a moment later without anything flickering, because the
 * newer bars are identical and the chart keeps its own zoom.
 *
 * Read by the browser to decide how to ask, and by the server to decide how
 * far to go, so the two can never disagree about which timeframe is which.
 */
const FULL_HISTORY: ReadonlySet<CandleInterval> = new Set<CandleInterval>([
  "4h",
])

export function wantsFullHistory(interval: CandleInterval): boolean {
  return FULL_HISTORY.has(interval)
}

/** What the chart draws while the rest of the history is still coming. */
export const FIRST_PAINT_MS = 730 * 86_400_000


/** How long one bar of each timeframe lasts. One table, read everywhere. */
const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

export function intervalMs(interval: CandleInterval): number {
  return INTERVAL_MS[interval]
}

/**
 * The most bars a chart will ever ask an exchange for.
 *
 * **This is a limit on us, not on the exchange.** The chart names the moment
 * it wants history from, and that moment arrives from the browser. An asking
 * time of 1970 on a minute chart works out at a hundred and forty-seven
 * thousand pages, each one a real request — enough to hang the app and get
 * the whole exchange to ration us, from one ordinary signed-in person. So
 * every asking time is pulled forward to this many bars ago before anything
 * is sent.
 *
 * Twenty thousand bars is more than any chart can draw and far more than the
 * longest history these exchanges keep, so nothing real is ever cut short.
 */
export const MOST_BARS_A_CHART_ASKS_FOR = 20_000

/** The earliest moment worth asking about, whatever the browser said. */
export function earliestAskable(
  interval: CandleInterval,
  since: number
): number {
  const floor = Date.now() - MOST_BARS_A_CHART_ASKS_FOR * intervalMs(interval)
  return Math.max(since, floor)
}
