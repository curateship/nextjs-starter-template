import { describe, expect, it } from "vitest"

import {
  changePinnedMarkets,
  normalizePinnedMarkets,
} from "@/lib/trade/pinned-markets"

const key = (symbol: string) => `hyperliquid:mainnet:${symbol}`

describe("pinned markets", () => {
  it("drops malformed, unknown venue and unsupported chart keys, and duplicates", () => {
    expect(normalizePinnedMarkets(null)).toEqual([])
    expect(
      normalizePinnedMarkets([
        null,
        4,
        "BTC",
        "unknown:mainnet:BTC",
        "dukascopy:mainnet:btc",
        key("BTC"),
        key("ETH"),
        key("BTC"),
      ])
    ).toEqual([key("BTC"), key("ETH")])
  })
  it("keeps the first five in their original order", () => {
    expect(
      normalizePinnedMarkets(
        ["BTC", "ETH", "SOL", "DOGE", "AVAX", "XRP"].map(key)
      )
    ).toEqual(["BTC", "ETH", "SOL", "DOGE", "AVAX"].map(key))
  })
  it("refuses a sixth pin by naming all five and permits removal and replacement", () => {
    const pins = ["BTC", "ETH", "SOL", "DOGE", "AVAX"].map(key)
    expect(() => changePinnedMarkets(pins, key("XRP"), true)).toThrow(
      "You already pinned BTC, ETH, SOL, DOGE, AVAX."
    )
    expect(changePinnedMarkets(pins, key("BTC"), true)).toEqual(pins)
    const removed = changePinnedMarkets(pins, key("ETH"), false)
    expect(changePinnedMarkets(removed, key("XRP"), true)).toEqual(
      ["BTC", "SOL", "DOGE", "AVAX", "XRP"].map(key)
    )
    expect(pins).toHaveLength(5)
  })
})
