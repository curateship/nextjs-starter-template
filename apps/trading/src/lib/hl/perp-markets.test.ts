import { describe, expect, it } from "vitest"

import { buildPerpMarkets, normalizePerpCategory } from "./perp-markets"

describe("buildPerpMarkets", () => {
  it("combines the default and HIP-3 exchanges with correct asset IDs", () => {
    const markets = buildPerpMarkets(
      [null, { name: "xyz", fullName: "XYZ" }],
      [
        {
          collateralToken: 0,
          universe: [
            { name: "BTC", szDecimals: 5, maxLeverage: 40 },
            {
              name: "OLD",
              szDecimals: 2,
              maxLeverage: 3,
              isDelisted: true,
            },
          ],
        },
        {
          collateralToken: 360,
          universe: [{ name: "xyz:TSLA", szDecimals: 3, maxLeverage: 10 }],
        },
      ],
      [["xyz:TSLA", "stocks"]],
      [
        { index: 0, name: "USDC" },
        { index: 360, name: "USDH" },
      ]
    )

    expect(markets).toEqual([
      expect.objectContaining({
        coin: "BTC",
        dex: "",
        assetId: 0,
        category: "crypto",
        collateralSymbol: "USDC",
      }),
      expect.objectContaining({
        coin: "xyz:TSLA",
        dex: "xyz",
        dexIndex: 1,
        assetIndex: 0,
        assetId: 110_000,
        category: "stocks",
        collateralSymbol: "USDH",
      }),
    ])
  })

  it("skips metadata whose HIP-3 exchange descriptor is unavailable", () => {
    const markets = buildPerpMarkets(
      [null],
      [
        { collateralToken: 0, universe: [] },
        {
          collateralToken: 0,
          universe: [{ name: "missing:ABC", szDecimals: 2, maxLeverage: 3 }],
        },
      ],
      [],
      []
    )

    expect(markets).toEqual([])
  })
})

describe("normalizePerpCategory", () => {
  it("normalizes Hyperliquid categories and safe defaults", () => {
    expect(normalizePerpCategory("FX", 1)).toBe("forex")
    expect(normalizePerpCategory("preipo", 1)).toBe("stocks")
    expect(normalizePerpCategory(undefined, 0)).toBe("crypto")
    expect(normalizePerpCategory("new-category", 1)).toBe("other")
  })
})
