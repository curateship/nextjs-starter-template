import { describe, expect, it } from "vitest"

import {
  hasMarketActivity,
  isMarketVisible,
} from "@/lib/hl/market-visibility"

describe("market visibility", () => {
  it("hides an unprotected market with zero volume", () => {
    const market = { coin: "xyz:EMPTY", dayNtlVlm: "0" }

    expect(hasMarketActivity(market)).toBe(false)
    expect(isMarketVisible(market, new Set())).toBe(false)
  })

  it("shows markets with trading activity", () => {
    const market = { coin: "xyz:TSLA", dayNtlVlm: "123.45" }

    expect(hasMarketActivity(market)).toBe(true)
    expect(isMarketVisible(market, new Set())).toBe(true)
  })

  it("keeps a zero-volume market visible when it must be managed", () => {
    const market = { coin: "xyz:EMPTY", dayNtlVlm: "0" }

    expect(isMarketVisible(market, new Set([market.coin]))).toBe(true)
  })
})
