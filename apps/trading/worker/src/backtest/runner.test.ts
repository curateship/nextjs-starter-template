import { describe, expect, it } from "vitest"

import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import type { RiskParams, StrategyParams } from "@/lib/strategies/params"
import type { HistoryCandle } from "@/server/backtest/history"

import { strategies } from "../strategies/registry"
import type { Strategy, StrategyCtx } from "../strategies/contract"
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

type ThresholdState = { boughtOnce: boolean; exitRequested: boolean }

/**
 * Minimal buy-once strategy with tick-checked TP/SL thresholds, used to pin
 * down the exact price the runner's intrabar path fills threshold exits at.
 */
function makeThresholdCfg(
  candles: HistoryCandle[],
  opts: { takeProfitPct?: number; stopLossPct?: number }
): RunBacktestConfig {
  const levels = (ctx: StrategyCtx<ThresholdState>) => {
    if (!ctx.position || ctx.state.exitRequested) return []
    const entry = Number(ctx.position.entryPx)
    const out: number[] = []
    if (opts.takeProfitPct) out.push(entry * (1 + opts.takeProfitPct / 100))
    if (opts.stopLossPct) out.push(entry * (1 - opts.stopLossPct / 100))
    return out
  }
  const strategy: Strategy<StrategyParams, ThresholdState> = {
    type: "momentum",
    warmup: () => ({
      candleIntervals: ["1h"],
      needsBook: false,
      needsTrades: false,
    }),
    init: () => ({ boughtOnce: false, exitRequested: false }),
    onTick: (ctx) => {
      if (!ctx.position || ctx.state.exitRequested) return
      const mid = Number(ctx.mid)
      const entry = Number(ctx.position.entryPx)
      const hitTp =
        opts.takeProfitPct != null &&
        mid >= entry * (1 + opts.takeProfitPct / 100)
      const hitSl =
        opts.stopLossPct != null &&
        mid <= entry * (1 - opts.stopLossPct / 100)
      if (hitTp || hitSl) {
        ctx.setState({ ...ctx.state, exitRequested: true })
      }
    },
    exitTriggers: (ctx) => levels(ctx),
    desiredOrders: (ctx) => {
      const szi = Number(ctx.position?.szi ?? 0)
      if (ctx.state.exitRequested && szi > 0) {
        ctx.setState({ ...ctx.state, exitRequested: false })
        return [
          {
            purpose: "t:exit",
            side: "sell",
            orderType: "market",
            sz: String(szi),
            tif: "Ioc",
            reduceOnly: true,
          },
        ]
      }
      if (!ctx.state.boughtOnce && szi === 0) {
        ctx.setState({ ...ctx.state, boughtOnce: true })
        return [
          {
            purpose: "t:entry",
            side: "buy",
            orderType: "market",
            sz: "1",
            tif: "Ioc",
            reduceOnly: false,
          },
        ]
      }
      return []
    },
  }
  return {
    strategy: strategy as unknown as Strategy<never, unknown>,
    params: { strategyType: "momentum" } as StrategyParams,
    riskParams: OPEN_RISK,
    candles,
    simStartMs: candles[0].t,
    startingEquity: 10_000,
    market: "TEST",
    interval: "1h",
    costs: DEFAULT_BACKTEST_COSTS,
  }
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

  it("fills a take-profit at its trigger level, not the bar's high", () => {
    // Enters long at the first sim bar's close (100), TP at +3% = 103. The
    // next bar spikes to 112: the exit must fill at 103, not the extreme.
    const candles: HistoryCandle[] = [
      { t: 0, T: STEP_MS - 1, o: 100, h: 100, l: 100, c: 100, v: 1, n: 1 },
      { t: STEP_MS, T: 2 * STEP_MS - 1, o: 100, h: 112, l: 99, c: 101, v: 1, n: 1 },
    ]
    const result = runBacktest(makeThresholdCfg(candles, { takeProfitPct: 3 }))
    const exit = result.fills.find((f) => f.side === "sell")
    expect(exit?.px).toBe(103)
  })

  it("fills a stop-loss at its trigger level, not the bar's low", () => {
    const candles: HistoryCandle[] = [
      { t: 0, T: STEP_MS - 1, o: 100, h: 100, l: 100, c: 100, v: 1, n: 1 },
      { t: STEP_MS, T: 2 * STEP_MS - 1, o: 100, h: 101, l: 90, c: 99, v: 1, n: 1 },
    ]
    const result = runBacktest(makeThresholdCfg(candles, { stopLossPct: 3 }))
    const exit = result.fills.find((f) => f.side === "sell")
    expect(exit?.px).toBe(97)
  })

  it("fills at the open when a bar gaps across the trigger", () => {
    // Price never trades between 100 and 108, so the TP fills at the open.
    const candles: HistoryCandle[] = [
      { t: 0, T: STEP_MS - 1, o: 100, h: 100, l: 100, c: 100, v: 1, n: 1 },
      { t: STEP_MS, T: 2 * STEP_MS - 1, o: 108, h: 110, l: 107, c: 109, v: 1, n: 1 },
    ]
    const result = runBacktest(makeThresholdCfg(candles, { takeProfitPct: 3 }))
    const exit = result.fills.find((f) => f.side === "sell")
    expect(exit?.px).toBe(108)
  })

  it("momentum ATR stop exits at the trailed level, not the bar's low", () => {
    // Steady uptrend so EMA 2/4 crosses long, then a crash bar. The exit must
    // fill at the chandelier level (prior close − 3×ATR), above the crash low.
    const closes = [100, 99, 98, 97, 96, 95, 97, 99, 101, 103, 105, 107, 109]
    const candles = mkCandles(closes)
    // Crash bar: falls far through any reasonable stop level.
    candles.push({
      t: candles.length * STEP_MS,
      T: (candles.length + 1) * STEP_MS - 1,
      o: 109,
      h: 109.5,
      l: 80,
      c: 82,
      v: 1,
      n: 1,
    })
    const cfg: RunBacktestConfig = {
      strategy: strategies.momentum!,
      params: {
        strategyType: "momentum",
        signal: "ema_cross",
        interval: "1h",
        emaFast: 2,
        emaSlow: 4,
        stopMode: "atr",
        atrPeriod: 5,
        atrStopMult: 3,
        orderSizeUsd: 1000,
        direction: "long",
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
    const exit = result.fills.find((f) => f.purpose === "momo:exit")
    expect(exit).toBeDefined()
    // Filled at the stop level: strictly better than the crash low, and below
    // the bar's open (i.e. genuinely intrabar, not at an extreme).
    expect(exit!.px).toBeGreaterThan(80)
    expect(exit!.px).toBeLessThan(109)
  })

  it("momentum ADX gate blocks entries when the bar is un-trending", () => {
    const closes = [100, 99, 98, 97, 96, 95, 96, 98, 100, 103, 106, 109, 112]
    const base = {
      strategyType: "momentum",
      signal: "ema_cross",
      interval: "1h",
      emaFast: 2,
      emaSlow: 4,
      orderSizeUsd: 1000,
      direction: "both",
    }
    const run = (extra: object) =>
      runBacktest({
        strategy: strategies.momentum!,
        params: { ...base, ...extra } as StrategyParams,
        riskParams: OPEN_RISK,
        candles: mkCandles(closes),
        simStartMs: mkCandles(closes)[3].t,
        startingEquity: 10_000,
        market: "BTC",
        interval: "1h",
        costs: DEFAULT_BACKTEST_COSTS,
      })
    // An impossible ADX floor blocks every entry; without it entries happen.
    expect(run({ adxMin: 60, adxPeriod: 5 }).fills.length).toBe(0)
    expect(run({}).fills.length).toBeGreaterThan(0)
    // The MACD filter can only reduce (never add) entries.
    expect(run({ macdFilter: true }).fills.length).toBeLessThanOrEqual(
      run({}).fills.length
    )
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
