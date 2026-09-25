import { describe, expect, it } from "vitest"

import { moveTrendline, trendlinePriceAt } from "./trendlines"

// Anchor times are chart times in epoch seconds; evaluation times are in ms.
const HOUR = 3_600

describe("trendlinePriceAt", () => {
  const flat = {
    start: { time: 1_700_000_000, price: 50_000 },
    end: { time: 1_700_000_000 + 4 * HOUR, price: 50_000 },
  }

  it("holds a flat line at its price everywhere, including past both anchors", () => {
    expect(trendlinePriceAt(flat, 1_700_000_000_000)).toBe(50_000)
    expect(trendlinePriceAt(flat, (1_700_000_000 + 2 * HOUR) * 1000)).toBe(
      50_000
    )
    expect(trendlinePriceAt(flat, (1_700_000_000 + 400 * HOUR) * 1000)).toBe(
      50_000
    )
    expect(trendlinePriceAt(flat, (1_700_000_000 - 10 * HOUR) * 1000)).toBe(
      50_000
    )
  })

  const rising = {
    start: { time: 1_700_000_000, price: 100 },
    end: { time: 1_700_000_000 + 10 * HOUR, price: 200 },
  }

  it("returns the anchor prices exactly at the anchors", () => {
    expect(trendlinePriceAt(rising, 1_700_000_000 * 1000)).toBe(100)
    expect(
      trendlinePriceAt(rising, (1_700_000_000 + 10 * HOUR) * 1000)
    ).toBe(200)
  })

  it("interpolates between the anchors", () => {
    expect(
      trendlinePriceAt(rising, (1_700_000_000 + 5 * HOUR) * 1000)
    ).toBeCloseTo(150, 10)
  })

  it("extends the slope past the last anchor", () => {
    expect(
      trendlinePriceAt(rising, (1_700_000_000 + 20 * HOUR) * 1000)
    ).toBeCloseTo(300, 10)
  })

  it("extends the slope before the first anchor", () => {
    expect(
      trendlinePriceAt(rising, (1_700_000_000 - 5 * HOUR) * 1000)
    ).toBeCloseTo(50, 10)
  })

  it("does not care which anchor was drawn first", () => {
    const reversed = { start: rising.end, end: rising.start }
    const at = (1_700_000_000 + 7 * HOUR) * 1000
    expect(trendlinePriceAt(reversed, at)).toBeCloseTo(
      trendlinePriceAt(rising, at) ?? Number.NaN,
      10
    )
  })

  it("handles steep slopes without losing the sign", () => {
    const steep = {
      start: { time: 1_700_000_000, price: 10 },
      end: { time: 1_700_000_000 + 60, price: 100_000 },
    }
    expect(
      trendlinePriceAt(steep, (1_700_000_000 + 120) * 1000)
    ).toBeCloseTo(199_990, 6)
  })

  it("lands on exact values at candle-boundary timestamps", () => {
    // One-minute candles: the boundary is a whole minute in seconds, and the
    // ms → s conversion must not shave precision off the boundary itself.
    const line = {
      start: { time: 1_700_000_040, price: 60 },
      end: { time: 1_700_000_100, price: 120 },
    }
    expect(trendlinePriceAt(line, 1_700_000_100_000)).toBe(120)
    expect(trendlinePriceAt(line, 1_700_000_160_000)).toBeCloseTo(180, 10)
  })

  it("returns null for a vertical line", () => {
    const vertical = {
      start: { time: 1_700_000_000, price: 100 },
      end: { time: 1_700_000_000, price: 200 },
    }
    expect(trendlinePriceAt(vertical, 1_700_000_500_000)).toBeNull()
  })

  it("treats two identical anchors as a flat line at that price", () => {
    const dot = {
      start: { time: 1_700_000_000, price: 123 },
      end: { time: 1_700_000_000, price: 123 },
    }
    expect(trendlinePriceAt(dot, 1_800_000_000_000)).toBe(123)
  })

  it("returns null once a falling line's extension leaves positive prices", () => {
    const falling = {
      start: { time: 1_700_000_000, price: 100 },
      end: { time: 1_700_000_000 + HOUR, price: 50 },
    }
    // Two hours later the extension sits at 0; three hours later it is negative.
    expect(trendlinePriceAt(falling, (1_700_000_000 + 2 * HOUR) * 1000)).toBe(
      null
    )
    expect(trendlinePriceAt(falling, (1_700_000_000 + 3 * HOUR) * 1000)).toBe(
      null
    )
    // Just before the zero crossing it is still a real trigger price.
    expect(
      trendlinePriceAt(falling, (1_700_000_000 + 2 * HOUR - 60) * 1000)
    ).toBeCloseTo(50 / 60, 10)
  })
})

describe("moveTrendline", () => {
  const line = {
    id: "t1",
    color: "#2962ff",
    start: { time: 1_700_000_000, price: 100 },
    end: { time: 1_700_003_600, price: 200 },
  }

  it("slides both anchors by the pointer's travel, keeping the slope", () => {
    const moved = moveTrendline(
      line,
      { time: 1_700_001_800, price: 150 },
      { time: 1_700_002_400, price: 170 }
    )
    expect(moved.start).toEqual({ time: 1_700_000_600, price: 120 })
    expect(moved.end).toEqual({ time: 1_700_004_200, price: 220 })
    expect(moved.id).toBe("t1")
    expect(moved.color).toBe("#2962ff")
  })

  it("is anchored to the grab, not cumulative", () => {
    // Two moves from the same grab give the same result as the last one alone.
    const grab = { time: 1_700_001_800, price: 150 }
    moveTrendline(line, grab, { time: 1_700_009_000, price: 900 })
    const second = moveTrendline(line, grab, { time: 1_700_002_400, price: 170 })
    expect(second.start).toEqual({ time: 1_700_000_600, price: 120 })
  })

  it("never drags an anchor to zero or a negative price", () => {
    const moved = moveTrendline(
      line,
      { time: 1_700_001_800, price: 150 },
      { time: 1_700_001_800, price: 1 }
    )
    expect(moved.start.price).toBeGreaterThan(0)
    // The slope (100-point spread) survives the clamp.
    expect(moved.end.price - moved.start.price).toBeCloseTo(100, 9)
  })

  it("keeps times inside the saved-drawing bounds", () => {
    const early = moveTrendline(
      line,
      { time: 1_700_001_800, price: 150 },
      { time: 100, price: 150 }
    )
    expect(Math.min(early.start.time, early.end.time)).toBeGreaterThanOrEqual(1)
    const spread = line.end.time - line.start.time
    expect(early.end.time - early.start.time).toBe(spread)

    const late = moveTrendline(
      line,
      { time: 1_700_001_800, price: 150 },
      { time: 4_102_444_800, price: 150 }
    )
    expect(Math.max(late.start.time, late.end.time)).toBeLessThanOrEqual(
      4_102_444_800
    )
    expect(late.end.time - late.start.time).toBe(spread)
  })
})
