import { describe, expect, it } from "vitest"

import { pinFavoriteMarkets } from "@/components/trading/market-watchlist-order"

describe("market watchlist order", () => {
  it("pins favorites first without changing the order within each group", () => {
    const markets = [
      { row: { coin: "ETH" } },
      { row: { coin: "SUI" } },
      { row: { coin: "BTC" } },
      { row: { coin: "SOL" } },
    ]

    const ordered = pinFavoriteMarkets(markets, new Set(["SUI", "SOL"]))

    expect(ordered.map((market) => market.row.coin)).toEqual([
      "SUI",
      "SOL",
      "ETH",
      "BTC",
    ])
  })
})
