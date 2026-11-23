import { describe, expect, it } from "vitest"

import { toFundingRates } from "@/server/protocols/hyperliquid/funding"

const HOUR = 3_600_000

describe("turning Hyperliquid funding into hourly rates", () => {
  it("normalizes the settlement delay and keeps time order", () => {
    expect(
      toFundingRates([
        { time: 2 * HOUR + 67, fundingRate: "-0.0002" },
        { time: HOUR + 10, fundingRate: "0.0001" },
      ])
    ).toEqual([
      { time: HOUR, rate: 0.0001 },
      { time: 2 * HOUR, rate: -0.0002 },
    ])
  })

  it("drops an unreadable rate instead of storing a broken number", () => {
    expect(
      toFundingRates([
        { time: HOUR, fundingRate: "not-a-number" },
        { time: 2 * HOUR, fundingRate: " " },
      ])
    ).toEqual([])
  })
})
