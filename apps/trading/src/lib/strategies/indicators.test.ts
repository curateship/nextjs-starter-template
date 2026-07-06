import { describe, expect, it } from "vitest"

import {
  bollinger,
  crossedAbove,
  crossedBelow,
  ema,
  highest,
  lowest,
  macd,
  rsi,
  sma,
  stddev,
  vwap,
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

  it("anchors VWAP per UTC day and resets at the boundary", () => {
    const day = 86_400_000
    const candles = [
      { t: 0, h: 10, l: 10, c: 10, v: 1 },
      { t: 60_000, h: 20, l: 20, c: 20, v: 1 },
      { t: day, h: 30, l: 30, c: 30, v: 1 }, // new UTC day → reset
      { t: day + 60_000, h: 50, l: 50, c: 50, v: 1 },
    ]
    const series = vwap(candles)
    expect(series[0]).toBeCloseTo(10, 10)
    expect(series[1]).toBeCloseTo(15, 10) // (10+20)/2
    expect(series[2]).toBeCloseTo(30, 10) // reset to new day
    expect(series[3]).toBeCloseTo(40, 10) // (30+50)/2
  })

  it("accepts string OHLCV fields in VWAP (matching candle payloads)", () => {
    const series = vwap([{ t: 0, h: "10", l: "10", c: "10", v: "2" }])
    expect(series[0]).toBeCloseTo(10, 10)
  })
})
