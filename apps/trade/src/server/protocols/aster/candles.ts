import type {
  CandleBar,
  CandleInterval,
  NetworkId,
} from "@/lib/protocols/contracts"
import {
  ASTER_INTERVALS,
  asterIntervalMs,
  toAsterBar,
} from "@/lib/protocols/aster/translate"
import {
  MOST_BARS_A_CHART_ASKS_FOR,
  wantsFullHistory,
} from "@/lib/trade/chart-history"
import { asterPublic } from "@/server/protocols/aster/client"
import {
  heldHistory,
  inBatches,
  PAGES_AT_ONCE,
} from "@/server/protocols/full-history"

/** Aster permits 1,500 rows, but 1,000 costs half the request weight. */
const ROWS_PER_PAGE = 1_000

function barsOf(answer: unknown): CandleBar[] {
  const bars = (Array.isArray(answer) ? answer : [])
    .map(toAsterBar)
    .filter((bar): bar is CandleBar => bar !== null)
  bars.sort((left, right) => left.openTime - right.openTime)
  return bars
}

async function candlePage(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  return barsOf(
    await asterPublic(network, "/fapi/v3/klines", 5, {
      symbol: marketId,
      interval: ASTER_INTERVALS[interval],
      startTime: from,
      endTime: to - 1,
      limit: ROWS_PER_PAGE,
    })
  ).filter((bar) => bar.openTime >= from && bar.openTime < to)
}

/** The recent chart slice, a catch-up window, or the held four-hour history. */
export async function fetchAsterCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  if (since !== undefined) {
    return fetchAsterCandleHistory(
      network,
      marketId,
      interval,
      since,
      Date.now() + asterIntervalMs(interval)
    )
  }
  if (wantsFullHistory(interval)) {
    return heldHistory(`aster:${network}:${marketId}:${interval}`, () =>
      fetchAsterFullHistory(network, marketId, interval)
    )
  }
  return barsOf(
    await asterPublic(network, "/fapi/v3/klines", 5, {
      symbol: marketId,
      interval: ASTER_INTERVALS[interval],
      limit: ROWS_PER_PAGE,
    })
  )
}

/** Everything the exchange still holds, walked backwards in bounded batches. */
async function fetchAsterFullHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval
): Promise<CandleBar[]> {
  const barMs = asterIntervalMs(interval)
  const bars = new Map<number, CandleBar>()
  let to = Date.now() + barMs

  while (bars.size < MOST_BARS_A_CHART_ASKS_FOR) {
    const windows: [number, number][] = []
    for (let page = 0; page < PAGES_AT_ONCE; page += 1) {
      const from = to - ROWS_PER_PAGE * barMs
      windows.push([from, to])
      to = from
    }
    const pages = await inBatches(
      windows.map(
        ([from, until]) =>
          () =>
            candlePage(network, marketId, interval, from, until)
      )
    )
    const found = pages.flat()
    if (found.length === 0) break
    for (const bar of found) bars.set(bar.openTime, bar)
  }
  return [...bars.values()].sort(
    (left, right) => left.openTime - right.openTime
  )
}

/** One finished `[from, to)` window, split into Aster-sized pages. */
export async function fetchAsterCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  if (!(to > from)) return []
  const pageMs = ROWS_PER_PAGE * asterIntervalMs(interval)
  const windows: [number, number][] = []
  for (let cursor = from; cursor < to; cursor += pageMs) {
    windows.push([cursor, Math.min(to, cursor + pageMs)])
  }
  const pages = await inBatches(
    windows.map(
      ([cursor, pageEnd]) =>
        () =>
          candlePage(network, marketId, interval, cursor, pageEnd)
    )
  )
  const bars = new Map<number, CandleBar>()
  for (const bar of pages.flat()) bars.set(bar.openTime, bar)
  return [...bars.values()].sort(
    (left, right) => left.openTime - right.openTime
  )
}
