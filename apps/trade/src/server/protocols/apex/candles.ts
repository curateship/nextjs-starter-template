import type {
  CandleBar,
  CandleInterval,
  NetworkId,
} from "@/lib/protocols/contracts"
import { APEX_INTERVALS, toApexBar } from "@/lib/protocols/apex/translate"
import { candleIntervalMs } from "@/lib/protocols/timing"
import { apexContract } from "@/server/protocols/apex/catalogue"
import { apexPublic } from "@/server/protocols/apex/client"
import { inBatches, PAGES_AT_ONCE } from "@/server/protocols/full-history"

/**
 * **Never send `limit`.** Measured 5 Sep 2026 and again 24 Sep 2026: with a
 * `limit` over 200 ApeX answers an empty list, and with no `limit` at all it
 * hands back up to 1,500 bars, the newest ones in the window. So a page is a
 * time window of 1,400 bars, safely under 1,500, and never wider, which means
 * no page can be silently missing its oldest bars.
 */
const BARS_PER_PAGE = 1_400
/** One candle-store request becomes at most six ApeX requests together. */
export const APEX_HISTORY_BATCH_BARS = BARS_PER_PAGE * PAGES_AT_ONCE

/**
 * The earliest bar ApeX Omni can have for any market: BTCUSDT's first daily
 * bar opened 15 June 2024 00:00 UTC, measured 24 Sep 2026. ApeX states no
 * per-market start (`klineStartTime` was 0 on every row), so a walk that
 * starts earlier stops here rather than asking for empty years.
 */
export const APEX_FIRST_BAR = Date.UTC(2024, 5, 15)

export function apexHistoryFloor(): number {
  return APEX_FIRST_BAR
}

/** ApeX answers `{ data: { BTCUSDT: [ {s, i, t, o, h, l, c, v, tr} ] } }`. */
export function toApexBars(answer: unknown, marketId: string): CandleBar[] {
  const byMarket = (answer ?? {}) as Record<string, unknown>
  const list = Array.isArray(byMarket[marketId]) ? (byMarket[marketId] as unknown[]) : []
  return list
    .map(toApexBar)
    .filter((bar): bar is CandleBar => bar !== null)
    .sort((left, right) => left.openTime - right.openTime)
}

/**
 * One `[from, to)` window, in one request. ApeX takes the window in
 * seconds, and its `end` includes the bar that second falls in, so the last
 * second before `to` is asked for and the answer is trimmed to the window.
 */
async function candlePage(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  const answer = await apexPublic(
    network,
    "/klines",
    {
      symbol: marketId,
      interval: APEX_INTERVALS[interval],
      start: Math.floor(from / 1_000),
      end: Math.floor((to - 1) / 1_000),
    },
    // Somebody is sitting in front of this chart right now.
    "watched"
  )
  return toApexBars(answer, marketId).filter(
    (bar) => bar.openTime >= from && bar.openTime < to
  )
}

/** The recent chart slice, or a catch-up window from `since`. */
export async function fetchApexCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  const barMs = candleIntervalMs(interval)
  const to = Date.now() + barMs
  if (since !== undefined) {
    return fetchApexCandleHistory(network, marketId, interval, since, to)
  }
  await apexContract(network, marketId, "watched")
  return candlePage(network, marketId, interval, to - BARS_PER_PAGE * barMs, to)
}

/** One finished `[from, to)` window, split into 1,400-bar pages. */
export async function fetchApexCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  const start = Math.max(from, APEX_FIRST_BAR)
  if (!(to > start)) return []
  // A market ApeX does not list is refused here, once, rather than asked
  // about page after page.
  await apexContract(network, marketId, "watched")
  const pageMs = BARS_PER_PAGE * candleIntervalMs(interval)
  const windows: [number, number][] = []
  for (let cursor = start; cursor < to; cursor += pageMs) {
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
  return [...bars.values()].sort((left, right) => left.openTime - right.openTime)
}

