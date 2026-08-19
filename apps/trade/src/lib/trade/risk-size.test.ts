import { describe, expect, it } from "vitest"

import {
  affordableCoins,
  coinsForRisk,
  resizeForStop,
  riskUsdOf,
} from "@/lib/trade/risk-size"

describe("risking a share of the wallet", () => {
  it("turns a percent of the wallet into dollars", () => {
    expect(riskUsdOf(10_000, 1)).toBe(100)
    expect(riskUsdOf(10_000, 0.5)).toBe(50)
  })

  it("never risks more than the whole wallet", () => {
    expect(riskUsdOf(10_000, 400)).toBe(10_000)
  })

  it("buys more when the stop is closer, for the same loss", () => {
    // $100 at risk. A stop $2 away buys 50 coins; $4 away buys 25. Either way
    // being stopped out costs $100, which is the point of sizing this way.
    const near = coinsForRisk({
      equity: 10_000,
      riskPct: 1,
      entryPx: 100,
      stopPx: 98,
    })
    const far = coinsForRisk({
      equity: 10_000,
      riskPct: 1,
      entryPx: 100,
      stopPx: 96,
    })
    expect(near).toBeCloseTo(50, 9)
    expect(far).toBeCloseTo(25, 9)
    // Both lose the same $100: 50 coins × $2, and 25 coins × $4.
    expect(near * 2).toBeCloseTo(far * 4, 9)
  })

  it("buys nothing when the stop is on the price or through it", () => {
    expect(
      coinsForRisk({ equity: 10_000, riskPct: 1, entryPx: 100, stopPx: 100 })
    ).toBe(0)
  })

  it("buys nothing when the wallet is empty or the risk is blank", () => {
    expect(
      coinsForRisk({ equity: 0, riskPct: 1, entryPx: 100, stopPx: 98 })
    ).toBe(0)
    expect(
      coinsForRisk({ equity: 10_000, riskPct: 0, entryPx: 100, stopPx: 98 })
    ).toBe(0)
  })
})

describe("dragging the stop", () => {
  it("keeps the money at risk the same as the amount changes", () => {
    // 50 coins with the stop $2 away is $100 at risk. Dragged to $4 away, the
    // order halves to 25 coins — still $100.
    const sz = resizeForStop({
      entryPx: 100,
      fromStopPx: 98,
      toStopPx: 96,
      sz: 50,
    })
    expect(sz).toBeCloseTo(25, 9)
    expect(sz * 4).toBeCloseTo(50 * 2, 9)
  })

  it("grows the order when the stop is brought closer", () => {
    expect(
      resizeForStop({ entryPx: 100, fromStopPx: 96, toStopPx: 98, sz: 25 })
    ).toBeCloseTo(50, 9)
  })

  it("leaves the order alone when there is no distance to work from", () => {
    expect(
      resizeForStop({ entryPx: 100, fromStopPx: 100, toStopPx: 98, sz: 10 })
    ).toBe(10)
    expect(
      resizeForStop({ entryPx: 100, fromStopPx: 98, toStopPx: 100, sz: 10 })
    ).toBe(10)
  })
})

describe("what the account can actually pay for", () => {
  it("counts the borrowing it is allowed", () => {
    expect(affordableCoins({ free: 1_000, leverage: 1, entryPx: 100 })).toBe(10)
    expect(affordableCoins({ free: 1_000, leverage: 5, entryPx: 100 })).toBe(50)
  })

  it("is nothing when there is no free cash", () => {
    expect(affordableCoins({ free: 0, leverage: 5, entryPx: 100 })).toBe(0)
  })
})
