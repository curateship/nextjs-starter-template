import { describe, expect, it } from "vitest"

import {
  crossedAbove,
  crossedBelow,
  ema,
  vwap,
} from "@/lib/strategies/indicators"
import { computeConsolidation, computeQqeSeries } from "@/lib/strategies/qqe"
import {
  DEFAULT_INDICATORS,
  qqeChartToModuleParams,
} from "@/lib/trading/indicators-config"
import type { IndicatorCandle, IndicatorSignal } from "./contract"
import { INDICATORS } from "./registry"

/**
 * Parity proof: the new indicator modules must fire on EXACTLY the candles
 * the legacy strategies fired on. These tests re-implement the legacy
 * bar-by-bar evaluation verbatim and diff it against the batch compute.
 * They must pass BEFORE any legacy strategy is deleted.
 */

/** Deterministic random-walk candles — parity compares two code paths on the
 * same input, so synthetic data is as strong as market data here. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCandles(n: number, seed = 42): IndicatorCandle[] {
  const rand = mulberry32(seed)
  const out: IndicatorCandle[] = []
  let price = 100
  const start = Date.parse("2026-01-01T00:00:00Z")
  for (let i = 0; i < n; i += 1) {
    const drift = (rand() - 0.5) * 2 // -1..1
    const o = price
    const c = Math.max(1, price * (1 + drift * 0.01))
    const h = Math.max(o, c) * (1 + rand() * 0.004)
    const l = Math.min(o, c) * (1 - rand() * 0.004)
    const v = 1000 + rand() * 5000
    out.push({ t: start + i * 900_000, o, h, l, c, v })
    price = c
  }
  return out
}

const CANDLES = makeCandles(600)

describe("QQE indicator parity", () => {
  it("fires exactly where the legacy strategy/painter rule fires", () => {
    const params = INDICATORS.qqe.defaultParams as never as Record<string, never>
    const output = INDICATORS.qqe.compute(CANDLES, params as never)

    // The legacy rule, verbatim: (buy||sell) on bars the consolidation
    // filter passes (backtest-overlays.ts:174 / worker qqe.ts trigger).
    const qqe = computeQqeSeries(CANDLES, INDICATORS.qqe.defaultParams as never)
    const cons = computeConsolidation(CANDLES, 50, 5)
    const expected: IndicatorSignal[] = []
    for (let i = 0; i < CANDLES.length; i += 1) {
      if (cons.inZone[i]) continue
      if (qqe.buy[i]) expected.push({ time: CANDLES[i].t, side: "buy" })
      else if (qqe.sell[i]) expected.push({ time: CANDLES[i].t, side: "sell" })
    }
    expect(output.signals).toEqual(expected)
    expect(output.signals.length).toBeGreaterThan(0)
  })

  it("the chart's off toggle removes consolidation and fires every raw cross", () => {
    const chartDefault = DEFAULT_INDICATORS.find((ind) => ind.type === "qqe")!
    const params = INDICATORS.qqe.paramsSchema.parse(
      qqeChartToModuleParams({
        ...chartDefault.params,
        consolidationFilter: 0,
      })
    )
    const output = INDICATORS.qqe.compute(CANDLES, params)
    const qqe = computeQqeSeries(CANDLES, params)
    const raw = qqe.buy.filter(Boolean).length + qqe.sell.filter(Boolean).length
    expect(output.signals).toHaveLength(raw)
    expect(output.paint.zones).toEqual([])
  })

  it("chart default config maps to the module defaults (chart ↔ module parity)", () => {
    const chartDefault = DEFAULT_INDICATORS.find((ind) => ind.type === "qqe")
    expect(chartDefault).toBeDefined()
    const mapped = qqeChartToModuleParams(chartDefault!.params)
    const parsed = INDICATORS.qqe.paramsSchema.parse(mapped)
    expect(parsed).toEqual(INDICATORS.qqe.defaultParams)
  })

  it("maps every MA-type / RSI-source index back to a valid enum", () => {
    const chartDefault = DEFAULT_INDICATORS.find((ind) => ind.type === "qqe")!
    for (let maType = 0; maType < 11; maType += 1) {
      for (let rsiSource = 0; rsiSource < 7; rsiSource += 1) {
        const mapped = qqeChartToModuleParams({
          ...chartDefault.params,
          maType,
          rsiSource,
        })
        // Parses cleanly → the index landed on a real enum member.
        expect(() => INDICATORS.qqe.paramsSchema.parse(mapped)).not.toThrow()
      }
    }
  })
})

describe("EMA-cross parity with legacy momentum ema_cross", () => {
  it("matches bar-by-bar expanding-window evaluation", () => {
    const fast = 12
    const slow = 26
    const output = INDICATORS.ema_cross.compute(
      CANDLES,
      INDICATORS.ema_cross.paramsSchema.parse({ fast, slow }) as never
    )

    // Legacy momentum readSignal, evaluated on every prefix (worker
    // momentum.ts:379-386, incl. the closes.length >= slow + 2 guard).
    const closes = CANDLES.map((c) => c.c)
    const expected: IndicatorSignal[] = []
    for (let i = 0; i < CANDLES.length; i += 1) {
      const window = closes.slice(0, i + 1)
      if (window.length < slow + 2) continue
      const f = ema(window, fast)
      const s = ema(window, slow)
      if (crossedAbove(f, s)) expected.push({ time: CANDLES[i].t, side: "buy" })
      else if (crossedBelow(f, s)) expected.push({ time: CANDLES[i].t, side: "sell" })
    }
    expect(output.signals).toEqual(expected)
    expect(output.signals.length).toBeGreaterThan(0)
  })
})

describe("VWAP-cross parity with legacy vwap cross mode", () => {
  it("matches the worker's day-window close×VWAP crosses", () => {
    const output = INDICATORS.vwap_cross.compute(CANDLES, { bandK: 0 } as never)

    // Legacy vwap.ts cross mode: dayWindow slice (96+5 bars at 15m), then
    // crossedAbove/Below(closes, vwap(candles)).
    const dayWindow = Math.ceil(86_400_000 / 900_000) + 5
    const expected: IndicatorSignal[] = []
    for (let i = 0; i < CANDLES.length; i += 1) {
      const window = CANDLES.slice(Math.max(0, i + 1 - dayWindow), i + 1)
      if (window.length < 3) continue
      const line = vwap(window)
      const closes = window.map((c) => c.c)
      if (crossedAbove(closes, line)) {
        expected.push({ time: CANDLES[i].t, side: "buy" })
      } else if (crossedBelow(closes, line)) {
        expected.push({ time: CANDLES[i].t, side: "sell" })
      }
    }
    expect(output.signals).toEqual(expected)
    expect(output.signals.length).toBeGreaterThan(0)
  })
})

describe("every indicator module", () => {
  it("computes cleanly on defaults: sorted signal times at real candles, sane paint", () => {
    const times = new Set(CANDLES.map((c) => c.t))
    for (const module of Object.values(INDICATORS)) {
      const output = module.compute(CANDLES, module.defaultParams as never)
      let previous = 0
      for (const signal of output.signals) {
        expect(times.has(signal.time)).toBe(true)
        expect(signal.time).toBeGreaterThanOrEqual(previous)
        previous = signal.time
      }
      for (const line of output.paint.lines) {
        for (const point of line.points) expect(Number.isFinite(point.value)).toBe(true)
      }
      expect(module.warmupBars(module.defaultParams as never)).toBeGreaterThan(0)
      expect(module.paramsSchema.safeParse(module.defaultParams).success).toBe(true)
    }
  })
})
