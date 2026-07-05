import { describe, expect, it } from "vitest"

import {
  crossedAbove,
  crossedBelow,
  ema,
  highest,
  lowest,
  rsi,
} from "./indicators"

describe("indicators", () => {
  it("computes EMA that tracks a constant series exactly", () => {
    const series = ema([5, 5, 5, 5, 5], 3)
    expect(series.at(-1)).toBeCloseTo(5, 10)
  })

  it("EMA responds faster with shorter periods", () => {
    const closes = [1, 1, 1, 1, 10]
    const fast = ema(closes, 2).at(-1)!
    const slow = ema(closes, 10).at(-1)!
    expect(fast).toBeGreaterThan(slow)
  })

  it("computes RSI = 100 on straight gains and low on straight losses", () => {
    const up = rsi([1, 2, 3, 4, 5, 6, 7, 8], 4)
    expect(up.at(-1)).toBe(100)
    const down = rsi([8, 7, 6, 5, 4, 3, 2, 1], 4)
    expect(down.at(-1)).toBe(0)
  })

  it("returns NaN until the RSI warmup period elapses", () => {
    const series = rsi([1, 2, 3], 14)
    expect(series.every((value) => Number.isNaN(value))).toBe(true)
  })

  it("detects crossovers only at the crossing candle", () => {
    const a = [1, 1, 3]
    const b = [2, 2, 2]
    expect(crossedAbove(a, b)).toBe(true)
    expect(crossedBelow(a, b)).toBe(false)
    expect(crossedAbove([3, 3, 3], b)).toBe(false)
  })

  it("computes window extremes", () => {
    expect(highest([1, 9, 4])).toBe(9)
    expect(lowest([5, 2, 7])).toBe(2)
  })
})
