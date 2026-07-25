import { describe, expect, it } from "vitest"

import {
  MAX_EXTRA_MARKETS,
  MAX_TOTAL_RUN_BARS,
  maxRunMarkets,
  maxWindowDays,
  totalRunBars,
} from "./types"

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const

describe("maxRunMarkets", () => {
  it("offers a basket the run will actually accept", () => {
    for (const interval of INTERVALS) {
      for (const days of [1, 30, 90, maxWindowDays(interval)]) {
        const cap = maxRunMarkets(null, interval, days)
        expect(
          totalRunBars(null, interval, days, cap)
        ).toBeLessThanOrEqual(MAX_TOTAL_RUN_BARS)
      }
    }
  })

  it("offers every market that fits, not a market fewer", () => {
    for (const interval of INTERVALS) {
      for (const days of [30, 90, maxWindowDays(interval)]) {
        const cap = maxRunMarkets(null, interval, days)
        if (cap >= MAX_EXTRA_MARKETS + 1) continue
        expect(
          totalRunBars(null, interval, days, cap + 1)
        ).toBeGreaterThan(MAX_TOTAL_RUN_BARS)
      }
    }
  })

  it("fits more markets on coarser candles over the same window", () => {
    const minute = maxRunMarkets(null, "1m", 30)
    const quarter = maxRunMarkets(null, "15m", 30)
    expect(minute).toBeLessThan(quarter)
    expect(minute).toBe(22)
  })

  it("never exceeds the basket cap or drops below one market", () => {
    expect(maxRunMarkets(null, "1d", 30)).toBe(MAX_EXTRA_MARKETS + 1)
    expect(maxRunMarkets(null, "1m", maxWindowDays("1m"))).toBeGreaterThanOrEqual(
      1
    )
  })

  it("shrinks as the window grows", () => {
    const short = maxRunMarkets(null, "15m", 30)
    const long = maxRunMarkets(null, "15m", maxWindowDays("15m"))
    expect(long).toBeLessThan(short)
  })
})
