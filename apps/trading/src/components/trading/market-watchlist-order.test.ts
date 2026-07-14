import { describe, expect, it } from "vitest"

import { filterMarketsByCoins } from "@/components/trading/market-watchlist-order"

describe("market watchlist order", () => {
  it("shows only markets with active positions", () => {
    const markets = [
      { row: { coin: "ETH" } },
      { row: { coin: "BTC" } },
      { row: { coin: "SOL" } },
    ]

    const visible = filterMarketsByCoins(markets, new Set(["ETH", "SOL"]))

    expect(visible.map((market) => market.row.coin)).toEqual(["ETH", "SOL"])
  })

  it("shows only markets with open orders", () => {
    const markets = [
      { row: { coin: "ETH" } },
      { row: { coin: "BTC" } },
      { row: { coin: "SOL" } },
    ]

    const visible = filterMarketsByCoins(markets, new Set(["BTC"]))

    expect(visible.map((market) => market.row.coin)).toEqual(["BTC"])
  })
})
