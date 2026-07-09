import { runFailureMessage } from "@/lib/backtest/run-error"
import { warmupBarsFor } from "@/lib/backtest/types"
import type {
  BacktestCosts,
  BacktestInterval,
} from "@/lib/backtest/types"
import type { RiskParams, StrategyParams } from "@/lib/strategies/params"
import {
  claimNextPendingBacktest,
  failUserBacktest,
  finishUserBacktest,
  resetOrphanedRunning,
} from "@/server/backtests"
import type { TradingBacktest } from "@/server/schema"

import { fetchCandleHistory, INTERVAL_MS } from "./history"

// Static imports are safe here: this module lives under src/server and never
// reaches the client bundle, so pulling the pure engine + strategy registry in
// directly (rather than lazily) is fine.
import { runBacktest as runEngine } from "../../../worker/src/backtest/runner"
import { strategies } from "../../../worker/src/strategies/registry"

/** Pause between markets so a big basket drips into the candle source. */
const PACING_MS = 1_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Runs one claimed (`running`) row: downloads its history, replays it through
 * the engine, and marks it done — or records a short error on the row. Never
 * throws, so one bad market can't stop the queue.
 */
async function runOneBacktestRow(row: TradingBacktest): Promise<void> {
  const params = row.params as StrategyParams
  const interval = row.interval as BacktestInterval
  try {
    const warmupBars = warmupBarsFor(params.strategyType)
    const simStartMs = row.startTime.getTime()
    const endMs = row.endTime.getTime()
    const fetchStart = simStartMs - warmupBars * INTERVAL_MS[interval]

    const candles = await fetchCandleHistory(
      row.market,
      interval,
      fetchStart,
      endMs
    )
    if (candles.length === 0) {
      throw new Error(`No candle history for ${row.market} in that window.`)
    }
    const strategy = strategies[params.strategyType]
    if (!strategy) {
      throw new Error(`Strategy "${params.strategyType}" can't be backtested.`)
    }

    const result = runEngine({
      strategy,
      params,
      riskParams: row.riskParams as RiskParams,
      candles,
      simStartMs,
      startingEquity: Number(row.startingEquity),
      market: row.market,
      interval,
      costs: row.costs as BacktestCosts,
    })
    await finishUserBacktest(row.id, result)
  } catch (error) {
    console.error("backtest run failed", row.id, error)
    await failUserBacktest(row.id, runFailureMessage(error))
  }
}

let draining = false
let recovered = false

/**
 * Nudges the background queue. Fire-and-forget and idempotent: if a drain loop
 * is already running this is a no-op, so it's safe to call on every enqueue and
 * every dashboard load. The first call also performs restart recovery.
 */
export function kickBacktestQueue(): void {
  void ensureDraining()
}

async function ensureDraining(): Promise<void> {
  // Restart recovery, once per process: a row left `running` was orphaned by a
  // prior crash (nothing computes it now), so requeue it as `pending`.
  if (!recovered) {
    recovered = true
    try {
      const requeued = await resetOrphanedRunning()
      if (requeued > 0) {
        console.log(`[backtest-queue] requeued ${requeued} orphaned run(s)`)
      }
    } catch (error) {
      console.error("[backtest-queue] recovery failed", error)
    }
  }

  if (draining) return
  draining = true
  try {
    for (;;) {
      const row = await claimNextPendingBacktest()
      if (!row) break
      await runOneBacktestRow(row)
      await sleep(PACING_MS)
    }
  } catch (error) {
    console.error("[backtest-queue] drain loop error", error)
  } finally {
    draining = false
  }
}
