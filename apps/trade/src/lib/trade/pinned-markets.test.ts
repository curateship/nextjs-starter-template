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
  it("keeps every pin in its original order, with no limit", () => {
    const symbols = ["BTC", "ETH", "SOL", "DOGE", "AVAX", "XRP", "LINK"]
    expect(normalizePinnedMarkets(symbols.map(key))).toEqual(symbols.map(key))
  })
  it("adds a sixth pin at the end and permits removal", () => {
    const pins = ["BTC", "ETH", "SOL", "DOGE", "AVAX"].map(key)
    expect(changePinnedMarkets(pins, key("XRP"), true)).toEqual(
      ["BTC", "ETH", "SOL", "DOGE", "AVAX", "XRP"].map(key)
    )
    expect(changePinnedMarkets(pins, key("BTC"), true)).toEqual(pins)
    expect(changePinnedMarkets(pins, key("ETH"), false)).toEqual(
      ["BTC", "SOL", "DOGE", "AVAX"].map(key)
    )
    expect(pins).toHaveLength(5)
  })
})
