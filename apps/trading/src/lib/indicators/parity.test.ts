import { describe, expect, it } from "vitest"

import {
  crossedAbove,
  crossedBelow,
  ema,
  qflBase,
  qflCeiling,
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

/** Mirror of {@link candlesFromLows} for ceiling tests: the body sits just below
 * each high, so only the resistance side can fire. */
function candlesFromHighs(highs: number[]): IndicatorCandle[] {
  const start = Date.parse("2026-01-01T00:00:00Z")
  return highs.map((h, i) => ({
    t: start + i * 900_000,
    o: h - 1.01,
    h,
    l: h - 1.5,
    c: h - 1,
    v: 1000,
  }))
}

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
  const params = (overrides: Record<string, number | string | boolean> = {}) =>
    INDICATORS.base.paramsSchema.parse({
      basePeriods: 4,
      pumpPeriods: 2,
      // Spacing out of the way unless a test is exercising it.
      formedMinBars: 1,
      // Long-only by default so each test asserts one side at a time; the
      // both-sides behaviour has its own test.
      formedShowShort: false,
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

  it("marks the base however far the confirming candle sits above it", () => {
    // The base is 10 and the confirming candle (index 7) closes at 13.5 — 35%
    // above it. There is no proximity rule, so the mark still prints: judging
    // how close price is to the base is the Price Action indicator's job.
    const candles = candlesFromLows(LOWS)
    expect(candles[7].c).toBe(13.5)
    expect(INDICATORS.base.compute(candles, PARAMS).signals).toEqual([
      { time: candles[7].t, side: "buy" },
    ])
  })

  it("compares BASE levels, not the candles the arrows print on", () => {
    // Two bases: 20, then a lower 15 whose confirming candle closes at 25 —
    // higher than the first mark's candle. Comparing print prices would draw it;
    // comparing base levels (the point of the rule) does not.
    const lows = [
      40, 38, 34, 30, 26, 22, 20, 20.5, 20.6, 20, 18, 16, 15, 15.5, 15.6,
    ]
    const closes = lows.map((low) => low + 0.5)
    closes[14] = 25
    const candles = candlesFromLows(lows, closes)
    const { confirmed } = qflBase(candles, 4, 2)
    expect(confirmed.flatMap((flag, i) => (flag ? [i] : []))).toEqual([8, 14])

    expect(
      INDICATORS.base.compute(candles, PARAMS)
        .signals
    ).toEqual([{ time: candles[8].t, side: "buy" }])
  })

  it("never marks a lower floor, and marks once the market steps back up", () => {
    // Three bases: 20, then a LOWER 15, then 15.1 — a leg down, then the first
    // higher floor after it. They confirm at index 8, 14 and 22.
    const lows = [
      40, 38, 34, 30, 26, 22, 20, 20.5, 20.6, 20, 18, 16, 15, 15.5, 15.6, 15,
      15.2, 15.4, 16.5, 16.6, 15.1, 15.4, 15.5, 15.1,
    ]
    const candles = candlesFromLows(lows)

    const { confirmed } = qflBase(candles, 4, 2)
    expect(confirmed.flatMap((flag, i) => (flag ? [i] : []))).toEqual([8, 14, 22])

    // Base 15 is LOWER, so it never marks — it just becomes the level to beat.
    // Base 15.1 is the first floor above it, so that marks: one arrow per leg,
    // none on the way down.
    expect(INDICATORS.base.compute(candles, PARAMS).signals).toEqual([
      { time: candles[8].t, side: "buy" },
      { time: candles[22].t, side: "buy" },
    ])

    // Spacing still governs: index 22 is 14 candles after index 8, so asking for
    // 20 candles between arrows leaves only the first.
    expect(
      INDICATORS.base.compute(candles, params({ formedMinBars: 20 })).signals
    ).toEqual([{ time: candles[8].t, side: "buy" }])
  })

  it("switching Only higher bases off marks the lower floors too", () => {
    // The staircase fixture: bases 20, 15, 15.1. On (default) the lower 15 is
    // skipped; off, every base is marked, which is why a dash can have no arrow.
    const lows = [
      40, 38, 34, 30, 26, 22, 20, 20.5, 20.6, 20, 18, 16, 15, 15.5, 15.6, 15,
      15.2, 15.4, 16.5, 16.6, 15.1, 15.4, 15.5, 15.1,
    ]
    const candles = candlesFromLows(lows)

    expect(INDICATORS.base.compute(candles, PARAMS).signals).toEqual([
      { time: candles[8].t, side: "buy" },
      { time: candles[22].t, side: "buy" },
    ])
    expect(
      INDICATORS.base.compute(
        candles,
        params({ formedRequireHigherBase: false })
      ).signals
    ).toEqual([
      { time: candles[8].t, side: "buy" },
      { time: candles[14].t, side: "buy" },
      { time: candles[22].t, side: "buy" },
    ])
  })

  it("short hunts ceilings and sells them, long ignores them", () => {
    // Mirror of the base fixture: highs climb to 20 at index 5, then price is
    // capped below it, so the ceiling confirms two bars later at index 7.
    const HIGHS = [10, 12, 14, 16, 18, 20, 18, 17, 16, 15, 14, 13]
    const candles = candlesFromHighs(HIGHS)
    const { confirmed } = qflCeiling(candles, 4, 2)
    expect(confirmed.flatMap((flag, i) => (flag ? [i] : []))).toEqual([7])

    const shorts = INDICATORS.base.compute(
      candles,
      params({ formedShowLong: false, formedShowShort: true })
    ).signals
    expect(shorts).toEqual([{ time: candles[7].t, side: "sell" }])

    // Long looks for support in the same candles and finds nothing to mark here.
    expect(INDICATORS.base.compute(candles, PARAMS).signals).toEqual([])
  })

  it("short wants LOWER ceilings, the mirror of long wanting higher bases", () => {
    // Two ceilings: 20, then a LOWER 18 — a lower high, which is what a short
    // wants. Reversed (a HIGHER second ceiling) the trend filter skips it.
    const falling = [10, 12, 14, 16, 18, 20, 18, 17, 16, 18, 16, 15, 14, 13]
    const rising = [10, 12, 14, 16, 18, 20, 18, 17, 16, 22, 20, 19, 18, 17]
    for (const [highs, label] of [
      [falling, "lower high"],
      [rising, "higher high"],
    ] as const) {
      const candles = candlesFromHighs(highs)
      const { confirmed } = qflCeiling(candles, 4, 2)
      const marks = INDICATORS.base.compute(
        candles,
        params({ formedShowLong: false, formedShowShort: true })
      ).signals
      const found = confirmed.filter(Boolean).length
      // Every mark is a sell, and the filter never keeps more than were found.
      expect(marks.every((signal) => signal.side === "sell")).toBe(true)
      expect(marks.length).toBeLessThanOrEqual(found)
      if (label === "higher high") {
        // A ceiling above the previous one is against a short's trend: skipped.
        const withoutFilter = INDICATORS.base.compute(
          candles,
          params({
            formedShowLong: false,
            formedShowShort: true,
            formedRequireHigherBase: false,
          })
        ).signals
        expect(withoutFilter.length).toBeGreaterThan(marks.length)
      }
    }
  })

  it("marks both sides at once, and each switch hides its own", () => {
    // A fixture with a base AND a ceiling: lows dip to 10 and hold (base at 7),
    // while the highs peak and get capped, giving a ceiling too.
    const lows = [20, 18, 16, 14, 12, 10, 12, 13, 14, 15, 14, 13, 12, 11]
    const candles = lows.map((l, i) => ({
      t: Date.parse("2026-01-01T00:00:00Z") + i * 900_000,
      o: l + 0.4,
      h: l + 2,
      l,
      c: l + 0.5,
      v: 1000,
    }))
    const both = INDICATORS.base.compute(
      candles,
      params({ formedShowLong: true, formedShowShort: true })
    ).signals
    const buys = both.filter((s) => s.side === "buy")
    const sells = both.filter((s) => s.side === "sell")
    expect(buys.length).toBeGreaterThan(0)
    expect(sells.length).toBeGreaterThan(0)
    // Times stay ascending: consumers walk them with a forward-only cursor.
    for (let i = 1; i < both.length; i += 1) {
      expect(both[i].time).toBeGreaterThanOrEqual(both[i - 1].time)
    }

    // Each switch removes exactly its own side.
    expect(
      INDICATORS.base.compute(
        candles,
        params({ formedShowLong: true, formedShowShort: false })
      ).signals
    ).toEqual(buys)
    expect(
      INDICATORS.base.compute(
        candles,
        params({ formedShowLong: false, formedShowShort: true })
      ).signals
    ).toEqual(sells)
    expect(
      INDICATORS.base.compute(
        candles,
        params({ formedShowLong: false, formedShowShort: false })
      ).signals
    ).toEqual([])
  })

  it("drops a base that comes too soon after the last arrow", () => {
    // Two bases five candles apart: 20, then a higher 20.1 — the bunched case.
    const lows = [40, 38, 34, 30, 26, 22, 20, 21, 22, 23, 24, 20.1, 25, 26]
    const candles = candlesFromLows(lows)
    const { confirmed } = qflBase(candles, 4, 2)
    expect(confirmed.flatMap((flag, i) => (flag ? [i] : []))).toEqual([8, 13])

    // No spacing required: both print, five candles apart.
    expect(INDICATORS.base.compute(candles, PARAMS).signals).toEqual([
      { time: candles[8].t, side: "buy" },
      { time: candles[13].t, side: "buy" },
    ])

    // A 6-candle spacing keeps only the first: index 13 is 5 candles after 8.
    expect(
      INDICATORS.base.compute(
        candles,
        params({ formedMinBars: 6 })
      ).signals
    ).toEqual([{ time: candles[8].t, side: "buy" }])
  })

  it("decides live exactly as it decides on history (no look-ahead)", () => {
    // The rising/minimum-gap rule looks BACKWARD at the last base it drew, so a
    // live bot seeing candles one at a time must reach the same verdict the chart
    // reaches over the whole series. Proven by replaying every prefix: the marks
    // for candles[0..k] must equal the full-series marks up to candles[k].
    const live = params({ formedMinBars: 6 })
    const full = INDICATORS.base.compute(CANDLES, live).signals
    for (let k = 1; k <= CANDLES.length; k += 1) {
      const prefix = INDICATORS.base.compute(CANDLES.slice(0, k), live).signals
      const cutoff = CANDLES[k - 1].t
      expect(prefix).toEqual(full.filter((signal) => signal.time <= cutoff))
    }
    expect(full.length).toBeGreaterThan(0)
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
      formedMinBars: baseIndicator.defaultParams.formedMinBars,
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
