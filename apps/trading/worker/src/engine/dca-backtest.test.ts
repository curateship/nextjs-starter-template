import { describe, expect, it } from "vitest"

import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import type { DcaStrategyConfig } from "@/lib/strategies/strategy-config"
import type { HistoryCandle } from "@/server/backtest/history"

import { runBacktest, type RunBacktestConfig } from "../backtest/runner"
import { resolveStrategy } from "../strategies/registry"

const STEP_MS = 3_600_000

function mkCandle(
  i: number,
  o: number,
  h: number,
  l: number,
  c: number
): HistoryCandle {
  return { t: i * STEP_MS, T: (i + 1) * STEP_MS - 1, o, h, l, c, v: 1, n: 1 }
}

/**
 * Anchor at 100 · step 1% (multiplier 1) · 2 safeties sized ×2 · TP 1%:
 * base $100 at 100, s1 $200 at 99, s2 $400 at 98, sell all at avg × 1.01.
 * The price walks down through both rungs, then rebounds through the TP.
 */
const CONFIG: DcaStrategyConfig = {
  v: 2,
  kind: "dca",
  interval: "1h",
  dca: {
    baseOrderUsd: 100,
    priceStepPct: 1,
    stepMultiplier: 1,
    sizeMultiplier: 2,
    safetyOrders: 2,
    takeProfitPct: 1,
  },
}

const CANDLES: HistoryCandle[] = [
  mkCandle(0, 100, 100, 100, 100), // cycle anchors; base fills at 100
  mkCandle(1, 100, 100, 98.9, 99), // crosses s1 (99) but not s2 (98)
  mkCandle(2, 99, 99, 97.9, 98), // crosses s2 (98)
  mkCandle(3, 98, 99.8, 98, 99.5), // rebounds through the TP
]

function makeCfg(): RunBacktestConfig {
  const strategy = resolveStrategy(CONFIG)
  if (!strategy) throw new Error("dca strategy failed to resolve")
  return {
    strategy,
    params: CONFIG,
    candles: CANDLES,
    simStartMs: 0,
    startingEquity: 10_000,
    market: "TEST",
    interval: "1h",
    costs: DEFAULT_BACKTEST_COSTS,
  }
}

describe("dca engine through the real backtest runner", () => {
  it("is deterministic: identical inputs, identical results", () => {
    const a = runBacktest(makeCfg())
    const b = runBacktest(makeCfg())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("ladders down and takes profit off the average entry", () => {
    const result = runBacktest(makeCfg())
    const purposes = result.fills.map((f) => f.purpose)

    // One full cycle, then a fresh cycle's base order on the rebound bar.
    expect(purposes.slice(0, 5)).toEqual([
      "dca:base",
      "dca:s1",
      "dca:s2",
      "dca:tp",
      "dca:base",
    ])
    expect(purposes.every((p) => p.startsWith("dca:"))).toBe(true)

    // Safeties fill at their limit price, never at the bar's extreme.
    const [base, s1, s2, tp] = result.fills
    expect(base.px).toBeCloseTo(100, 9)
    expect(s1.px).toBeCloseTo(99, 9)
    expect(s2.px).toBeCloseTo(98, 9)

    // Rung notionals scale ×2 off the base order.
    expect(base.px * base.sz).toBeCloseTo(100, 6)
    expect(s1.px * s1.sz).toBeCloseTo(200, 6)
    expect(s2.px * s2.sz).toBeCloseTo(400, 6)

    // The TP closes the WHOLE stack exactly 1% above the blended average.
    const qty = base.sz + s1.sz + s2.sz
    const avgEntry = (100 + 200 + 400) / qty
    expect(tp.side).toBe("sell")
    expect(tp.sz).toBeCloseTo(qty, 9)
    expect(tp.px).toBeCloseTo(avgEntry * 1.01, 9)

    // The round trip nets ~TP% minus fees — and can never exceed the TP.
    const trade = result.trades[0]
    expect(trade.side).toBe("long")
    expect(trade.returnPct).toBeGreaterThan(0.8)
    expect(trade.returnPct).toBeLessThan(1.01)
    expect(result.stats.warnings ?? []).toEqual([])
  })

  it("re-anchors a new cycle after the take-profit", () => {
    const result = runBacktest(makeCfg())
    const second = result.fills[4]
    // The rebound bar's high (99.8) is where the flat evaluate re-anchors.
    expect(second.purpose).toBe("dca:base")
    expect(second.px).toBeCloseTo(99.8, 9)
    expect(result.openPosition?.side).toBe("long")
  })
})
