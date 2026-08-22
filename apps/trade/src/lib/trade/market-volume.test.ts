import { describe, expect, it } from "vitest"

import {
  filterMarketsByVolume,
  marketMeetsVolumeCutoff,
  marketWasHiddenByVolume,
  readMinimumMarketVolume,
} from "@/lib/trade/market-volume"

describe("the market volume cutoff", () => {
  it("keeps the existing zero-volume rule when no cutoff was saved", () => {
    expect(readMinimumMarketVolume(undefined)).toBe(0)
    expect(marketMeetsVolumeCutoff(0, 0)).toBe(false)
    expect(marketMeetsVolumeCutoff(1, 0)).toBe(true)
  })

  it("keeps a market at the cutoff and hides one below it", () => {
    expect(marketMeetsVolumeCutoff(9_999_999, 10_000_000)).toBe(false)
    expect(marketMeetsVolumeCutoff(10_000_000, 10_000_000)).toBe(true)
  })

  it("drops a saved value this build cannot use", () => {
    expect(readMinimumMarketVolume(-1)).toBe(0)
    expect(readMinimumMarketVolume(Number.POSITIVE_INFINITY)).toBe(0)
    expect(readMinimumMarketVolume("10000000")).toBe(0)
  })

  it("removes low-volume rows before any dashboard view receives them", () => {
    const row = (key: string, volume24hUsd: number) => ({
      key,
      marketId: key,
      symbol: key,
      quoteAsset: "USDC" as const,
      subExchange: null,
      category: "crypto" as const,
      sizeDecimals: null,
      priceTick: null,
      maxLeverage: null,
      isolatedOnly: false,
      iconUrl: null,
      price: 1,
      change24h: null,
      volume24hUsd,
      fundingHourly: null,
      openInterestUsd: null,
    })
    const rows = [row("thin", 4_999_999), row("kept", 5_000_000)]
    const catalog = {
      protocol: "hyperliquid" as const,
      protocolLabel: "Hyperliquid",
      network: "mainnet" as const,
      networkLabel: "Mainnet",
      picker: {
        categories: "full" as const,
        hip3: true,
        funding: true,
        openInterest: true,
      },
      rows,
    }

    const filtered = filterMarketsByVolume(catalog, 5_000_000)
    expect(filtered.rows).toEqual([rows[1]])
    expect(filtered.hiddenByVolumeKeys).toEqual(["thin"])
    expect(marketWasHiddenByVolume([filtered], "thin")).toBe(true)
    expect(marketWasHiddenByVolume([filtered], "not-listed")).toBe(false)
  })
})
