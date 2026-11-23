import { describe, expect, it } from "vitest"

import { barOfTime, timeOfBar } from "@/lib/trade/chart-time"

const MINUTE = 60_000

/** Five one-minute candles starting on the hour. */
const even = [0, MINUTE, 2 * MINUTE, 3 * MINUTE, 4 * MINUTE]

/** The same five with the middle two missing — the exchange had no trades. */
const gappy = [0, MINUTE, 4 * MINUTE, 5 * MINUTE]

describe("where a time sits on the chart", () => {
  it("puts a candle's own time on its own bar", () => {
    expect(barOfTime(even, 0)).toBe(0)
    expect(barOfTime(even, 2 * MINUTE)).toBe(2)
    expect(barOfTime(even, 4 * MINUTE)).toBe(4)
  })

  it("puts a time between two candles between their bars", () => {
    expect(barOfTime(even, MINUTE / 2)).toBeCloseTo(0.5)
    expect(barOfTime(even, 2.25 * MINUTE)).toBeCloseTo(2.25)
  })

  it("counts a gap as one bar, however long it lasted", () => {
    // The three-minute hole between bar 1 and bar 2 is still one bar wide on
    // screen, so half way through it is half a bar along.
    expect(barOfTime(gappy, 2.5 * MINUTE)).toBeCloseTo(1.5)
  })

  it("carries on past both ends at the spacing of the nearest pair", () => {
    expect(barOfTime(even, 6 * MINUTE)).toBeCloseTo(6)
    expect(barOfTime(even, -2 * MINUTE)).toBeCloseTo(-2)
  })

  it("stands still when there is nothing to measure", () => {
    expect(barOfTime([], 1234)).toBe(0)
    expect(barOfTime([MINUTE], 9 * MINUTE)).toBe(0)
  })
})

describe("and back again", () => {
  it("returns the time it was given", () => {
    for (const time of [0, MINUTE / 3, 2 * MINUTE, 3.75 * MINUTE]) {
      expect(timeOfBar(even, barOfTime(even, time))).toBe(Math.round(time))
    }
  })

  it("returns the time it was given across a gap", () => {
    for (const time of [0, MINUTE, 2.5 * MINUTE, 4 * MINUTE, 5 * MINUTE]) {
      expect(timeOfBar(gappy, barOfTime(gappy, time))).toBe(Math.round(time))
    }
  })

  it("returns the time it was given out past the last candle", () => {
    const time = 9 * MINUTE
    expect(timeOfBar(even, barOfTime(even, time))).toBe(time)
  })

  it("stands still when there is nothing to measure", () => {
    expect(timeOfBar([], 3)).toBe(0)
    expect(timeOfBar([MINUTE], 3)).toBe(MINUTE)
  })
})
