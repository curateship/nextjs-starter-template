import { describe, expect, it } from "vitest"

import {
  resolveOneClickEntryPrice,
  resolveTakeProfitPrice,
} from "@/lib/one-click-order"

describe("resolveOneClickEntryPrice", () => {
  it("uses the exact chart price for a limit template", () => {
    expect(
      resolveOneClickEntryPrice({
        markPrice: 2_000,
        useLimitOrder: true,
        limitPrice: "1950.25",
      })
    ).toBe(1_950.25)
  })

  it("uses the current price for a market template", () => {
    expect(
      resolveOneClickEntryPrice({
        markPrice: 2_000,
        useLimitOrder: false,
      })
    ).toBe(2_000)
  })

  it("requires a positive clicked price for a limit template", () => {
    expect(() =>
      resolveOneClickEntryPrice({
        markPrice: 2_000,
        useLimitOrder: true,
      })
    ).toThrow("Right-click the chart")
    expect(() =>
      resolveOneClickEntryPrice({
        markPrice: 2_000,
        useLimitOrder: true,
        limitPrice: "0",
      })
    ).toThrow("Right-click the chart")
  })
})

describe("resolveTakeProfitPrice", () => {
  it("keeps a long take-profit above the current price", () => {
    expect(
      resolveTakeProfitPrice({
        entryPrice: 1_600,
        currentPrice: 1_760,
        side: "buy",
        takeProfitPct: 5,
      })
    ).toBe(1_848)
  })

  it("keeps a short take-profit below the current price", () => {
    expect(
      resolveTakeProfitPrice({
        entryPrice: 1_900,
        currentPrice: 1_760,
        side: "sell",
        takeProfitPct: 5,
      })
    ).toBe(1_672)
  })
})
