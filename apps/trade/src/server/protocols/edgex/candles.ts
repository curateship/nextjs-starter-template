import type {
  CandleBar,
  CandleInterval,
  NetworkId,
} from "@/lib/protocols/contracts"
import { EDGEX_INTERVALS, toEdgexBar } from "@/lib/protocols/edgex/translate"
import { candleIntervalMs } from "@/lib/protocols/timing"
import { edgexContract } from "@/server/protocols/edgex/catalogue"
import { edgexPublic } from "@/server/protocols/edgex/client"
import { inBatches, PAGES_AT_ONCE } from "@/server/protocols/full-history"

/**
 * edgeX hands back at most 1,000 bars a call (1,001 answered
 * `INVALID_GET_PAGE_SIZE`), newest first. A call can be paged onward with
 * `offsetData`, but a time window can be asked for directly with
 * `filterBeginKlineTimeInclusive` and `filterEndKlineTimeExclusive`: a window
 * one thousand bars wide never has a second page, so pages are windows and
 * several go out together.
 */
const BARS_PER_PAGE = 1_000
/** One candle-store request becomes at most six edgeX requests together. */
export const EDGEX_HISTORY_BATCH_BARS = BARS_PER_PAGE * PAGES_AT_ONCE

/**
 * The earliest bar edgeX can have for any contract. Its v2 books are young:
 * ETHUSDC's first daily bar opened 9 May 2026, BTCUSDC's 12 May and SPYUSDC's
 * 19 May, measured 24 Sep 2026. A walk that starts earlier stops here, and
 * everything older comes from the borrowed history (Binance for coins,
 * Dukascopy for stocks and metals).
 */
export const EDGEX_FIRST_BAR = Date.UTC(2026, 4, 9)

export function edgexHistoryFloor(): number {
  return EDGEX_FIRST_BAR
}

/** `{ dataList: [...] }`, newest first, as bars oldest first. */
export function toEdgexBars(answer: unknown): CandleBar[] {
  const list = (answer as { dataList?: unknown } | null)?.dataList
  return (Array.isArray(list) ? list : [])
    .map(toEdgexBar)
    .filter((bar): bar is CandleBar => bar !== null)
    .sort((left, right) => left.openTime - right.openTime)
}

/** One `[from, to)` window, in one request, priced on trades. */
async function candlePage(
  network: NetworkId,
  contractId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  const answer = await edgexPublic(
    network,
    "/api/v2/public/quote/getKline",
    {
      contractId,
      klineType: EDGEX_INTERVALS[interval],
      priceType: "LAST_PRICE",
      size: BARS_PER_PAGE,
      filterBeginKlineTimeInclusive: from,
      filterEndKlineTimeExclusive: to,
    },
    // Somebody is sitting in front of this chart right now.
    "watched"
  )
  return toEdgexBars(answer).filter((bar) => bar.openTime >= from && bar.openTime < to)
}

/** The recent chart slice, or a catch-up window from `since`. */
export async function fetchEdgexCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  const barMs = candleIntervalMs(interval)
  const to = Date.now() + barMs
  if (since !== undefined) {
    return fetchEdgexCandleHistory(network, marketId, interval, since, to)
  }
  const { contractId } = await edgexContract(network, marketId, "watched")
  return candlePage(network, contractId, interval, to - BARS_PER_PAGE * barMs, to)
}

/** One finished `[from, to)` window, split into 1,000-bar pages. */
export async function fetchEdgexCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  const start = Math.max(from, EDGEX_FIRST_BAR)
  if (!(to > start)) return []
  // A market edgeX does not list is refused here, once, rather than asked
  // about page after page.
  const { contractId } = await edgexContract(network, marketId, "watched")
  const pageMs = BARS_PER_PAGE * candleIntervalMs(interval)
  const windows: [number, number][] = []
  for (let cursor = start; cursor < to; cursor += pageMs) {
    windows.push([cursor, Math.min(to, cursor + pageMs)])
  }
  const pages = await inBatches(
    windows.map(
      ([cursor, pageEnd]) =>
        () =>
          candlePage(network, contractId, interval, cursor, pageEnd)
    )
  )
  const bars = new Map<number, CandleBar>()
  for (const bar of pages.flat()) bars.set(bar.openTime, bar)
  return [...bars.values()].sort((left, right) => left.openTime - right.openTime)
}
