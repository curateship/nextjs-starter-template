import { describe, expect, it } from "vitest"

import { marketRowsForCatalog, parseMarketCatalog } from "@/lib/hl/hooks"
import type { PerpMarketDefinition } from "@/lib/hl/perp-markets"

const market: PerpMarketDefinition = {
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
}

describe("market catalog loading", () => {
  it("renders cached market names before live data arrives", () => {
    expect(marketRowsForCatalog([market])).toEqual([
      expect.objectContaining({
        coin: "xyz:TSLA",
        dex: "xyz",
        markPx: "0",
        dayNtlVlm: "0",
        liveData: false,
      }),
    ])
  })

  it("keeps live values while refreshed catalog details are applied", () => {
    const [loading] = marketRowsForCatalog([market])
    const live = {
      ...loading,
      markPx: "250",
      dayNtlVlm: "1000000",
      liveData: true,
    }
    const renamedExchange = { ...market, dexName: "XYZ Markets" }

    expect(marketRowsForCatalog([renamedExchange], [live])).toEqual([
      expect.objectContaining({
        dexName: "XYZ Markets",
        markPx: "250",
        dayNtlVlm: "1000000",
        liveData: true,
      }),
    ])
  })

  it("accepts valid cached catalogs and rejects corrupt entries", () => {
    expect(parseMarketCatalog(JSON.stringify([market]))).toEqual([market])
    expect(parseMarketCatalog('[{"coin":"BTC"}]')).toEqual([])
    expect(parseMarketCatalog("not json")).toEqual([])
    expect(
      parseMarketCatalog(JSON.stringify(Array(2_001).fill(market)))
    ).toEqual([])
  })
})
