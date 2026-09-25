import { describe, expect, it } from "vitest"

import {
  intervalMs,
  MOST_BARS_A_CHART_ASKS_FOR,
  stitchCandles,
  storeDepthFrom,
  VENUE_HISTORY_MS,
  venueSliceFrom,
  wantsFullHistory,
} from "@/lib/trade/chart-history"

/**
 * The rule every chart follows: the venue's own last 30 days, the store for
 * everything older, and a limit on how far the store is asked to go on the
 * timeframes that do not load in full.
 *
 * Tyler, 2 Sep 2026: "We only need the first 30 days of real data from the
 * protocol. The rest we can use our candle storage."
 */

const NOW = Date.parse("2026-09-02T12:00:00.000Z")

describe("which timeframes fill all the way back", () => {
  it("is the four-hour and the daily chart, and nothing shorter", () => {
    expect(wantsFullHistory("4h")).toBe(true)
    expect(wantsFullHistory("1d")).toBe(true)
    expect(wantsFullHistory("1m")).toBe(false)
    expect(wantsFullHistory("1h")).toBe(false)
  })
})

describe("what the venue is asked for", () => {
  it("is the last thirty days on the slower timeframes", () => {
    expect(VENUE_HISTORY_MS / 86_400_000).toBe(30)
    expect(NOW - venueSliceFrom("4h", NOW)).toBe(VENUE_HISTORY_MS)
    expect(NOW - venueSliceFrom("1h", NOW)).toBe(VENUE_HISTORY_MS)
    expect(NOW - venueSliceFrom("1d", NOW)).toBe(VENUE_HISTORY_MS)
  })

  it("is capped at a thousand bars on the fast ones", () => {
    // Thirty days of minute bars is 43,200 rows, which on Lighter is 87
    // requests against sixty a minute. A thousand is one page on most
    // venues and two on Lighter.
    expect((NOW - venueSliceFrom("1m", NOW)) / intervalMs("1m")).toBe(1_000)
    expect((NOW - venueSliceFrom("5m", NOW)) / intervalMs("5m")).toBe(1_000)
    expect((NOW - venueSliceFrom("15m", NOW)) / intervalMs("15m")).toBe(1_000)
  })
})

describe("how deep the store goes on a timeframe that does not load in full", () => {
  it("holds the same bar count on every one", () => {
    for (const interval of ["1m", "5m", "15m", "1h"] as const) {
      expect((NOW - storeDepthFrom(interval, NOW)) / intervalMs(interval)).toBe(
        MOST_BARS_A_CHART_ASKS_FOR
      )
    }
    // Two weeks of minutes, about two years of hours.
    expect((NOW - storeDepthFrom("1m", NOW)) / 86_400_000).toBeCloseTo(13.9, 1)
    expect((NOW - storeDepthFrom("1h", NOW)) / 86_400_000).toBeCloseTo(833, 0)
  })
})

describe("the seam", () => {
  const bar = (openTime: number, close: number) => ({
    openTime,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  })

  it("lets the venue win where both have a bar, with no duplicate and no hole", () => {
    const older = [bar(0, 1), bar(1, 2), bar(2, 3), bar(3, 4)]
    const venue = [bar(3, 40), bar(4, 50)]
    const stitched = stitchCandles(older, venue)
    expect(stitched.map((one) => one.openTime)).toEqual([0, 1, 2, 3, 4])
    expect(stitched[3].close).toBe(40)
  })

  it("sorts whatever order the two arrived in", () => {
    const stitched = stitchCandles([bar(5, 1), bar(2, 1)], [bar(9, 1), bar(7, 1)])
    expect(stitched.map((one) => one.openTime)).toEqual([2, 5, 7, 9])
  })
})

describe("how long a bar lasts", () => {
  it("agrees with the clock", () => {
    expect(intervalMs("1m")).toBe(60_000)
    expect(intervalMs("4h")).toBe(4 * 3_600_000)
    expect(intervalMs("1d")).toBe(24 * 3_600_000)
  })
})
