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
    return fetchPhemexCandleHistory(
      network,
      marketId,
      interval,
      since,
      Date.now() + phemexIntervalMs(interval)
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

/** One finished historical window, `to` exclusive, walked in pages. */
export async function fetchPhemexCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  const barMs = phemexIntervalMs(interval)
  const bars: CandleBar[] = []
  let cursor = from

  while (cursor < to) {
    const pageEnd = Math.min(to, cursor + ROWS_PER_PAGE * barMs)
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
    const page = rowsOf(answer)
      .map(toPhemexBar)
      .filter((bar): bar is CandleBar => bar !== null)
      .filter((bar) => bar.openTime >= cursor && bar.openTime < to)
    bars.push(...page)
    // Advance by the window asked, not the window answered: an empty page is
    // a real gap (the coin did not trade yet), and re-asking it forever is
    // the loop this line prevents.
    cursor = pageEnd
  }

  bars.sort((a, b) => a.openTime - b.openTime)
  return bars
}
