import { describe, expect, it } from "vitest"

import type {
  IndicatorCandle,
  IndicatorContext,
} from "@/lib/trade/indicators/contract"
import { emaIndicator } from "@/lib/trade/indicators/ema"

const HOUR = 3_600_000
const CHART: IndicatorContext = { zone: "UTC", interval: "1h" }

function candlesOf(closes: number[]): IndicatorCandle[] {
  return closes.map((close, index) => ({
    openTime: index * HOUR,
    high: close + 1,
    low: close - 1,
    close,
  }))
}

describe("the EMA indicator", () => {
  it("draws the 20, 50 and 200 candle readings after each has enough history", () => {
    const paint = emaIndicator.compute(
      candlesOf(Array<number>(250).fill(100)),
      {},
      CHART
    )

    expect(paint.lines.map((line) => line.id)).toEqual([
      "ema-20",
      "ema-50",
      "ema-200",
    ])
    expect(paint.lines.map((line) => line.color)).toEqual([
      "#2563eb",
      "#ea580c",
      "#16a34a",
    ])
    expect(paint.lines.map((line) => line.points.length)).toEqual([
      231, 201, 51,
    ])
    for (const line of paint.lines) {
      for (const point of line.points) expect(point.price).toBeCloseTo(100)
    }
  })

  it("lets each line be hidden or recolored on its own", () => {
    const paint = emaIndicator.compute(
      candlesOf(Array<number>(250).fill(100)),
      { show20: false, color50: "#ABCDEF", show200: false },
      CHART
    )

    expect(paint.lines.map((line) => line.id)).toEqual(["ema-50"])
    expect(paint.lines[0].color).toBe("#abcdef")
  })

  it("replaces a saved color the browser cannot draw with the default", () => {
    const paint = emaIndicator.compute(
      candlesOf(Array<number>(250).fill(100)),
      { color20: "blue" },
      CHART
    )

    expect(paint.lines[0].color).toBe("#2563eb")
  })

  it("prints and calls the same buy and sell when the 50 and 200 lines cross", () => {
    const candles = candlesOf([
      ...Array<number>(200).fill(100),
      ...Array<number>(40).fill(200),
      ...Array<number>(200).fill(0),
    ])
    const paint = emaIndicator.compute(candles, {}, CHART)
    const signals = emaIndicator.signals?.(candles, {}) ?? []

    expect(signals.map((signal) => signal.side)).toEqual(["buy", "sell"])
    expect(
      paint.marks.map((mark) => ({
        time: mark.time,
        side: mark.side === "up" ? "buy" : "sell",
      }))
    ).toEqual(signals)
  })

  it("does not call a cross before the 200 candle line has formed", () => {
    const candles = candlesOf([
      ...Array<number>(190).fill(100),
      ...Array<number>(10).fill(200),
    ])

    expect(emaIndicator.signals?.(candles, {})).toEqual([])
    expect(emaIndicator.compute(candles, {}, CHART).marks).toEqual([])
  })

  it("keeps calling crosses when the lines are hidden", () => {
    const candles = candlesOf([
      ...Array<number>(200).fill(100),
      ...Array<number>(40).fill(200),
      ...Array<number>(200).fill(0),
    ])

    expect(
      emaIndicator.signals?.(candles, {
        show20: false,
        show50: false,
        show200: false,
      })
    ).toEqual(emaIndicator.signals?.(candles, {}))
  })

  it("hides crossover arrows without switching off automation calls", () => {
    const candles = candlesOf([
      ...Array<number>(200).fill(100),
      ...Array<number>(40).fill(200),
      ...Array<number>(200).fill(0),
    ])

    expect(
      emaIndicator.compute(candles, { showSignals: false }, CHART).marks
    ).toEqual([])
    expect(emaIndicator.signals?.(candles, { showSignals: false })).toEqual(
      emaIndicator.signals?.(candles, {})
    )
  })

  it("asks a replay for enough earlier candles to settle the slow line", () => {
    expect(emaIndicator.warmupBars?.({})).toBe(600)
  })
})
