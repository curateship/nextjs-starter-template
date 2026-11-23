import * as React from "react"

/**
 * Coin list for the backtest market picker, sourced from Binance USDT-perps
 * (the backtest data source) instead of Hyperliquid. This stays independent
 * from the live Hyperliquid catalog so expanding live markets cannot change
 * backtest behavior.
 */
const BINANCE_FAPI_24HR = "https://fapi.binance.com/fapi/v1/ticker/24hr"

type Binance24hr = {
  symbol: string
  lastPrice: string
  openPrice: string
  quoteVolume: string
}

export type BacktestMarketRow = {
  coin: string
  markPx: string
  prevDayPx: string
  /** Traded value over the last 24h, in USDT. The picker's liquidity filters
   * read this. It is TODAY's volume, not what the coin traded during a past
   * backtest window — a coin can be liquid now and have been thin then. */
  dayVolumeUsd: number
}

/** Strips the `USDT` quote suffix to get the base coin (e.g. `BTCUSDT`→`BTC`). */
function baseCoin(symbol: string): string {
  return symbol.replace(/USDT$/, "")
}

export function useBinanceMarketRows(): BacktestMarketRow[] {
  const [rows, setRows] = React.useState<BacktestMarketRow[]>([])

  React.useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const res = await fetch(BINANCE_FAPI_24HR)
        if (!res.ok) return
        const tickers = (await res.json()) as Binance24hr[]
        if (cancelled) return
        const next = tickers
          .filter((t) => t.symbol.endsWith("USDT"))
          // Most-liquid coins first, matching how a trader scans a list.
          .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
          .map<BacktestMarketRow>((t) => ({
            coin: baseCoin(t.symbol),
            markPx: t.lastPrice,
            prevDayPx: t.openPrice,
            dayVolumeUsd: Number(t.quoteVolume) || 0,
          }))
        setRows(next)
      } catch {
        // transient; next poll retries
      }
    }

    // The coin list rarely changes and prices only seed a default, so fetch
    // once when the picker opens instead of polling.
    void refresh()
    return () => {
      cancelled = true
    }
  }, [])

  return rows
}
