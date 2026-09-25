import { describe, expect, it } from "vitest"

import type { MarketRow } from "@/lib/protocols/contracts"
import {
  allCatalogMarketRows,
  busiestMarketKey,
  catalogMarketRow,
  filterMarketsByVolume,
  marketMeetsVolumeCutoff,
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
      minOrderValueUsd: null,
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
    expect(filtered.hiddenByVolumeRows).toEqual([rows[0]])
    expect(filtered).not.toHaveProperty("hiddenByVolumeKeys")
    expect(allCatalogMarketRows(filtered)).toEqual([rows[1], rows[0]])
    expect(catalogMarketRow(filtered, "thin")).toBe(rows[0])
    expect(catalogMarketRow(filtered, "kept")).toBe(rows[1])
  })
})

describe("the market a bare visit opens", () => {
  const row = (key: string, volume24hUsd: number) =>
    ({ key, volume24hUsd }) as MarketRow
  const catalog = (
    protocol: string,
    rows: MarketRow[],
    hiddenByVolumeRows: MarketRow[] = []
  ) =>
    ({ protocol, network: "mainnet", rows, hiddenByVolumeRows }) as unknown as Parameters<
      typeof busiestMarketKey
    >[0][number]

  it("is this exchange's busiest listed market", () => {
    const catalogs = [
      catalog("hyperliquid", [row("hyperliquid:mainnet:BTC", 9e9)]),
      catalog("apex", [row("apex:mainnet:ETHUSDT", 1e7), row("apex:mainnet:BTCUSDT", 3e8)]),
    ]
    expect(busiestMarketKey(catalogs, "apex", "mainnet")).toBe("apex:mainnet:BTCUSDT")
  })

  it("uses the hidden rows only when the volume setting hides every market", () => {
    const catalogs = [catalog("apex", [], [row("apex:mainnet:SOLUSDT", 5)])]
    expect(busiestMarketKey(catalogs, "apex", "mainnet")).toBe("apex:mainnet:SOLUSDT")
  })

  it("is nothing while the list has not arrived", () => {
    expect(busiestMarketKey([], "apex", "mainnet")).toBeNull()
    expect(busiestMarketKey([catalog("apex", [])], "apex", "testnet")).toBeNull()
  })
})
