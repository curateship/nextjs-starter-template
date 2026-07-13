import { describe, expect, it } from "vitest"

import { computeTrendlines, type TrendlineInputs } from "./trendline"

const bar = (h: number, l: number, c: number) => ({
  o: c,
  h,
  l,
  c,
  v: 1,
})

const fallingBreak = (close = 12.5) =>
  [
    [10, 8, 9],
    [11, 8, 10],
    [15, 9, 10],
    [11, 7, 9],
    [10, 6, 8],
    [11, 7, 9],
    [13, 8, 10],
    [10, 7, 9],
    [12.6, 8, close],
    [14, 9, 10],
    [15, 10, 10],
  ].map(([h, l, c]) => bar(h, l, c))

const inputs: TrendlineInputs = {
  swingLookback: 2,
  breakBuffer: 0,
  requireCounterSlope: true,
}

describe("computeTrendlines", () => {
  it("fires one buy when a close decisively breaks a falling swing-high line", () => {
    const result = computeTrendlines(fallingBreak(), inputs)
    expect(
      result.buy.map((hit, i) => (hit ? i : -1)).filter((i) => i >= 0)
    ).toEqual([8])
  })

  it("fires one sell when a close breaks a rising swing-low line", () => {
    const candles = [
      bar(13, 10, 11),
      bar(12, 9, 10),
      bar(11, 5, 9),
      bar(13, 9, 11),
      bar(14, 10, 12),
      bar(13, 9, 11),
      bar(12, 7, 10),
      bar(13, 9, 10),
      bar(12, 7.4, 7.5),
      bar(11, 8, 9),
    ]
    const result = computeTrendlines(candles, inputs)
    expect(
      result.sell.map((hit, i) => (hit ? i : -1)).filter((i) => i >= 0)
    ).toEqual([8])
  })

  it("ignores a wick through the line when the candle closes below it", () => {
    expect(
      computeTrendlines(fallingBreak(11.8), inputs).buy.some(Boolean)
    ).toBe(false)
  })

  it("does not create a micro-line when the swing lookback is large", () => {
    const result = computeTrendlines(fallingBreak(), {
      ...inputs,
      swingLookback: 4,
    })
    expect(result.buy.some(Boolean)).toBe(false)
    expect(result.resistance.every(Number.isNaN)).toBe(true)
  })

  it("blocks a break above a rising, with-trend resistance line", () => {
    const candles = [
      bar(10, 7, 9),
      bar(11, 8, 10),
      bar(12, 9, 10),
      bar(11, 7, 9),
      bar(10, 6, 8),
      bar(11, 7, 9),
      bar(14, 8, 10),
      bar(12, 7, 9),
      bar(13, 8, 10),
      bar(16, 9, 16),
    ]
    expect(computeTrendlines(candles, inputs).buy.some(Boolean)).toBe(false)
  })

  it("keeps every earlier result identical when future candles are added", () => {
    const candles = fallingBreak()
    const full = computeTrendlines(candles, inputs)
    for (let end = 1; end <= candles.length; end += 1) {
      const prefix = computeTrendlines(candles.slice(0, end), inputs)
      expect(prefix.buy).toEqual(full.buy.slice(0, end))
      expect(prefix.sell).toEqual(full.sell.slice(0, end))
    }
  })

  it("requires a close beyond the line, not exactly on it", () => {
    expect(computeTrendlines(fallingBreak(12), inputs).buy.some(Boolean)).toBe(
      false
    )
  })
})
