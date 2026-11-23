import type {
  CandleBar,
  CandleInterval,
  NetworkId,
} from "@/lib/protocols/contracts"
import {
  KUCOIN_GRANULARITIES,
  kucoinIntervalMs,
  toKucoinBar,
} from "@/lib/protocols/kucoin/translate"
import {
  MOST_BARS_A_CHART_ASKS_FOR,
  wantsFullHistory,
} from "@/lib/trade/chart-history"
import {
  heldHistory,
  inBatches,
  PAGES_AT_ONCE,
} from "@/server/protocols/full-history"
import { kucoinPublic } from "@/server/protocols/kucoin/client"

/**
 * KuCoin's candles, in both shapes the app asks for: the recent slice a chart
 * draws, and finished historical windows for the candle store and the
 * backtests behind it.
 *
 * One public endpoint answers both — `/api/v1/kline/query` with a `from` and
 * a granularity in minutes — but it hands back **at most 200 bars per call**,
 * measured against the live exchange rather than taken from the docs. So a
 * window longer than that is walked forward in pages, and the walk advances
 * by the window it ASKED for rather than by what came back: an empty page is
 * a real gap (the coin had not listed yet), and advancing by the answer would
 * ask the same empty window forever.
 */

const ROWS_PER_PAGE = 200

/** The recent slice a chart draws — newest bars, oldest first. */
export async function fetchKucoinCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  const barMs = kucoinIntervalMs(interval)
  const to = Date.now() + barMs
  if (since === undefined && wantsFullHistory(interval)) {
    return heldHistory(`kucoin:${network}:${marketId}:${interval}`, () =>
      fetchKucoinFullHistory(network, marketId, interval)
    )
  }
  const from = since ?? to - ROWS_PER_PAGE * barMs
  return fetchKucoinCandleHistory(network, marketId, interval, from, to)
}

/**
 * Everything KuCoin still holds for this market and timeframe.
 *
 * Walked BACKWARDS from now, six pages of two hundred bars at a time, and
 * stopped by the first batch that comes back completely empty — the coin's
 * own listing day. Walking forwards from a guessed start would ask page after
 * page of nothing for any coin younger than the guess, and at two hundred
 * bars a page that is a great many empty asks.
 */
async function fetchKucoinFullHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval
): Promise<CandleBar[]> {
  const barMs = kucoinIntervalMs(interval)
  const bars: CandleBar[] = []
  const seen = new Set<number>()
  let to = Date.now() + barMs

  while (bars.length < MOST_BARS_A_CHART_ASKS_FOR) {
    const windows: [number, number][] = []
    for (let page = 0; page < PAGES_AT_ONCE; page += 1) {
      windows.push([to - ROWS_PER_PAGE * barMs, to])
      to -= ROWS_PER_PAGE * barMs
    }
    const pages = await inBatches(
      windows.map(([from, until]) => async () => {
        const answer = await kucoinPublic(network, "/api/v1/kline/query", {
          symbol: marketId,
          granularity: KUCOIN_GRANULARITIES[interval],
          from: Math.floor(from),
          to: Math.floor(until),
        })
        return (Array.isArray(answer) ? answer : [])
          .map(toKucoinBar)
          .filter((bar): bar is CandleBar => bar !== null)
      })
    )

    const found = pages.flat()
    // A whole batch of nothing is the coin's listing day, and the end of the
    // walk. One empty page inside a batch is not: an exchange can have a hole
    // in the middle of a history, and stopping on it would hide everything
    // before it.
    if (found.length === 0) break
    for (const bar of found) {
      if (seen.has(bar.openTime)) continue
      seen.add(bar.openTime)
      bars.push(bar)
    }
  }

  bars.sort((a, b) => a.openTime - b.openTime)
  return bars
}

/** One finished historical window, `to` treated as exclusive. */
export async function fetchKucoinCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  const barMs = kucoinIntervalMs(interval)
  // Every window is known before a single request goes out — see the note on
  // the walk above — which is what lets them run alongside each other.
  const windows: [number, number][] = []
  for (let cursor = from; cursor < to; cursor += ROWS_PER_PAGE * barMs) {
    windows.push([cursor, Math.min(to, cursor + ROWS_PER_PAGE * barMs)])
  }

  const pages = await inBatches(
    windows.map(([cursor, pageEnd]) => async () => {
      const answer = await kucoinPublic(network, "/api/v1/kline/query", {
        symbol: marketId,
        granularity: KUCOIN_GRANULARITIES[interval],
        from: Math.floor(cursor),
        to: Math.floor(pageEnd),
      })
      return (Array.isArray(answer) ? answer : [])
        .map(toKucoinBar)
        .filter((bar): bar is CandleBar => bar !== null)
    })
  )

  const bars: CandleBar[] = []
  const seen = new Set<number>()
  for (const bar of pages.flat()) {
    if (bar.openTime < from || bar.openTime >= to) continue
    // The windows sit back to back, and an exchange that returns a bar on
    // both sides of a boundary would otherwise draw it twice.
    if (seen.has(bar.openTime)) continue
    seen.add(bar.openTime)
    bars.push(bar)
  }

  bars.sort((a, b) => a.openTime - b.openTime)
  return bars
}
