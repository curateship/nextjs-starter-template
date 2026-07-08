import { describe, expect, it } from "vitest"

import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import type { RiskParams, VwapParams } from "@/lib/strategies/params"
import type { HistoryCandle } from "@/server/backtest/history"

import { runBacktest, type RunBacktestConfig } from "../backtest/runner"
import { strategies } from "./registry"

const STEP_MS = 3_600_000

/** Builds hourly candles from a close series, deriving open/high/low. */
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

const OPEN_RISK: RiskParams = {
  maxPositionNotionalUsd: 1e9,
  maxLeverage: 50,
  dailyLossLimitUsd: 1e9,
  maxDrawdownPct: 100,
  maxOpenOrders: 200,
  cooldownLosses: 0,
  cooldownMinutes: 0,
}

const BASE: VwapParams = {
  strategyType: "vwap",
  interval: "1h",
  mode: "cross",
  direction: "both",
  orderSizeUsd: 1000,
}

function runVwap(params: VwapParams, candles: HistoryCandle[], simStartIdx: number) {
  const cfg: RunBacktestConfig = {
    strategy: strategies.vwap!,
    params,
    riskParams: OPEN_RISK,
    candles,
    simStartMs: candles[simStartIdx].t,
    startingEquity: 10_000,
    market: "BTC",
    interval: "1h",
    costs: DEFAULT_BACKTEST_COSTS,
  }
  return runBacktest(cfg)
}

const entryCount = (result: ReturnType<typeof runBacktest>) =>
  result.fills.filter((fill) => fill.purpose === "vwap:entry").length

// Flat warmup pins VWAP near 100; the rise then pushes the close above it.
const FLAT = Array.from({ length: 20 }, () => 100)

describe("vwap strategy", () => {
  it("cross mode goes long when the close crosses above the VWAP line", () => {
    const rise = Array.from({ length: 12 }, (_, i) => 100 + (i + 1) * 3)
    const candles = mkCandles([...FLAT, ...rise])
    const result = runVwap({ ...BASE, mode: "cross" }, candles, FLAT.length)
    expect(entryCount(result)).toBeGreaterThan(0)
  })

  it("reversion mode fades a drop below the lower band and exits at the VWAP", () => {
    // Alternating warmup builds a non-zero volume-weighted σ so the band sits
    // meaningfully below VWAP; a sharp dip pierces it, then price reverts up.
    const warm = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 98 : 102))
    const dipThenRevert = [90, 90, 100, 101]
    const candles = mkCandles([...warm, ...dipThenRevert])
    const result = runVwap(
      { ...BASE, mode: "reversion", bandK: 1, exitAt: "vwap" },
      candles,
      warm.length
    )
    // Enters long on the dip and completes at least one round trip on the revert.
    expect(entryCount(result)).toBeGreaterThan(0)
    expect(result.trades.length).toBeGreaterThan(0)
    expect(result.trades[0].side).toBe("long")
  })

  it("respects a long-only direction filter", () => {
    // A pure downtrend would only ever fire shorts in cross mode.
    const fall = Array.from({ length: 12 }, (_, i) => 100 - (i + 1) * 3)
    const candles = mkCandles([...FLAT, ...fall])
    const result = runVwap({ ...BASE, mode: "cross", direction: "long" }, candles, FLAT.length)
    expect(entryCount(result)).toBe(0)
  })
})
