import { describe, expect, it } from "vitest"

import type {
  MarketPickerCapabilities,
  MarketRow,
} from "@/lib/protocols/contracts"
import {
  marketPickerSortKeys,
  marketPickerViews,
} from "@/lib/trade/market-picker-options"

const row = (category: MarketRow["category"]): MarketRow => ({
  key: `aster:mainnet:${category}`,
  marketId: category,
  symbol: category,
  quoteAsset: "USDT",
  subExchange: null,
  category,
  sizeDecimals: 3,
  priceTick: 0.01,
  maxLeverage: null,
  isolatedOnly: false,
  iconUrl: null,
  price: 1,
  change24h: 0,
  volume24hUsd: 1,
  fundingHourly: 0,
  openInterestUsd: null,
})

const capabilities = (
  values: Partial<MarketPickerCapabilities> = {}
): MarketPickerCapabilities => ({
  categories: "catalog",
  hip3: false,
  funding: true,
  openInterest: false,
  ...values,
})

describe("market picker options", () => {
  it("keeps only useful tabs for a crypto-only exchange", () => {
    expect(
      marketPickerViews(capabilities({ categories: "crypto-only" }), [
        row("crypto"),
      ])
    ).toEqual(["favorites", "all", "trending"])
    expect(
      marketPickerViews(capabilities({ categories: "crypto-only" }), [
        row("crypto"),
        row("stocks"),
      ])
    ).toEqual(["favorites", "all", "trending"])
  })

  it("adds both category tabs when the current catalogue has TradFi", () => {
    expect(
      marketPickerViews(capabilities(), [row("crypto"), row("stocks")])
    ).toEqual(["favorites", "all", "crypto", "tradfi", "trending"])
  })

  it("keeps Hyperliquid's full six-tab picker", () => {
    expect(
      marketPickerViews(capabilities({ categories: "full", hip3: true }), [
        row("crypto"),
      ])
    ).toEqual(["favorites", "all", "crypto", "tradfi", "hip3", "trending"])
  })

  it("removes columns the exchange cannot fill", () => {
    expect(marketPickerSortKeys(capabilities())).toEqual([
      "market",
      "price",
      "change",
      "funding",
      "volume",
    ])
  })
})
