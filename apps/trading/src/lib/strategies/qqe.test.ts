import { describe, expect, it } from "vitest"

import {
  computeConsolidation,
  computeQqeSeries,
  initialConsolidationState,
  stepConsolidation,
  type QqeInputs,
} from "./qqe"

const INPUTS: QqeInputs = {
  rsiPeriod: 14,
  rsiSmoothing: 5,
  qqeFactor: 4.238,
  threshold: 10,
  maType: "EMA",
  rsiSource: "close",
}

/** Flat candle at price `px` (h/l pinched so no zigzag pivots fire). */
const flat = (px: number) => ({ o: px, h: px, l: px, c: px, v: 1 })

/** Candle with an explicit high/low range. */
const bar = (h: number, l: number) => ({ o: (h + l) / 2, h, l, c: (h + l) / 2, v: 1 })

/**
 * Neutral warmup: gains and losses balance so RSI settles near 50 (a truly
 * constant series would read RSI = 100 — Wilder's zero-loss rule).
 */
const neutralWarmup = (n: number) =>
  Array.from({ length: n }, (_, i) => 100 + Math.sin(i) * 0.5)

describe("computeQqeSeries", () => {
  it("fires buy exactly once when the smoothed RSI first crosses the channel", () => {
    const closes = [
      ...neutralWarmup(100),
      ...Array.from({ length: 60 }, (_, i) => 100 + (i + 1) * 2),
    ]
    const { buy, sell, rsiMa } = computeQqeSeries(closes.map(flat), INPUTS)
    const buys = buy.map((b, i) => (b ? i : -1)).filter((i) => i >= 0)
    expect(buys).toHaveLength(1)
    const at = buys[0]
    expect(rsiMa[at]).toBeGreaterThan(60)
    expect(rsiMa[at - 1]).toBeLessThanOrEqual(60)
    expect(sell.some(Boolean)).toBe(false)
  })

  it("fires sell exactly once on the mirrored down ramp", () => {
    const closes = [
      ...neutralWarmup(100),
      ...Array.from({ length: 60 }, (_, i) => 100 - (i + 1) * 1),
    ]
    const { buy, sell } = computeQqeSeries(closes.map(flat), INPUTS)
    expect(sell.filter(Boolean)).toHaveLength(1)
    expect(buy.some(Boolean)).toBe(false)
  })

  it("colors bars green above the channel, red below, orange between", () => {
    const up = [
      ...neutralWarmup(100),
      ...Array.from({ length: 60 }, (_, i) => 100 + (i + 1) * 2),
    ]
    const series = computeQqeSeries(up.map(flat), INPUTS)
    expect(series.barColor[80]).toBe("orange") // neutral warmup
    expect(series.barColor.at(-1)).toBe("green")

    const down = [
      ...neutralWarmup(100),
      ...Array.from({ length: 60 }, (_, i) => 100 - (i + 1) * 1),
    ]
    expect(computeQqeSeries(down.map(flat), INPUTS).barColor.at(-1)).toBe("red")
  })

  it("keeps the trailing line below the index in a sustained uptrend", () => {
    const closes = [
      ...neutralWarmup(100),
      ...Array.from({ length: 80 }, (_, i) => 100 + (i + 1) * 2),
    ]
    const { trailing, rsiMa } = computeQqeSeries(closes.map(flat), INPUTS)
    const last = trailing.length - 1
    expect(Number.isFinite(trailing[last])).toBe(true)
    expect(trailing[last]).toBeLessThan(rsiMa[last])
  })
})

describe("computeConsolidation", () => {
  const prd = 5
  const conslen = 3

  it("flags a steady range as consolidation with bracketing bounds", () => {
    // Every bar spans the same 95–105 range: pivots never leave the band.
    const candles = Array.from({ length: 80 }, () => bar(105, 95))
    const { inZone, zones } = computeConsolidation(candles, prd, conslen)
    expect(inZone.at(-1)).toBe(true)
    expect(zones.length).toBeGreaterThan(0)
    const zone = zones.at(-1)!
    expect(zone.high).toBe(105)
    expect(zone.low).toBe(95)
    expect(zone.endIndex).toBeGreaterThan(zone.startIndex)
  })

  it("never flags a strong trend as consolidation once pivots move", () => {
    const candles = Array.from({ length: 80 }, (_, i) => bar(100 + i * 3, 98 + i * 3))
    const { inZone } = computeConsolidation(candles, prd, conslen)
    // New highs every bar → pp keeps stepping outside the band; the tail of
    // the series must not read as consolidating (early bars free-run like Pine).
    expect(inZone.slice(20).some(Boolean)).toBe(false)
  })

  it("incremental stepping with carried state matches the batch computation", () => {
    // Mixed regime: range → trend → range, so the machine exercises resets.
    const candles = [
      ...Array.from({ length: 40 }, () => bar(105, 95)),
      ...Array.from({ length: 30 }, (_, i) => bar(110 + i * 4, 108 + i * 4)),
      ...Array.from({ length: 40 }, () => bar(240, 230)),
    ]
    const highs = candles.map((c) => Number(c.h))
    const lows = candles.map((c) => Number(c.l))

    const batch = computeConsolidation(candles, prd, conslen)
    // Same pattern as the worker strategy: one persistent state, one step per bar.
    const state = initialConsolidationState()
    const incremental = candles.map((_, i) =>
      stepConsolidation(state, highs, lows, i, prd, conslen)
    )
    expect(incremental).toEqual(batch.inZone)
    // Survives a JSON round-trip (live-bot state persistence).
    const revived = JSON.parse(JSON.stringify(state))
    expect(revived).toEqual(state)
  })

  it("resets the zone when price breaks out of the range", () => {
    const range = Array.from({ length: 60 }, () => bar(105, 95))
    const breakout = Array.from({ length: 30 }, (_, i) => bar(120 + i * 5, 118 + i * 5))
    const { inZone } = computeConsolidation([...range, ...breakout], prd, conslen)
    expect(inZone[range.length - 1]).toBe(true)
    expect(inZone.at(-1)).toBe(false)
  })
})
