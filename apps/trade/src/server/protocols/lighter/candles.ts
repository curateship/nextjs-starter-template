import type {
  CandleBar,
  CandleInterval,
  NetworkId,
} from "@/lib/protocols/contracts"
import {
  LIGHTER_INTERVALS,
  toLighterBar,
} from "@/lib/protocols/lighter/translate"
import { candleIntervalMs } from "@/lib/protocols/timing"
import { lighterPublic } from "@/server/protocols/lighter/client"
import { lighterMarketFacts } from "@/server/protocols/lighter/markets"
import { inBatches, PAGES_AT_ONCE } from "@/server/protocols/full-history"

/**
 * The most bars Lighter hands over in one answer, measured 26 Aug 2026: a
 * 700-hour ask came back as the newest 500 rows. Windows are cut to this
 * size so no page is silently missing its oldest bars.
 */
const ROWS_PER_PAGE = 500
/** Docs say the rest of the endpoints weigh 300; candles are not listed. */
const CANDLES_WEIGHT = 300
/** One candle-store request becomes at most six Lighter requests together. */
export const LIGHTER_HISTORY_BATCH_BARS = ROWS_PER_PAGE * PAGES_AT_ONCE

/** Lighter answers `{code, r, c}`, where `c` is the list of bars. */
function barsOf(answer: unknown): CandleBar[] {
  const rows = (answer as { c?: unknown } | null) ?? {}
  const list = Array.isArray(rows.c) ? rows.c : []
  const bars = list
    .map(toLighterBar)
    .filter((bar): bar is CandleBar => bar !== null)
  bars.sort((left, right) => left.openTime - right.openTime)
  return bars
}

async function candlePage(
  network: NetworkId,
  marketId: number,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  return barsOf(
    await lighterPublic(
      network,
      "/api/v1/candles",
      CANDLES_WEIGHT,
      {
        market_id: marketId,
        resolution: LIGHTER_INTERVALS[interval],
        start_timestamp: from,
        end_timestamp: to - 1,
        count_back: ROWS_PER_PAGE,
      },
      // Somebody is sitting in front of this chart right now.
      "watched"
    )
  ).filter((bar) => bar.openTime >= from && bar.openTime < to)
}

/**
 * The recent chart slice, or a catch-up window from `since`.
 *
 * Never the venue's whole history. Lighter allows sixty requests a minute
 * for everything, and a chart's older bars come from the candle store's
 * history source instead; a market no source covers keeps to its recent
 * slice, which is one request.
 */
export async function fetchLighterCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  if (since !== undefined) {
    return fetchLighterCandleHistory(
      network,
      marketId,
      interval,
      since,
      Date.now() + candleIntervalMs(interval)
    )
  }
  const { id } = await lighterMarketFacts(network, marketId)
  const barMs = candleIntervalMs(interval)
  const to = Date.now() + barMs
  return candlePage(network, id, interval, to - ROWS_PER_PAGE * barMs, to)
}

/**
 * One finished `[from, to)` window, split into Lighter-sized pages.
 *
 * A window that starts before the market did is pulled forward to its first
 * day. A backtest asking three years of a coin that is six months old would
 * otherwise spend most of its requests on empty pages, and Lighter allows
 * sixty a minute.
 */
export async function fetchLighterCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  if (!(to > from)) return []
  const { id, bornAt } = await lighterMarketFacts(network, marketId)
  const start = bornAt === null ? from : Math.max(from, bornAt)
  if (!(to > start)) return []
  const pageMs = ROWS_PER_PAGE * candleIntervalMs(interval)
  const windows: [number, number][] = []
  for (let cursor = start; cursor < to; cursor += pageMs) {
    windows.push([cursor, Math.min(to, cursor + pageMs)])
  }
  const pages = await inBatches(
    windows.map(
      ([cursor, pageEnd]) =>
        () =>
          candlePage(network, id, interval, cursor, pageEnd)
    )
  )
  const bars = new Map<number, CandleBar>()
  for (const bar of pages.flat()) bars.set(bar.openTime, bar)
  return [...bars.values()].sort(
    (left, right) => left.openTime - right.openTime
  )
}
