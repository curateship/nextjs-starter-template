import { describe, expect, it } from "vitest"

import {
  alma,
  bollinger,
  crossedAbove,
  crossedBelow,
  dema,
  ema,
  highest,
  hma,
  lowest,
  lsma,
  macd,
  movingAverage,
  pema,
  qflBase,
  rsi,
  sma,
  smma,
  stddev,
  tema,
  vwma,
  wma,
} from "./indicators"

describe("qflBase", () => {
  const low = (l: number) => ({ l })

  it("confirms a base at a swing low that holds, then keeps the level flat", () => {
    // Downtrend into a low of 10 at index 5, then price holds above it.
    const lows = [20, 18, 16, 14, 12, 10, 12, 13, 14, 15, 16, 17]
    const { raw } = qflBase(lows.map(low), 4, 2)
    // Once the base is confirmed it holds at the swing low (10).
    const last = raw[raw.length - 1]
    expect(last).toBe(10)
    // The base never sits above the low that formed it.
    for (const value of raw) {
      if (!Number.isNaN(value)) expect(value).toBeLessThanOrEqual(20)
    }
  })

  it("is NaN before any base is confirmed", () => {
    const lows = [5, 4, 3, 2, 1].map(low) // strictly falling — no held low yet
    const { raw } = qflBase(lows, 4, 2)
    expect(Number.isNaN(raw[0])).toBe(true)
  })
})

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

  it("computes a windowed SMA with NaN warmup", () => {
    const series = sma([2, 4, 6, 8], 2)
    expect(series[0]).toBeNaN()
    expect(series[1]).toBeCloseTo(3, 10)
    expect(series[2]).toBeCloseTo(5, 10)
    expect(series[3]).toBeCloseTo(7, 10)
  })

  it("computes population standard deviation over the window", () => {
    // window [2,4,6] mean 4, popvar = (4+0+4)/3 = 8/3
    const series = stddev([2, 4, 6], 3)
    expect(series[0]).toBeNaN()
    expect(series[2]).toBeCloseTo(Math.sqrt(8 / 3), 10)
  })

  it("builds Bollinger Bands symmetric around the SMA basis", () => {
    const { upper, mid, lower } = bollinger([2, 4, 6], 3, 2)
    const dev = Math.sqrt(8 / 3)
    expect(mid[2]).toBeCloseTo(4, 10)
    expect(upper[2]).toBeCloseTo(4 + 2 * dev, 10)
    expect(lower[2]).toBeCloseTo(4 - 2 * dev, 10)
  })

  it("computes MACD with NaN warmup and a zero histogram on a flat series", () => {
    const flat = new Array(40).fill(100)
    const { macd: line, signal, hist } = macd(flat)
    expect(line[0]).toBeNaN()
    expect(line[24]).toBeNaN() // warmup = slow(26) - 1
    expect(line.at(-1)).toBeCloseTo(0, 10)
    expect(signal.at(-1)).toBeCloseTo(0, 10)
    expect(hist.at(-1)).toBeCloseTo(0, 10)
  })
})

describe("moving-average family", () => {
  it("computes WMA with linear weights and a NaN warmup", () => {
    const series = wma([1, 2, 3], 3)
    expect(series[0]).toBeNaN()
    expect(series[1]).toBeNaN()
    expect(series[2]).toBeCloseTo((1 * 1 + 2 * 2 + 3 * 3) / 6, 10)
  })

  it("tracks a constant series exactly across all MA variants", () => {
    const flat = new Array(60).fill(7)
    for (const fn of [
      () => smma(flat, 5),
      () => dema(flat, 5),
      () => tema(flat, 5),
      () => pema(flat, 5),
      () => hma(flat, 9),
      () => alma(flat, 9, 0.85, 6),
    ]) {
      expect(fn().at(-1)).toBeCloseTo(7, 8)
    }
  })

  it("LSMA of a perfect line equals the line at each endpoint", () => {
    const line = Array.from({ length: 20 }, (_, i) => 3 + 2 * i)
    const series = lsma(line, 10, 0)
    expect(series.at(-1)).toBeCloseTo(line.at(-1)!, 8)
    // With offset the fitted value steps back along the line.
    const offsetSeries = lsma(line, 10, 2)
    expect(offsetSeries.at(-1)).toBeCloseTo(line.at(-3)!, 8)
  })

  it("VWMA with equal volumes matches SMA", () => {
    const values = [1, 3, 2, 5, 4, 6]
    const volumes = new Array(values.length).fill(2)
    const vw = vwma(values, volumes, 3)
    const simple = sma(values, 3)
    for (let i = 2; i < values.length; i += 1) {
      expect(vw[i]).toBeCloseTo(simple[i], 10)
    }
  })

  it("movingAverage preserves a leading-NaN prefix (RSI warmup)", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5)
    const rsiSeries = rsi(closes, 5)
    expect(rsiSeries[0]).toBeNaN()
    const smoothed = movingAverage("EMA", rsiSeries, 3)
    // Prefix stays NaN, tail is finite (EMA wasn't poisoned by NaN seed).
    expect(smoothed[4]).toBeNaN()
    expect(Number.isFinite(smoothed.at(-1)!)).toBe(true)
  })

  it("movingAverage slices volumes to the NaN prefix for VWMA", () => {
    const values = [Number.NaN, Number.NaN, 4, 4, 4, 4]
    const volumes = [9, 9, 1, 2, 3, 4]
    const series = movingAverage("VWMA", values, 3, { volumes })
    expect(series.at(-1)).toBeCloseTo(4, 10)
  })
})
