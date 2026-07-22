import type { IndicatorCandle } from "@/lib/indicators/contract"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"
import {
  DEFAULT_BACKTEST_COSTS,
  warmupBarsFor,
  type BacktestResult,
} from "@/lib/backtest/types"
import type { CandleInterval, HistoryCandle } from "@/server/backtest/history"
import { INTERVAL_MS } from "@/server/backtest/history"
import { automationHtfInterval } from "@/lib/automations/automation"
import { resampleAutomationCandles } from "@/lib/automations/evaluate"

// The real strategy engine and paper simulator, run right here in the browser.
// Its whole import closure is pure math (no server/node/db), so visualize gets
// the EXACT same buys, sells, and exits the deployed bot and backtest produce —
// one engine, no second copy to drift out of sync.
import { runBacktest } from "../../../worker/src/backtest/runner"
import { createAutomationStrategy } from "../../../worker/src/engine/automation-strategy"
import type { Strategy } from "../../../worker/src/strategies/contract"

/** Ascending, base-interval candle the sim reads (numeric OHLCV). */
export type LiveSimCandle = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/**
 * Nominal paper-account size. It scales ladder *size*, but never the *prices or
 * times* of bases, fills, and exits — so every mark the chart paints is faithful
 * regardless of this number.
 */
const NOMINAL_EQUITY = 10_000

function toHistoryCandle(
  candle: LiveSimCandle | IndicatorCandle,
  intervalMs: number
): HistoryCandle {
  return {
    t: candle.t,
    // Close time; the engine only needs it strictly after the open time.
    T: candle.t + intervalMs - 1,
    o: candle.o,
    h: candle.h,
    l: candle.l,
    c: candle.c,
    v: candle.v,
    n: 0,
  }
}

/**
 * Run the automation as a paper bot over the candles in view and hand back the
 * real engine's result — every fill, every round-trip trade, and the current
 * open position. Returns null when there isn't enough data (or the engine
 * throws), so the caller simply paints nothing.
 *
 * This is a live-bot simulation, not the server backtest: it runs instantly and
 * synchronously over whatever candles the chart already has, with no queue, no
 * DB, and no history fetch.
 */
export function simulateAutomation(input: {
  config: AutomationConfig
  candles: LiveSimCandle[]
  market: string
  interval: CandleInterval
}): BacktestResult | null {
  const { config, candles, market, interval } = input
  if (candles.length < 2) return null
  try {
    const intervalMs = INTERVAL_MS[interval]
    const history = candles.map((candle) => toHistoryCandle(candle, intervalMs))

    // Trade only after the strategy's declared warmup, so bases/filters are
    // primed and pre-warmup candles never emit phantom marks. When the loaded
    // window is shorter than the warmup, there is simply nothing to simulate.
    const warmup = warmupBarsFor(config)
    if (history.length <= warmup + 1) return null
    const simStartMs = history[warmup].t

    // A higher-timeframe filter needs its own series; the browser only has base
    // candles, so resample them exactly (complete buckets only, same helper the
    // paint path uses). Extra history before simStart is fine — the engine's
    // cursor never lets a strategy see a future candle.
    const htfInterval = automationHtfInterval(config)
    const htfCandles = htfInterval
      ? {
          interval: htfInterval,
          candles: resampleAutomationCandles(
            candles,
            interval,
            htfInterval
          ).map((candle) => toHistoryCandle(candle, INTERVAL_MS[htfInterval])),
        }
      : undefined

    const strategy = createAutomationStrategy(config) as Strategy<
      never,
      unknown
    >
    return runBacktest({
      strategy,
      params: config,
      candles: history,
      simStartMs,
      startingEquity: NOMINAL_EQUITY,
      market,
      interval,
      costs: DEFAULT_BACKTEST_COSTS,
      htfCandles,
    })
  } catch {
    // A live UI must never crash on a transient sim error — paint nothing.
    return null
  }
}
