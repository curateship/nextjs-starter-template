import { describe, expect, it, vi } from "vitest"

const transports = vi.hoisted(() => ({
  trading: vi.fn(() => ({ kind: "trading" })),
  readOnly: vi.fn(() => ({ kind: "read-only" })),
}))

vi.mock("@/server/hyperliquid/transport", () => ({
  createHttpTransport: transports.trading,
  createReadOnlyHttpTransport: transports.readOnly,
}))

vi.mock("@nktkas/hyperliquid", () => ({
  InfoClient: class {
    async perpDexs() {
      return [null, { name: "xyz", fullName: "XYZ" }]
    }

    async allPerpMetas() {
      return [
        {
          collateralToken: 0,
          universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 40 }],
        },
        {
          collateralToken: 360,
          universe: [{ name: "xyz:TSLA", szDecimals: 3, maxLeverage: 10 }],
        },
      ]
    }

    async perpCategories() {
      return [["xyz:TSLA", "stocks"]]
    }

    async spotMeta() {
      return {
        tokens: [
          { index: 0, name: "USDC" },
          { index: 360, name: "USDH" },
        ],
      }
    }
  },
}))

import { getActivePerpMarkets } from "@/server/hyperliquid/info"

describe("public Hyperliquid market info", () => {
  it("loads every market without enabling mainnet order placement", async () => {
    const markets = await getActivePerpMarkets("mainnet")

    expect(markets.map((market) => market.coin)).toEqual(["BTC", "xyz:TSLA"])
    expect(transports.readOnly).toHaveBeenCalledWith("mainnet")
    expect(transports.trading).not.toHaveBeenCalled()
  })
})
