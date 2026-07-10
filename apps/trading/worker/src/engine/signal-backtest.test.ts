import { describe, expect, it } from "vitest"

import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import type { StrategyConfig } from "@/lib/strategies/strategy-config"
import type { HistoryCandle } from "@/server/backtest/history"
import { INDICATORS } from "@/lib/indicators/registry"

import { runBacktest, type RunBacktestConfig } from "../backtest/runner"
import { resolveStrategy } from "../strategies/registry"

const STEP_MS = 3_600_000

function mkCandles(closes: number[]): HistoryCandle[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1]
    return {
      t: i * STEP_MS,
      T: (i + 1) * STEP_MS - 1,
      o,
      h: Math.max(o, c) + 0.5,
      l: Math.min(o, c) - 0.5,
      c,
      v: 1,
      n: 1,
    }
  })
}

/** Fall, turn, then a strong rise: one clean EMA up-cross, then +8% to TP. */
const CLOSES = [
  100, 99, 98, 97, 96, 95, 94, 93, 93.5, 94.5,
  96, 98, 100, 101, 102, 103, 104, 105, 106, 107,
]

const CONFIG: StrategyConfig = {
  v: 2,
  interval: "1h",
  indicator: { type: "ema_cross", params: { fast: 2, slow: 4 } },
  settings: {
    direction: "both",
    orderSizeUsd: 1_000,
    compounding: false,
    takeProfitPct: 5,
    stopLossPct: 3,
    flipOnOppositeSignal: true,
  },
}

function makeCfg(): RunBacktestConfig {
  const strategy = resolveStrategy(CONFIG)
  if (!strategy) throw new Error("signal strategy failed to resolve")
  return {
    strategy,
    params: CONFIG,
    candles: mkCandles(CLOSES),
    simStartMs: 0,
    startingEquity: 10_000,
    market: "TEST",
    interval: "1h",
    costs: DEFAULT_BACKTEST_COSTS,
  }
}

describe("signal engine through the real backtest runner", () => {
  it("is deterministic: identical inputs, identical results", () => {
    const a = runBacktest(makeCfg())
    const b = runBacktest(makeCfg())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("trades, and the TP exit fills exactly at its trigger level", () => {
    const result = runBacktest(makeCfg())
    const entries = result.fills.filter((f) => f.purpose === "sig:entry")
    expect(entries.length).toBeGreaterThan(0)

    const exits = result.fills.filter((f) => f.purpose === "sig:exit")
    expect(exits.length).toBeGreaterThan(0)
    const entryPx = entries[0].px
    // Intrabar honesty: the runner pauses its price path at exitTriggers'
    // exact level, so the TP fill price is the trigger, not the bar extreme.
    const tpLevel = entryPx * (1 + CONFIG.settings.takeProfitPct! / 100)
    expect(Math.abs(exits[0].px - tpLevel)).toBeLessThan(1e-6)
  })

  it("trades only where the indicator paints a signal", () => {
    const result = runBacktest(makeCfg())
    const candles = mkCandles(CLOSES)
    const module = INDICATORS[CONFIG.indicator.type]
    const params = module.paramsSchema.parse(CONFIG.indicator.params)
    const signalTimes = new Set(
      module
        .compute(
          candles.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })),
          params as never
        )
        .signals.map((s) => s.time)
    )
    for (const fill of result.fills.filter((f) => f.purpose === "sig:entry")) {
      // The entry executes at its signal bar's close (or the next bar's open
      // at the latest) — never on a bar the indicator didn't paint.
      const bar = candles.findIndex((c) => fill.t >= c.t && fill.t <= c.T)
      expect(bar).toBeGreaterThanOrEqual(0)
      const onSignalBar = signalTimes.has(candles[bar].t)
      const afterSignalBar = bar > 0 && signalTimes.has(candles[bar - 1].t)
      expect(onSignalBar || afterSignalBar).toBe(true)
    }
  })
})
