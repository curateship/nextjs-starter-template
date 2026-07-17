import { describe, expect, it } from "vitest"

import type { IndicatorCandle } from "@/lib/indicators/contract"
import {
  automationHtfWindowBars,
  automationWarmupBars,
} from "@/lib/strategies/kinds/automation"

import {
  automationHtfInterval,
  automationIntervalRatio,
  type AutomationConfig,
} from "./automation"
import { evaluateAutomation, resampleAutomationCandles } from "./evaluate"

const M15 = 900_000
const H1 = 3_600_000

/** Flat OHLC candle at a given close value. */
const bar = (t: number, value: number, high = value): IndicatorCandle => ({
  t,
  o: value,
  h: high,
  l: value,
  c: value,
  v: 1,
})

/** Strictly rising 15m closes: breakout(3) fires a buy on every bar ≥ 3. */
const risingBase = (count: number) =>
  Array.from({ length: count }, (_, i) => bar(i * M15, 100 + i))

/**
 * 1h candles that stay flat (no breakout signal) until `breakAt`, whose close
 * jumps above every earlier high — breakout(3) fires exactly one buy there.
 */
const htfFlatThenBreak = (count: number, breakAt: number) =>
  Array.from({ length: count }, (_, k) =>
    k < breakAt ? bar(k * H1, 50) : bar(k * H1, 60)
  )

const htfConfig: AutomationConfig = {
  v: 2,
  kind: "automation",
  interval: "15m",
  protection: {},
  rules: [
    {
      id: "buy",
      action: "buy",
      targetEquityPct: 25,
      condition: {
        kind: "trigger",
        nodeId: "entry",
        indicator: { type: "breakout", params: { lookback: 3 } },
        side: "buy",
        filters: [
          {
            nodeId: "gate",
            indicator: { type: "breakout", params: { lookback: 3 } },
            interval: "1h",
          },
        ],
      },
    },
  ],
}

describe("interval helpers", () => {
  it("ratio accepts only strictly-higher clean multiples", () => {
    expect(automationIntervalRatio("15m", "4h")).toBe(16)
    expect(automationIntervalRatio("15m", "1h")).toBe(4)
    expect(automationIntervalRatio("1h", "15m")).toBeNull()
    expect(automationIntervalRatio("15m", "15m")).toBeNull()
  })

  it("finds the config's higher timeframe and sizes its window", () => {
    expect(automationHtfInterval(htfConfig)).toBe("1h")
    const base: AutomationConfig = {
      ...htfConfig,
      rules: [
        {
          ...htfConfig.rules[0],
          condition: { ...htfConfig.rules[0].condition, filters: [] },
        } as AutomationConfig["rules"][number],
      ],
    }
    expect(automationHtfInterval(base)).toBeNull()
    expect(automationHtfWindowBars(base)).toBe(0)
    // breakout(3) warmup 13, base window warmup ceil'd over ratio 4, +5.
    const baseWindow = automationWarmupBars(htfConfig)
    expect(automationHtfWindowBars(htfConfig)).toBe(
      13 + Math.ceil(baseWindow / 4) + 5
    )
  })

  it("keeps higher-timeframe filters out of the base warmup", () => {
    // The HTF gate warms up on its own series — the base window only needs
    // the entry indicator (13 + 5 = 18).
    expect(automationWarmupBars(htfConfig)).toBe(18)
  })
})

describe("resampleAutomationCandles", () => {
  it("aggregates complete buckets exactly and drops partial ones", () => {
    const base = [
      bar(0, 10, 12),
      bar(M15, 11, 15),
      bar(2 * M15, 9),
      bar(3 * M15, 14),
      bar(4 * M15, 20),
      bar(5 * M15, 21),
    ]
    const resampled = resampleAutomationCandles(base, "15m", "1h")
    expect(resampled).toHaveLength(1)
    expect(resampled[0]).toMatchObject({
      t: 0,
      o: 10,
      h: 15,
      l: 9,
      c: 14,
      v: 4,
    })
  })

  it("drops a leading partial bucket from a mid-hour window start", () => {
    const base = Array.from({ length: 7 }, (_, i) => bar((i + 1) * M15, 10))
    const resampled = resampleAutomationCandles(base, "15m", "1h")
    expect(resampled.map((candle) => candle.t)).toEqual([H1])
  })
})

describe("evaluateAutomation with a higher-timeframe filter", () => {
  it("no-lookahead: the gate opens on the first base candle at/after the HTF close", () => {
    const base = risingBase(36)
    // 7 CLOSED 1h candles; the breakout fires on candle 6 (opens 6h,
    // closes 7h). First gated entry: the base candle OPENING at 7h = bar 28.
    const htf = htfFlatThenBreak(7, 6)
    const result = evaluateAutomation(base, htfConfig, htf)

    expect(result.actions.length).toBeGreaterThan(0)
    expect(result.actions[0].time).toBe(28 * M15)
    // All 16 base bars inside the breaking 4h..7h window still saw the old
    // (empty) opinion — nothing fired before bar 28.
    expect(result.actions.every((action) => action.time >= 28 * M15)).toBe(
      true
    )
  })

  it("blocks everything when the HTF series is empty (fail-safe)", () => {
    const result = evaluateAutomation(risingBase(36), htfConfig, [])
    expect(result.actions).toEqual([])
  })

  it("paints HTF lines only from the moment the engine could see them", () => {
    const base = risingBase(36)
    const htf = htfFlatThenBreak(7, 6)
    const result = evaluateAutomation(base, htfConfig, htf)
    const gateLines = result.paint.lines.filter((line) =>
      line.id.startsWith("gate@1h:")
    )
    expect(gateLines.length).toBeGreaterThan(0)
    const baseTimes = new Set(base.map((candle) => candle.t))
    for (const line of gateLines) {
      expect(line.points.length).toBeGreaterThan(0)
      for (const point of line.points) {
        expect(baseTimes.has(point.time)).toBe(true)
        // The first HTF channel value exists at 3h (needs 3 candles of
        // history) and closes at 4h — nothing painted before that.
        expect(point.time).toBeGreaterThanOrEqual(4 * H1)
      }
    }
  })

  it("runs one node on both clocks: base trigger AND higher-timeframe gate", () => {
    // The same `gate` indicator fires entries on the bot timeframe (via a
    // second rule) while also gating the first rule through the 1h clock.
    // The entry trigger gets distinct params so the shared-selection paint
    // dedupe doesn't hide gate's own base-clock paint.
    const dualConfig: AutomationConfig = {
      ...htfConfig,
      rules: [
        {
          ...htfConfig.rules[0],
          condition: {
            ...htfConfig.rules[0].condition,
            indicator: { type: "breakout", params: { lookback: 4 } },
          } as AutomationConfig["rules"][number]["condition"],
        },
        {
          id: "direct",
          action: "buy",
          targetEquityPct: 10,
          condition: {
            kind: "trigger",
            nodeId: "gate",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "buy",
          },
        },
      ],
    }
    const base = risingBase(36)
    const htf = htfFlatThenBreak(7, 6)
    const result = evaluateAutomation(base, dualConfig, htf)

    // The base-clock trigger role fires from bar 3 (rising tape) — long
    // before the 1h gate opens at bar 28. Both roles computed, no collision.
    expect(result.actions[0].time).toBe(3 * M15)
    // Both computations painted, under distinct clock-tagged ids.
    const ids = result.paint.lines.map((line) => line.id)
    expect(ids.some((id) => id.startsWith("gate:"))).toBe(true)
    expect(ids.some((id) => id.startsWith("gate@1h:"))).toBe(true)
  })

  it("resamples the base series for paint callers that pass no HTF data", () => {
    // 36 rising 15m bars = 9 exact 1h candles, also strictly rising, so the
    // resampled gate turns bullish and lets the same trigger fire.
    const result = evaluateAutomation(risingBase(36), htfConfig)
    expect(result.actions.length).toBeGreaterThan(0)
  })

  it("drops misaligned HTF candles instead of shifting the clock", () => {
    const misaligned = htfFlatThenBreak(7, 6).map((candle) => ({
      ...candle,
      t: candle.t + 1,
    }))
    const result = evaluateAutomation(risingBase(36), htfConfig, misaligned)
    expect(result.actions).toEqual([])
  })
})
