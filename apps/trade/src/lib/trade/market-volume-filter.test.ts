import { describe, expect, it } from "vitest"

import {
  changeVisibleMarketSelection,
  filterMarketsByVolume,
  parseMarketVolume,
} from "@/lib/trade/market-volume-filter"

describe("parseMarketVolume", () => {
  it.each([
    ["10", 10_000_000],
    ["100", 100_000_000],
    [".5", 500_000],
    ["500k", 500_000],
    ["10m", 10_000_000],
    ["$100M", 100_000_000],
    ["1.5b", 1_500_000_000],
    ["750k", 750_000],
    ["1,000", 1_000_000_000],
  ])("reads %s as dollars", (value, expected) => {
    expect(parseMarketVolume(value)).toBe(expected)
  })

  it.each(["", "ten million", "10m to 100m", "-1m", "1,00", "1,,000"])(
    "rejects %s as one amount",
    (value) => {
      expect(parseMarketVolume(value)).toBeNull()
    }
  )
})

describe("filterMarketsByVolume", () => {
  it("shows only the range and orders it by highest volume first", () => {
    const markets = [
      { symbol: "LOW", volume24hUsd: 5_000_000 },
      { symbol: "MID", volume24hUsd: 25_000_000 },
      { symbol: "HIGH", volume24hUsd: 90_000_000 },
      { symbol: "TOO-HIGH", volume24hUsd: 101_000_000 },
    ]

    expect(
      filterMarketsByVolume(markets, 10_000_000, 100_000_000, "")
    ).toEqual([
      { symbol: "HIGH", volume24hUsd: 90_000_000 },
      { symbol: "MID", volume24hUsd: 25_000_000 },
    ])
  })

  it("applies search without changing the original list", () => {
    const markets = [
      { symbol: "ETH", volume24hUsd: 20_000_000 },
      { symbol: "BTC", volume24hUsd: 90_000_000 },
    ]

    expect(filterMarketsByVolume(markets, 0, Infinity, "eth")).toEqual([
      { symbol: "ETH", volume24hUsd: 20_000_000 },
    ])
    expect(markets.map((market) => market.symbol)).toEqual(["ETH", "BTC"])
  })
})

describe("changeVisibleMarketSelection", () => {
  it("replaces older hidden selections when all visible markets are selected", () => {
    const oldKeys = Array.from({ length: 500 }, (_, index) => `OLD-${index}`)
    const visibleKeys = Array.from(
      { length: 95 },
      (_, index) => `VISIBLE-${index}`
    )

    expect(
      changeVisibleMarketSelection(oldKeys, visibleKeys, true)
    ).toEqual(visibleKeys)
  })

  it("only clears the visible markets when they are deselected", () => {
    expect(
      changeVisibleMarketSelection(
        ["HIDDEN", "VISIBLE-1", "VISIBLE-2"],
        ["VISIBLE-1", "VISIBLE-2"],
        false
      )
    ).toEqual(["HIDDEN"])
  })
})
