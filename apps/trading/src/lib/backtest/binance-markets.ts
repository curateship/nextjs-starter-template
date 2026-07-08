import * as React from "react"

import type { MarketRow } from "@/lib/hl/hooks"

/**
 * Coin list for the backtest market picker, sourced from Binance USDT-perps
 * (the backtest data source) instead of Hyperliquid. Returns the same
 * `MarketRow` shape the picker already consumes; the backtest UI only reads
 * `coin`, `markPx`, and `prevDayPx`, so the other fields are filled with
 * neutral values. Live trading keeps using Hyperliquid's `useMarketRows`.
 */
const BINANCE_FAPI_24HR = "https://fapi.binance.com/fapi/v1/ticker/24hr"

type Binance24hr = {
  symbol: string
  lastPrice: string
  openPrice: string
  quoteVolume: string
}

/** Strips the `USDT` quote suffix to get the base coin (e.g. `BTCUSDT`→`BTC`). */
function baseCoin(symbol: string): string {
  return symbol.replace(/USDT$/, "")
}

export function useBinanceMarketRows(): MarketRow[] {
  const [rows, setRows] = React.useState<MarketRow[]>([])

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
          .map<MarketRow>((t) => ({
            coin: baseCoin(t.symbol),
            szDecimals: 0,
            maxLeverage: 0,
            markPx: t.lastPrice,
            oraclePx: t.lastPrice,
            prevDayPx: t.openPrice,
            funding: "0",
            openInterest: "0",
            dayNtlVlm: t.quoteVolume,
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
