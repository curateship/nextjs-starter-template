import { describe, expect, it, vi } from "vitest"

import { assertAlertMarket } from "@/lib/api/alerts"

vi.mock("@/server/hyperliquid/info", () => ({
  getActivePerpMarkets: vi
    .fn()
    .mockResolvedValue([{ coin: "BTC" }, { coin: "xyz:TSLA" }]),
}))

describe("alert market validation", () => {
  it("accepts active markets from the default and HIP-3 exchanges", async () => {
    await expect(assertAlertMarket("BTC")).resolves.toBeUndefined()
    await expect(assertAlertMarket("xyz:TSLA")).resolves.toBeUndefined()
  })

  it("rejects a market that is no longer active", async () => {
    await expect(assertAlertMarket("OLD")).rejects.toThrow(
      "This market is no longer available."
    )
  })
})
