import type {
  CandleBar,
  CandleInterval,
  NetworkId,
} from "@/lib/protocols/contracts"
import {
  PHEMEX_RESOLUTIONS,
  phemexIntervalMs,
  toPhemexBar,
} from "@/lib/protocols/phemex/translate"
import {
  MOST_BARS_A_CHART_ASKS_FOR,
  wantsFullHistory,
} from "@/lib/trade/chart-history"
import {
  heldHistory,
  inBatches,
  PAGES_AT_ONCE,
} from "@/server/protocols/full-history"
import { phemexPublic } from "@/server/protocols/phemex/client"

/**
 * Phemex's candles, in both shapes the app asks for: the recent slice a
 * chart draws, and finished historical windows for the candle store and the
 * backtests behind it ("the market key chooses the source").
 *
 * Two endpoints, both public. `/exchange/public/md/v2/kline` answers the
 * last N bars; `/exchange/public/md/v2/kline/list` answers a `[from, to)`
 * window in epoch SECONDS, capped under a thousand rows — so a long window
 * is walked in pages here, the way the Binance folder walks its own.
 */

/** The exchange refuses windows of 1000+ rows, so pages stay under it. */
const ROWS_PER_PAGE = 960

const rowsOf = (answer: unknown): unknown[] => {
  const data = answer as { rows?: unknown } | null
  return Array.isArray(data?.rows) ? data.rows : []
}

/** The recent slice a chart draws — newest bars, oldest first. */
export async function fetchPhemexCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  if (since !== undefined) {
    // A catch-up read after a gap: one finished window from `since` to now.
    // Ending it AT now and not a bar past it — Phemex refuses a window that
    // ends in the future with a bare 400, which took this whole path out.
    return fetchPhemexCandleHistory(
      network,
      marketId,
      interval,
      since,
      Date.now()
    )
  }
  if (wantsFullHistory(interval)) {
    return heldHistory(`phemex:${network}:${marketId}:${interval}`, () =>
      fetchPhemexFullHistory(network, marketId, interval)
    )
  }
  // `/kline/last` is the one recent-slice endpoint that actually answers;
  // the bare `/kline` path refuses with a permanent "try again later".
  const answer = await phemexPublic(
    network,
    "/exchange/public/md/v2/kline/last",
    {
      symbol: marketId,
      resolution: PHEMEX_RESOLUTIONS[interval],
      limit: 500,
    }
  )
  const bars = rowsOf(answer)
    .map(toPhemexBar)
    .filter((bar): bar is CandleBar => bar !== null)
  bars.sort((a, b) => a.openTime - b.openTime)
  return bars
}

/**
 * Everything Phemex still holds for this market and timeframe.
 *
 * Walked BACKWARDS from now, a page at a time, and stopped by the first page
 * that comes back empty — which is the coin's own listing day. Walking
 * forwards from a guessed start instead would ask page after page of nothing
 * for any coin younger than the guess.
 */
async function fetchPhemexFullHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval
): Promise<CandleBar[]> {
  const barMs = phemexIntervalMs(interval)
  const bars: CandleBar[] = []
  const seen = new Set<number>()
  // Now, and never a moment past it: Phemex refuses a window that ends in the
  // future outright, with a 400 and no explanation. The bar forming right now
  // still arrives, because it opened before now and the window's end is
  // exclusive.
  let to = Date.now()

  while (bars.length < MOST_BARS_A_CHART_ASKS_FOR) {
    const windows: [number, number][] = []
    for (let page = 0; page < PAGES_AT_ONCE; page += 1) {
      windows.push([to - ROWS_PER_PAGE * barMs, to])
      to -= ROWS_PER_PAGE * barMs
    }
    const pages = await inBatches(
      windows.map(([from, until]) => async () => {
        const answer = await phemexPublic(
          network,
          "/exchange/public/md/v2/kline/list",
          {
            symbol: marketId,
            resolution: PHEMEX_RESOLUTIONS[interval],
            from: Math.floor(from / 1_000),
            to: Math.floor(until / 1_000),
          }
        )
        return rowsOf(answer)
          .map(toPhemexBar)
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

/** One finished historical window, `to` exclusive, walked in pages. */
export async function fetchPhemexCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  const barMs = phemexIntervalMs(interval)
  // Every window is known before a single request goes out, because the walk
  // advances by the window ASKED for rather than the window answered — an
  // empty page is a real gap (the coin did not trade yet) and re-asking it
  // would never end. Knowing them all up front is what lets them run
  // alongside each other instead of one after another.
  const windows: [number, number][] = []
  for (let cursor = from; cursor < to; cursor += ROWS_PER_PAGE * barMs) {
    windows.push([cursor, Math.min(to, cursor + ROWS_PER_PAGE * barMs)])
  }

  const pages = await inBatches(
    windows.map(([cursor, pageEnd]) => async () => {
      const answer = await phemexPublic(
        network,
        "/exchange/public/md/v2/kline/list",
        {
          symbol: marketId,
          resolution: PHEMEX_RESOLUTIONS[interval],
          // The exchange counts in seconds; the app in milliseconds.
          from: Math.floor(cursor / 1_000),
          to: Math.floor(pageEnd / 1_000),
        }
      )
      return rowsOf(answer)
        .map(toPhemexBar)
        .filter((bar): bar is CandleBar => bar !== null)
        .filter((bar) => bar.openTime >= cursor && bar.openTime < to)
    })
  )

  const bars = pages.flat()
  bars.sort((a, b) => a.openTime - b.openTime)
  return bars
}
