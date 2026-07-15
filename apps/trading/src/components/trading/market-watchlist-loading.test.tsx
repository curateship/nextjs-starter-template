import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { MarketWatchlist } from "@/components/trading/market-watchlist"
import type { MarketRow } from "@/lib/hl/hooks"

const loadingMarket: MarketRow = {
  coin: "xyz:TSLA",
  dex: "xyz",
  dexName: "XYZ",
  dexIndex: 1,
  assetIndex: 0,
  assetId: 110_000,
  category: "stocks",
  collateralToken: 360,
  collateralSymbol: "USDH",
  szDecimals: 3,
  maxLeverage: 10,
  onlyIsolated: false,
  markPx: "0",
  oraclePx: "0",
  prevDayPx: "0",
  funding: "0",
  openInterest: "0",
  dayNtlVlm: "0",
  liveData: false,
}

describe("market watchlist loading", () => {
  it("shows cached names with placeholders before live values arrive", () => {
    const markup = renderToStaticMarkup(
      <MarketWatchlist
        rows={[loadingMarket]}
        selected={loadingMarket.coin}
        positionMarkets={new Set()}
        openOrderMarkets={new Set()}
        favorites={new Set([loadingMarket.coin])}
        onToggleFavorite={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(markup).toContain("TSLA")
    expect(markup).toContain("—")
    expect(markup).not.toContain("+0.00%")
  })
})
