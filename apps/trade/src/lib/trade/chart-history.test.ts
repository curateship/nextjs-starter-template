import { describe, expect, it } from "vitest"

import {
  earliestAskable,
  FIRST_PAINT_MS,
  intervalMs,
  MOST_BARS_A_CHART_ASKS_FOR,
  wantsFullHistory,
} from "@/lib/trade/chart-history"

/**
 * How much history a chart asks for, and the limit that keeps a request from
 * the browser from turning into a hundred thousand requests to an exchange.
 */

describe("which timeframes load their whole history", () => {
  it("is the four-hour chart, and nothing shorter", () => {
    expect(wantsFullHistory("4h")).toBe(true)
    expect(wantsFullHistory("1m")).toBe(false)
    expect(wantsFullHistory("1h")).toBe(false)
    expect(wantsFullHistory("1d")).toBe(false)
  })

  it("paints two years before going after the rest", () => {
    expect(FIRST_PAINT_MS / 86_400_000).toBe(730)
  })
})

describe("how far back a chart may ask", () => {
  it("leaves an ordinary ask alone", () => {
    const twoYearsAgo = Date.now() - FIRST_PAINT_MS
    // Within a second of what was asked for — nothing was pulled forward.
    expect(Math.abs(earliestAskable("4h", twoYearsAgo) - twoYearsAgo)).toBeLessThan(
      1_000
    )
  })

  it("pulls 1970 forward instead of asking for fifty-six years", () => {
    // The asking time comes from the browser. Left alone, a minute chart
    // starting at 1970 is a hundred and forty-seven thousand pages of two
    // hundred bars each, every one a real request to the exchange.
    const asked = earliestAskable("1m", 1)
    const pages = (Date.now() - asked) / intervalMs("1m") / 200
    expect(pages).toBeLessThan(120)
    expect(Date.now() - asked).toBe(MOST_BARS_A_CHART_ASKS_FOR * intervalMs("1m"))
  })

  it("holds the same limit on every timeframe", () => {
    for (const interval of ["1m", "5m", "15m", "1h", "4h", "1d"] as const) {
      const asked = earliestAskable(interval, 1)
      expect((Date.now() - asked) / intervalMs(interval)).toBeCloseTo(
        MOST_BARS_A_CHART_ASKS_FOR,
        0
      )
    }
  })
})

describe("how long a bar lasts", () => {
  it("agrees with the clock", () => {
    expect(intervalMs("1m")).toBe(60_000)
    expect(intervalMs("4h")).toBe(4 * 3_600_000)
    expect(intervalMs("1d")).toBe(24 * 3_600_000)
  })
})
