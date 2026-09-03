import { asc, max } from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import { isHistorySource } from "@/lib/protocols/history-source"
import {
  MOST_BARS_A_CHART_ASKS_FOR,
} from "@/lib/trade/chart-history"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import {
  ensureCandleCoverage,
  fetchableThrough,
} from "@/server/trade/candle-store"
import { tradeCandleCoverage } from "@/server/trade/schema"

/**
 * Keeps the candle store's newest edge current.
 *
 * Every pass looks at what is already in coverage, finds the market and
 * timeframe pairs whose newest stored bar is behind the last closed one, and
 * tops the newest of them up. It never walks a catalogue: a market nobody
 * has charted or tested has no coverage row and is never downloaded.
 *
 * Only the history sources are topped up, which a key says by mapping to
 * itself. Rows an older build stored under a venue's own key are left alone;
 * they are harmless, the chart no longer reads them, and the ten-year sweep
 * removes them in time.
 *
 * Bounded on purpose. One pass spends at most `REQUESTS_PER_PASS` pages, so
 * it can never crowd the trading engine or a backtest out of the shared
 * `PAGES_AT_ONCE` gate. A pair whose newest stored bar is older than the
 * store's own depth for that timeframe is left alone: a backtest over 2022
 * writes minute pieces for 2022, and nobody wants two weeks of this year's
 * minutes for every coin it tested. The chart fills such a pair when
 * somebody opens it. The most-behind pairs go first, so a pair one bar behind
 * on the minute chart cannot hog every pass. Binance's own back-off and
 * Dukascopy's batch pause stay in charge of the pace under that.
 */
export const REQUESTS_PER_PASS = 20

/** Whatever a source states as its page, or the store's default. */
const DEFAULT_PAGE_BARS = 1_000

export type CandleRefreshOutcome = {
  toppedUp: number
  requests: number
}

export async function refreshCandleStore(
  database: CustomShellDb = db,
  now: number = Date.now()
): Promise<CandleRefreshOutcome> {
  const covered = await database
    .select({
      marketKey: tradeCandleCoverage.marketKey,
      interval: tradeCandleCoverage.interval,
      end: max(tradeCandleCoverage.toTime),
    })
    .from(tradeCandleCoverage)
    .groupBy(tradeCandleCoverage.marketKey, tradeCandleCoverage.interval)
    .orderBy(asc(max(tradeCandleCoverage.toTime)))

  let requests = 0
  let toppedUp = 0
  for (const row of covered) {
    if (requests >= REQUESTS_PER_PASS) break
    if (row.end === null || !isHistorySource(row.marketKey)) continue
    const ref = parseMarketKey(row.marketKey)
    if (!ref) continue

    const source = getProtocol(ref.protocol).markets
    const step = source.intervalMs(row.interval)
    // The bar still forming is never stored; the last closed one ends here,
    // or earlier where the source has not published up to it yet.
    const to = Math.min(
      Math.floor(now / step) * step,
      fetchableThrough(row.marketKey, row.interval, now)
    )
    if (row.end >= to) continue
    // Behind by more than the store holds: not live, leave it for a chart.
    if (row.end < to - MOST_BARS_A_CHART_ASKS_FOR * step) continue

    const pageMs = step * (source.historyBatchBars ?? DEFAULT_PAGE_BARS)
    const room = REQUESTS_PER_PASS - requests
    const from = Math.max(row.end, to - room * pageMs)
    const pages = Math.ceil((to - from) / pageMs)

    await ensureCandleCoverage(row.marketKey, row.interval, from, to, database)
    requests += pages
    toppedUp += 1
  }

  if (toppedUp > 0) {
    console.info(
      `[candle-refresh] topped up ${toppedUp} market timeframes with ${requests} requests (cap ${REQUESTS_PER_PASS})`
    )
  }
  return { toppedUp, requests }
}
