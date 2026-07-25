import { describe, expect, it } from "vitest"

import {
  crossedAbove,
  crossedBelow,
  ema,
  qflBase,
} from "@/lib/strategies/indicators"
import { computeConsolidation, computeQqeSeries } from "@/lib/strategies/qqe"
import {
  baseChartToModuleParams,
  DEFAULT_INDICATORS,
  qqeChartToModuleParams,
} from "@/lib/trading/indicators-config"
import type { IndicatorCandle, IndicatorSignal } from "./contract"
import { baseIndicator } from "./defs/base"
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

/** Candles from a low series; the body sits just above each low unless a close is
 * given, so only the Base rules can fire. */
function candlesFromLows(lows: number[], closes?: number[]): IndicatorCandle[] {
  const start = Date.parse("2026-01-01T00:00:00Z")
  return lows.map((l, i) => {
    const c = closes?.[i] ?? l + 0.5
    return {
      t: start + i * 900_000,
      o: c - 0.01,
      h: Math.max(c, l) + 0.5,
      l,
      c,
      v: 1000,
    }
  })
}

describe("Base indicator signals", () => {
  // Downtrend into a low of 10 at index 5 that then holds: with basePeriods 4
  // and pumpPeriods 2 the base confirms two bars after the low, at index 7.
  const LOWS = [20, 18, 16, 14, 12, 10, 12, 13, 14, 15, 16, 17]
  const params = (overrides: Record<string, number | boolean> = {}) =>
    INDICATORS.base.paramsSchema.parse({
      basePeriods: 4,
      pumpPeriods: 2,
      // Wide enough that the proximity gate is out of the way unless tested:
      // the confirming candle in this fixture closes 35% above the base.
      formedWithinPct: 50,
      // Off unless a test is specifically exercising the rising-signal filter.
      formedRequireRising: false,
      ...overrides,
    }) as never
  const PARAMS = params()

  it("fires a long on the candle that confirms a base", () => {
    const candles = candlesFromLows(LOWS)
    const { confirmed } = qflBase(candles, 4, 2)
    expect(confirmed.flatMap((flag, i) => (flag ? [i] : []))).toEqual([7])

    const output = INDICATORS.base.compute(candles, PARAMS)
    expect(output.signals).toEqual([{ time: candles[7].t, side: "buy" }])
  })

  it("skips the formed long while price is far from the base", () => {
    const candles = candlesFromLows(LOWS)
    // The base is 10 and the confirming candle (index 7) closes at 13.5 — 35%
    // away — and price only climbs from there, so nothing prints.
    expect(candles[7].c).toBe(13.5)
    expect(
      INDICATORS.base.compute(candles, params({ formedWithinPct: 1 })).signals
    ).toEqual([])

    // Same base, but the confirming candle itself closes 0.5% above it.
    const closes = LOWS.map((low) => low + 0.5)
    closes[7] = 10.05
    const near = candlesFromLows(LOWS, closes)
    expect(
      INDICATORS.base.compute(near, params({ formedWithinPct: 1 })).signals
    ).toEqual([{ time: near[7].t, side: "buy" }])
  })

  it("lets a base go stale once its window of candles has passed", () => {
    // Base 10 confirms at index 7; price only returns to it at index 10.
    const closes = LOWS.map((low) => low + 0.5)
    closes[10] = 10.05
    const candles = candlesFromLows(LOWS, closes)

    // A 3-candle window still covers index 10 (7 + 3).
    expect(
      INDICATORS.base.compute(
        candles,
        params({ formedWithinPct: 1, formedValidBars: 3 })
      ).signals
    ).toEqual([{ time: candles[10].t, side: "buy" }])

    // A 2-candle window expires first: the return is ignored.
    expect(
      INDICATORS.base.compute(
        candles,
        params({ formedWithinPct: 1, formedValidBars: 2 })
      ).signals
    ).toEqual([])
  })

  it("only draws a signal sitting above the previous signal", () => {
    // Three bases in a row: 20, then a LOWER 15, then 15.1 — a staircase down
    // followed by a step back up. Marks land at 20.1, 15.05 and 15.15.
    const lows = [
      40, 38, 34, 30, 26, 22, 20, 20.5, 20.6, 20, 18, 16, 15, 15.5, 15.6, 15,
      15.2, 15.4, 16.5, 16.6, 15.1, 15.4, 15.5, 15.1,
    ]
    const closes = lows.map((low) => low + 0.5)
    closes[9] = 20.1 // back at base 20
    closes[15] = 15.05 // back at base 15
    closes[23] = 15.15 // back at base 15.1
    const candles = candlesFromLows(lows, closes)

    const { confirmed } = qflBase(candles, 4, 2)
    expect(confirmed.flatMap((flag, i) => (flag ? [i] : []))).toEqual([8, 14, 22])

    // Filter off: every base prints, including the lower one.
    expect(
      INDICATORS.base.compute(candles, params({ formedWithinPct: 1 })).signals
    ).toEqual([
      { time: candles[9].t, side: "buy" },
      { time: candles[15].t, side: "buy" },
      { time: candles[23].t, side: "buy" },
    ])

    // Filter on: the 15.05 mark sits below the 20.1 mark, so it isn't drawn. The
    // 15.15 mark IS drawn because it beats that hidden 15.05 — the skipped mark
    // is still the yardstick, which is why 15.15 counts despite being under 20.1.
    expect(
      INDICATORS.base.compute(
        candles,
        params({ formedWithinPct: 1, formedRequireRising: true })
      ).signals
    ).toEqual([
      { time: candles[9].t, side: "buy" },
      { time: candles[23].t, side: "buy" },
    ])
  })

  it("prints the formed long on the first candle back at the base, once", () => {
    // Confirming candle (index 7) is far above the base of 10; index 9 closes
    // at 10.05 (0.5% away) and index 10 also sits near it.
    const closes = LOWS.map((low) => low + 0.5)
    closes[9] = 10.05
    closes[10] = 10.02
    const candles = candlesFromLows(LOWS, closes)
    const output = INDICATORS.base.compute(
      candles,
      params({ formedWithinPct: 1 })
    )
    // One mark per base: the later near-base candle doesn't print again.
    expect(output.signals).toEqual([{ time: candles[9].t, side: "buy" }])
  })

  it("never signals a base break — that rule belongs to the DCA node", () => {
    // One extra candle closing 5% below the base (10) after a quick fall: a
    // textbook crack. Base stays silent; only the formed mark at index 7 fires.
    const candles = candlesFromLows(
      [...LOWS, 9],
      [...LOWS.map((low) => low + 0.5), 9.5]
    )
    const output = INDICATORS.base.compute(candles, PARAMS)
    expect(output.signals).toEqual([{ time: candles[7].t, side: "buy" }])
  })

  it("the chart's Base card maps onto the module's params", () => {
    const chartDefault = DEFAULT_INDICATORS.find((ind) => ind.type === "base")!
    const mapped = baseChartToModuleParams(chartDefault.params)
    expect(() => INDICATORS.base.paramsSchema.parse(mapped)).not.toThrow()
    // The base-forming settings are the same on both sides of the parity rule.
    expect(INDICATORS.base.paramsSchema.parse(mapped)).toMatchObject({
      basePeriods: baseIndicator.defaultParams.basePeriods,
      pumpPeriods: baseIndicator.defaultParams.pumpPeriods,
      formedWithinPct: baseIndicator.defaultParams.formedWithinPct,
    })
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
