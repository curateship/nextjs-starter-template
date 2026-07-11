import { describe, expect, it } from "vitest"

import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import type { StrategyConfig } from "@/lib/strategies/strategy-config"
import type { HistoryCandle } from "@/server/backtest/history"

import type { Strategy, StrategyCtx } from "../strategies/contract"
import { runBacktest, type RunBacktestConfig } from "./runner"

/** Minimal valid config — the toy strategy ignores it; the runner only reads
 * settings.takeProfitPct for its credibility check. */
const TOY_CONFIG: StrategyConfig = {
  v: 2,
  kind: "signal",
  interval: "1h",
  indicator: { type: "ema_cross", params: { fast: 2, slow: 4 } },
  settings: {
    direction: "both",
    orderSizeUsd: 1_000,
    compounding: false,
    flipOnOppositeSignal: false,
  },
}

const STEP_MS = 3_600_000

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
  const strategy: Strategy<StrategyConfig, ThresholdState> = {
    type: "signal",
    warmup: () => ({ candleIntervals: ["1h"] }),
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
    params: TOY_CONFIG,
    candles,
    simStartMs: candles[0].t,
    startingEquity: 10_000,
    market: "TEST",
    interval: "1h",
    costs: DEFAULT_BACKTEST_COSTS,
  }
}

// Wide-open limits so risk gating never interferes with the strategy assertions.
describe("runBacktest", () => {
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

  it("flags a run whose equity is wiped out (no liquidation modeling)", () => {
    // Long the full account into a −97% crash: equity ends near zero, which a
    // real exchange would have liquidated long before.
    const candles: HistoryCandle[] = [
      { t: 0, T: STEP_MS - 1, o: 100, h: 100, l: 100, c: 100, v: 1, n: 1 },
      { t: STEP_MS, T: 2 * STEP_MS - 1, o: 100, h: 100, l: 3, c: 3, v: 1, n: 1 },
    ]
    const cfg = makeThresholdCfg(candles, {})
    cfg.startingEquity = 100 // buys 1 unit at 100 → crash wipes the account
    const result = runBacktest(cfg)
    expect(result.stats.warnings?.length).toBeGreaterThan(0)
    expect(result.stats.warnings?.[0]).toContain("wipeout")
  })

  it("emits no credibility warnings on a clean profitable run", () => {
    const candles: HistoryCandle[] = [
      { t: 0, T: STEP_MS - 1, o: 100, h: 100, l: 100, c: 100, v: 1, n: 1 },
      { t: STEP_MS, T: 2 * STEP_MS - 1, o: 100, h: 104, l: 99, c: 102, v: 1, n: 1 },
    ]
    const result = runBacktest(makeThresholdCfg(candles, { takeProfitPct: 3 }))
    expect(result.stats.warnings).toEqual([])
  })

})
