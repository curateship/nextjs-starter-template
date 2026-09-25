import type {
  CandleBar,
  CandleInterval,
  MarketKey,
} from "@/lib/protocols/contracts"
import { intervalMs } from "@/lib/trade/chart-history"
import { db, type CustomShellDb } from "@/server/db"
import { loadStoredCandles } from "@/server/trade/candle-store"
import { resolveHistorySource } from "@/server/trade/history-source"

/**
 * The finished candles an alert judges a break on.
 *
 * **Finished only.** The bar still forming has a close that is just the price
 * right now, and firing on it would be the touch alert wearing a candle's
 * name. The newest bar this can return is the one whose whole period is
 * already in the past.
 *
 * **From the store, under the key that actually holds this market's
 * history.** A Hyperliquid line on NEAR is judged on the NEAR bars the store
 * keeps, which come from Binance — the same rows the chart draws behind the
 * venue's own recent slice. `charts/candle-store.md` says why the store keeps
 * one copy per coin rather than one per venue. What it means here is worth
 * saying out loud: the volume compared is the source's volume, not the
 * venue's, and for a coin that trades far more on Binance than on the venue
 * that is the better number anyway.
 *
 * **A market with no stored bars answers nothing**, and the line goes on
 * waiting. That is the honest answer for a coin nobody has charted or tested
 * yet: the store fills from the chart and from backtests, never by walking a
 * catalogue, so a market can genuinely have no rows at all.
 */
export async function loadFinishedCandles(input: {
  marketKey: MarketKey
  interval: CandleInterval
  /** How many finished bars back, newest last. */
  count: number
  now: number
  database?: CustomShellDb
}): Promise<CandleBar[]> {
  const step = intervalMs(input.interval)
  if (!(step > 0) || input.count < 1) return []
  // The open time of the bar still forming. Everything before it is finished.
  const forming = Math.floor(input.now / step) * step
  // **Twice the asked-for window.** A hole in the store would otherwise block
  // a line for good: with room for exactly twenty-one bars, one missing row
  // leaves nineteen behind the break, and nineteen is not the average the
  // condition asks for. Reading wider and taking what is there means the
  // twenty are the twenty nearest the break the store actually holds.
  const from = forming - step * input.count * 2
  // A catalogue this cannot reach must not take the whole alert pass down
  // with it. Falling back to the market's own key finds rows if the venue
  // stores its own, and finds none otherwise, which is the waiting state.
  const source = await resolveHistorySource(input.marketKey).catch(() => null)
  const bars = await loadStoredCandles(
    source ?? input.marketKey,
    input.interval,
    from,
    forming,
    input.database ?? db
  )
  return bars.slice(-input.count)
}

/** When the bar that opened at this time finished. */
export function candleCloseTime(
  openTime: number,
  interval: CandleInterval
): number {
  return openTime + intervalMs(interval)
}
