import { describe, expect, it } from "vitest"

import {
  DEFAULT_INDICATORS,
  sessionChartToModuleParams,
} from "@/lib/trading/indicators-config"
import type { IndicatorCandle } from "./contract"
import { sessionIndicator } from "./defs/session"
import { INDICATORS } from "./registry"

/**
 * The Sessions run signal. Fixtures use the Crypto London block (08:00–16:00
 * UTC every day), so the session boundaries are fixed clock times with no
 * holiday calendar or daylight-saving shift to reason about.
 */

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const OPEN_MS = Date.parse("2026-07-06T08:00:00Z")

type Spec = { o: number; c: number; h?: number; l?: number }

/** Hourly candles from `startMs`. Wicks default to a stub too small to make
 * any candle a rejection shape, so a test only sets them when that is the
 * point of the test. */
function candlesFrom(startMs: number, specs: Spec[]): IndicatorCandle[] {
  return specs.map((spec, i) => ({
    t: startMs + i * HOUR_MS,
    o: spec.o,
    c: spec.c,
    h: spec.h ?? Math.max(spec.o, spec.c) + 0.05,
    l: spec.l ?? Math.min(spec.o, spec.c) - 0.05,
    v: 1000,
  }))
}

/** Green candles of the given body sizes, walking up from 100. */
function green(sizes: number[]): Spec[] {
  let price = 100
  return sizes.map((size) => {
    const spec = { o: price, c: price + size }
    price += size
    return spec
  })
}

/** Red candles of the given body sizes, walking down from 100. */
function red(sizes: number[]): Spec[] {
  let price = 100
  return sizes.map((size) => {
    const spec = { o: price, c: price - size }
    price -= size
    return spec
  })
}

const params = (overrides: Record<string, number | string> = {}) =>
  sessionIndicator.paramsSchema.parse({
    session: "utcLondon",
    ...overrides,
  }) as never

const PARAMS = params()

const signalsOf = (candles: IndicatorCandle[], p: never = PARAMS) =>
  INDICATORS.session.compute(candles, p).signals

describe("Sessions run signal", () => {
  it("buys the third green candle of the session", () => {
    const candles = candlesFrom(OPEN_MS, green([1, 1, 1]))
    expect(signalsOf(candles)).toEqual([{ time: candles[2].t, side: "buy" }])
  })

  it("sells the third red candle of the session", () => {
    const candles = candlesFrom(OPEN_MS, red([1, 1, 1]))
    expect(signalsOf(candles)).toEqual([{ time: candles[2].t, side: "sell" }])
  })

  it("counts only candles since the open, never the ones before it", () => {
    // Two green candles in the quiet hours, then one after the open: a run of
    // three on the clock, but only one candle of it belongs to the session.
    const candles = candlesFrom(OPEN_MS - 2 * HOUR_MS, green([1, 1, 1]))
    expect(signalsOf(candles)).toEqual([])
  })

  it("needs one of the last two candles to match or beat the first's body", () => {
    // 3 then 1 then 1: the run fades away, so nothing fires.
    expect(signalsOf(candlesFrom(OPEN_MS, green([3, 1, 1])))).toEqual([])
    // An equal-sized body is explicitly enough.
    const equal = candlesFrom(OPEN_MS, green([1, 1, 1]))
    expect(signalsOf(equal)).toHaveLength(1)
    // Only the second candle grows, which is still one of the last two.
    expect(signalsOf(candlesFrom(OPEN_MS, green([1, 4, 0.5])))).toHaveLength(1)
  })

  it("keeps looking after a failed run, three candles at a time", () => {
    // 3,1,1 fails. The next window is 1,1,4 — its first body is 1 and the last
    // is bigger, so the fourth candle fires.
    const candles = candlesFrom(OPEN_MS, green([3, 1, 1, 4]))
    expect(signalsOf(candles)).toEqual([{ time: candles[3].t, side: "buy" }])
  })

  it("a candle that closed where it opened breaks the run", () => {
    const specs: Spec[] = [
      { o: 100, c: 101 },
      { o: 101, c: 101 }, // no colour at all
      { o: 101, c: 102 },
      { o: 102, c: 103 },
      { o: 103, c: 104 },
    ]
    const candles = candlesFrom(OPEN_MS, specs)
    // The first three candles include the flat one, so the run only completes
    // on the fifth candle.
    expect(signalsOf(candles)).toEqual([{ time: candles[4].t, side: "buy" }])
  })

  it("throws away a long whose last candle is an inverted hammer", () => {
    const specs: Spec[] = [
      { o: 100, c: 100.1 },
      { o: 100.1, c: 101 },
      // Small body at the bottom, long wick above: the push higher was sold.
      { o: 101, c: 101.2, h: 102.6, l: 100.7 },
      { o: 101.2, c: 102.2 },
    ]
    const candles = candlesFrom(OPEN_MS, specs)
    // The third candle is refused; the fourth completes a clean run instead.
    expect(signalsOf(candles)).toEqual([{ time: candles[3].t, side: "buy" }])
    // Asking for a much longer wick stops it being a rejection, so the third
    // candle fires after all — one signal, and an earlier one.
    expect(signalsOf(candles, params({ wickBodyRatio: 9 }))).toEqual([
      { time: candles[2].t, side: "buy" },
    ])
  })

  it("throws away a short whose last candle is a hanging man", () => {
    const specs: Spec[] = [
      { o: 100, c: 99.9 },
      { o: 99.9, c: 99 },
      // Small body at the top, long wick below: buyers defended the low.
      { o: 99, c: 98.8, h: 99.3, l: 97.4 },
      { o: 98.8, c: 97.8 },
    ]
    const candles = candlesFrom(OPEN_MS, specs)
    expect(signalsOf(candles)).toEqual([{ time: candles[3].t, side: "sell" }])
  })

  it("fires at most once per session, and again the next day", () => {
    const day1 = candlesFrom(OPEN_MS, green([1, 1, 1, 1, 1, 1]))
    const day2 = candlesFrom(OPEN_MS + DAY_MS, red([1, 1, 1, 1]))
    const candles = [...day1, ...day2]
    expect(signalsOf(candles)).toEqual([
      { time: day1[2].t, side: "buy" },
      { time: day2[2].t, side: "sell" },
    ])
  })

  it("ignores a run that only completes after the session closed", () => {
    // The block closes at 16:00 UTC, so the last candle inside it opens at
    // 15:00. A run starting at 15:00 completes two candles too late.
    const candles = candlesFrom(OPEN_MS + 7 * HOUR_MS, green([1, 1, 1]))
    expect(candles[0].t).toBe(Date.parse("2026-07-06T15:00:00Z"))
    expect(signalsOf(candles)).toEqual([])
  })

  it("skips a session that was already running before the first candle", () => {
    // A perfect run, but it starts an hour into the session — its opening
    // candles are missing, so "the first run of the session" is unanswerable.
    const candles = candlesFrom(OPEN_MS + HOUR_MS, green([1, 1, 1]))
    expect(signalsOf(candles)).toEqual([])
  })

  it("decides live exactly as it decides on history (no look-ahead)", () => {
    // Three days of candles around the clock, so sessions open and close
    // inside the series. Every prefix must agree with the full run: a live bot
    // seeing one candle at a time cannot be allowed to differ from the chart.
    const specs: Spec[] = []
    let price = 100
    for (let i = 0; i < 72; i += 1) {
      // Deterministic zig-zag with runs of both colours and mixed body sizes.
      const step = ((i % 7) - 3) * 0.4
      specs.push({ o: price, c: price + step })
      price += step
    }
    const candles = candlesFrom(OPEN_MS - 8 * HOUR_MS, specs)
    const full = signalsOf(candles)
    expect(full.length).toBeGreaterThan(0)
    for (let k = 1; k <= candles.length; k += 1) {
      const cutoff = candles[k - 1].t
      expect(signalsOf(candles.slice(0, k))).toEqual(
        full.filter((signal) => signal.time <= cutoff)
      )
    }
  })

  it("paints the chart's own session shading for the picked session", () => {
    const candles = candlesFrom(OPEN_MS, green([1, 1, 1]))
    const output = INDICATORS.session.compute(candles, PARAMS)
    expect(output.paint.indicators).toEqual([
      {
        id: "session",
        type: "session",
        enabled: true,
        params: { wickBodyRatio: 2 },
        session: "utcLondon",
      },
    ])
    // One shaded box over the candles that fall inside the session, bounded by
    // what they traded — the same geometry the trade chart's overlay draws.
    expect(output.paint.zones).toEqual([
      {
        id: `session-${OPEN_MS}`,
        fromMs: OPEN_MS,
        toMs: candles[2].t,
        top: Math.max(...candles.map((candle) => candle.h)),
        bottom: Math.min(...candles.map((candle) => candle.l)),
      },
    ])
  })

  it("the chart's Sessions card maps onto the module's params", () => {
    const chartDefault = DEFAULT_INDICATORS.find((ind) => ind.type === "session")!
    const mapped = sessionChartToModuleParams(chartDefault)
    expect(sessionIndicator.paramsSchema.parse(mapped)).toEqual(
      sessionIndicator.defaultParams
    )
  })

  it("settings saved before the signal existed still parse to the defaults", () => {
    expect(sessionIndicator.paramsSchema.parse({})).toEqual(
      sessionIndicator.defaultParams
    )
  })
})
