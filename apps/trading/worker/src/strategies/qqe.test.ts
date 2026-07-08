import { describe, expect, it } from "vitest"

import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import type { QqeParams, RiskParams } from "@/lib/strategies/params"
import type { HistoryCandle } from "@/server/backtest/history"

import type { CandleWsEvent } from "@nktkas/hyperliquid"

import { runBacktest, type RunBacktestConfig } from "../backtest/runner"
import type { PositionState, StrategyCtx } from "./contract"
import { qqeStrategy, type QqeState } from "./qqe"
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

const BASE_QQE: QqeParams = {
  strategyType: "qqe",
  interval: "1h",
  rsiPeriod: 5,
  rsiSmoothing: 3,
  qqeFactor: 4.238,
  threshold: 10,
  maType: "EMA",
  rsiSource: "close",
  colorBars: false,
  consolidationFilter: false,
  loopbackPeriod: 5,
  minConsolidationLen: 3,
  paintConsolidation: false,
  paintSwings: false,
  swingLookback: 5,
  swingStopLoss: false,
  orderSizeUsd: 1000,
  takeProfitPct: 3,
}

function runQqe(params: QqeParams, candles: HistoryCandle[], simStartIdx: number) {
  const cfg: RunBacktestConfig = {
    strategy: strategies.qqe!,
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
  result.fills.filter((fill) => fill.purpose === "qqe:entry").length

/** CandleWsEvent (string-typed) series for driving onCandleClose directly. */
function wsCandles(closes: number[]): CandleWsEvent[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1]
    return {
      t: i * STEP_MS,
      T: (i + 1) * STEP_MS - 1,
      s: "BTC",
      i: "1h",
      o: String(o),
      c: String(c),
      h: String(Math.max(o, c) + 0.5),
      l: String(Math.min(o, c) - 0.5),
      v: "1",
      n: 1,
    }
  })
}

/** A minimal StrategyCtx that records emits and the last state written. */
function mockCtx(opts: {
  mid: number
  position: PositionState
  state: QqeState
  now?: number
  candles?: CandleWsEvent[]
}) {
  const emitted: { type: string; message: string }[] = []
  let current = opts.state
  const ctx: StrategyCtx<QqeState> = {
    market: "BTC",
    mid: String(opts.mid),
    candles: () => opts.candles ?? [],
    position: opts.position,
    equity: "10000",
    state: opts.state,
    setState: (next) => {
      current = next
      ctx.state = next
    },
    emit: (type, message) => emitted.push({ type, message }),
    now: opts.now ?? 0,
  }
  return { ctx, emitted, getState: () => current }
}

// A small-noise warmup (keeps RSI near 50) then a monotonic climb that pushes
// the smoothed RSI through 50+threshold and holds it there — one fresh cross,
// then a long trend the re-entry logic can rejoin after each take-profit.
const WARMUP = Array.from({ length: 26 }, (_, i) => (i % 2 === 0 ? 100 : 101))
const CLIMB = Array.from({ length: 40 }, (_, i) => 100 * 1.02 ** (i + 1))
const UPTREND = mkCandles([...WARMUP, ...CLIMB])
const SIM_START = WARMUP.length

describe("qqe strategy", () => {
  it("re-enters the trend after a take-profit, adding entries over no-reentry", () => {
    const noReentry = runQqe({ ...BASE_QQE, trendReentry: false }, UPTREND, SIM_START)
    const withReentry = runQqe({ ...BASE_QQE, trendReentry: true }, UPTREND, SIM_START)

    // The trend produces a fresh cross either way…
    expect(entryCount(noReentry)).toBeGreaterThan(0)
    // …but re-entry rejoins it after every TP, so it takes strictly more.
    expect(entryCount(withReentry)).toBeGreaterThan(entryCount(noReentry))
  })

  it("caps re-entries per excursion at maxReentries", () => {
    const uncapped = runQqe({ ...BASE_QQE, trendReentry: true }, UPTREND, SIM_START)
    const capped = runQqe(
      { ...BASE_QQE, trendReentry: true, maxReentries: 1 },
      UPTREND,
      SIM_START
    )

    // One continuous excursion, so the cap of 1 allows fresh + 1 re-entry only.
    expect(entryCount(capped)).toBeLessThan(entryCount(uncapped))
    expect(entryCount(capped)).toBeGreaterThan(0)
  })

  it("swing stop exits a long when price breaks the state swing low", () => {
    const params: QqeParams = { ...BASE_QQE, swingStopLoss: true }
    const state: QqeState = { ...qqeStrategy.init(params), swingLow: 100 }
    const { ctx, getState } = mockCtx({
      mid: 99, // below the swing low
      position: { szi: "1", entryPx: "110" },
      state,
    })
    const emitted: { type: string; message: string }[] = []
    ctx.emit = (type, message) => emitted.push({ type, message })

    qqeStrategy.onTick!(ctx, params)

    expect(emitted.some((e) => e.type === "exit" && /swing base/i.test(e.message))).toBe(true)
    expect(getState().exitRequested).toBe(true)
  })

  it("swing stop holds a long while price stays above the swing low", () => {
    const params: QqeParams = { ...BASE_QQE, swingStopLoss: true }
    const state: QqeState = { ...qqeStrategy.init(params), swingLow: 100 }
    const { ctx, getState } = mockCtx({
      mid: 101, // still above the swing low
      position: { szi: "1", entryPx: "110" },
      state,
    })
    qqeStrategy.onTick!(ctx, params)
    expect(getState().exitRequested).toBe(false)
  })

  it("swing stop exits a short when price breaks the state swing high", () => {
    const params: QqeParams = { ...BASE_QQE, swingStopLoss: true }
    const state: QqeState = { ...qqeStrategy.init(params), swingHigh: 100 }
    const { ctx, getState } = mockCtx({
      mid: 101, // above the swing high
      position: { szi: "-1", entryPx: "90" },
      state,
    })
    const emitted: { type: string; message: string }[] = []
    ctx.emit = (type, message) => emitted.push({ type, message })

    qqeStrategy.onTick!(ctx, params)

    expect(emitted.some((e) => e.type === "exit" && /swing roof/i.test(e.message))).toBe(true)
    expect(getState().exitRequested).toBe(true)
  })

  it("computes a live swing-base low from structure on each close", () => {
    const params: QqeParams = {
      ...BASE_QQE,
      swingStopLoss: true,
      swingScanBars: 6,
      swingConfirmBars: 2,
    }
    // The swing-base stop only reads the last scan+confirm+2 bars, so the base
    // must sit inside that window: a decline that bottoms near ~120 and holds
    // two bars before ticking back up.
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 + i * 2), // rising warmup
      140, 136, 132, 128, 124, 122, 120, 120, 122, 124, // decline → base ~120
    ]
    const ws = wsCandles(closes)
    const { ctx, getState } = mockCtx({
      mid: closes[closes.length - 1],
      position: null,
      state: qqeStrategy.init(params),
      now: ws[ws.length - 1].T,
      candles: ws,
    })
    qqeStrategy.onCandleClose!(ctx, params, ws[ws.length - 1])
    const { swingLow } = getState()
    expect(swingLow).not.toBeNull()
    expect(Number.isFinite(swingLow as number)).toBe(true)
  })
})
