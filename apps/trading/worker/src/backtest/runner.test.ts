import { describe, expect, it } from "vitest"

import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import type { RiskParams, StrategyParams } from "@/lib/strategies/params"
import type { HistoryCandle } from "@/server/backtest/history"

import { strategies } from "../strategies/registry"
import { runBacktest, type RunBacktestConfig } from "./runner"

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

// Wide-open limits so risk gating never interferes with the strategy assertions.
const OPEN_RISK: RiskParams = {
  maxPositionNotionalUsd: 1e9,
  maxLeverage: 50,
  dailyLossLimitUsd: 1e9,
  maxDrawdownPct: 100,
  maxOpenOrders: 200,
  cooldownLosses: 0,
  cooldownMinutes: 0,
}

describe("runBacktest", () => {
  it("runs a momentum EMA cross and trades on the signal", () => {
    const closes = [
      100, 99, 98, 97, 96, 95, 96, 98, 100, 103, 106, 109, 112, 110, 107, 104,
      101, 98, 95,
    ]
    const candles = mkCandles(closes)
    const cfg: RunBacktestConfig = {
      strategy: strategies.momentum!,
      params: {
        strategyType: "momentum",
        signal: "ema_cross",
        interval: "1h",
        emaFast: 2,
        emaSlow: 4,
        orderSizeUsd: 1000,
        direction: "both",
      } as StrategyParams,
      riskParams: OPEN_RISK,
      candles,
      simStartMs: candles[3].t,
      startingEquity: 10_000,
      market: "BTC",
      interval: "1h",
      costs: DEFAULT_BACKTEST_COSTS,
    }

    const result = runBacktest(cfg)
    expect(result.fills.length).toBeGreaterThan(0)
    expect(result.equityCurve.length).toBeGreaterThan(1)
    // The up-then-down close series should open a long then flip.
    expect(result.fills.some((f) => f.side === "buy")).toBe(true)
  })

  it("is deterministic — identical inputs produce an identical result", () => {
    const candles = mkCandles([
      100, 99, 98, 97, 96, 95, 96, 98, 100, 103, 106, 109, 112, 110, 107, 104,
    ])
    const cfg: RunBacktestConfig = {
      strategy: strategies.momentum!,
      params: {
        strategyType: "momentum",
        signal: "ema_cross",
        interval: "1h",
        emaFast: 2,
        emaSlow: 4,
        orderSizeUsd: 1000,
        direction: "both",
      } as StrategyParams,
      riskParams: OPEN_RISK,
      candles,
      simStartMs: candles[3].t,
      startingEquity: 10_000,
      market: "BTC",
      interval: "1h",
      costs: DEFAULT_BACKTEST_COSTS,
    }

    expect(runBacktest(cfg)).toEqual(runBacktest(cfg))
  })

  it("records a grid halt when TP is crossed with no open position", () => {
    // Price pumps straight through the TP before any level fills — the run
    // must record the halt (not just go silently empty).
    const candles = mkCandles([100, 103, 106, 109, 112, 115, 118, 121, 124])
    const cfg: RunBacktestConfig = {
      strategy: strategies.grid!,
      params: {
        strategyType: "grid",
        lowerPx: "95",
        upperPx: "125",
        levels: 4,
        sizePerLevelUsd: 100,
        side: "both",
        takeProfitPx: "104",
      } as StrategyParams,
      riskParams: OPEN_RISK,
      candles,
      simStartMs: candles[0].t,
      startingEquity: 10_000,
      market: "BTC",
      interval: "1h",
      costs: DEFAULT_BACKTEST_COSTS,
    }

    const result = runBacktest(cfg)
    expect(result.stats.halt.kind).toBe("grid_stop")
    expect(result.stats.halt.reason).toContain("halted")
  })

  it("fills grid limit levels as price oscillates through the range", () => {
    const candles = mkCandles([100, 98, 100, 102, 100, 98, 100, 102, 100, 98])
    const cfg: RunBacktestConfig = {
      strategy: strategies.grid!,
      params: {
        strategyType: "grid",
        lowerPx: "96",
        upperPx: "104",
        levels: 5,
        sizePerLevelUsd: 100,
        side: "both",
      } as StrategyParams,
      riskParams: OPEN_RISK,
      candles,
      simStartMs: candles[0].t,
      startingEquity: 10_000,
      market: "BTC",
      interval: "1h",
      costs: DEFAULT_BACKTEST_COSTS,
    }

    const result = runBacktest(cfg)
    expect(result.fills.length).toBeGreaterThan(0)
  })
})
