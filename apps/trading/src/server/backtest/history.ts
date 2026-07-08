export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d"

/** Numeric OHLCV candle used by the backtest engine and chart. */
export type HistoryCandle = {
  /** Open time, ms since epoch. */
  t: number
  /** Close time, ms since epoch. */
  T: number
  o: number
  h: number
  l: number
  c: number
  v: number
  /** Trade count. */
  n: number
}

export const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/**
 * Backtest candle history, sourced from Binance (years of history, more coins,
 * cached on disk). Hyperliquid is not used for backtest candles — its ~5000-bar
 * wall is too short; live trading and slippage use the websocket market hub.
 */
export async function fetchCandleHistory(
  coin: string,
  interval: CandleInterval,
  startMs: number,
  endMs: number
): Promise<HistoryCandle[]> {
  const { fetchBinanceCandleHistory } = await import("./binance-history")
  return fetchBinanceCandleHistory(coin, interval, startMs, endMs)
}
