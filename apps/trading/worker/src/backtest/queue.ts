import { runFailureMessage } from "@/lib/backtest/run-error"
import {
  warmupBarsFor,
  type BacktestCosts,
  type BacktestInterval,
} from "@/lib/backtest/types"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"
import {
  claimNextPendingBacktest,
  failClaimedBacktest,
  finishClaimedBacktest,
  resetOrphanedRunning,
  updateBacktestProgress,
} from "@/server/backtests"
import { fetchCandleHistory, INTERVAL_MS } from "@/server/backtest/history"
import type { TradingBacktest } from "@/server/schema"

import { runBacktest as runEngine } from "./runner"
import { resolveStrategy } from "../strategies/registry"
import type { WorkerService } from "../runtime-control"

const POLL_MS = 2_000
const PACING_MS = 1_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class BacktestQueueWorker implements WorkerService {
  private readonly workerId: string
  private timer: NodeJS.Timeout | null = null
  private drainPromise: Promise<void> | null = null
  private stopped = true
  private current: TradingBacktest | null = null
  private currentProgress = 0
  private currentStage = "Idle"
  private completed = 0
  private lastCompletedAt: string | null = null
  private latestError: string | null = null
  private needsRecovery = false

  constructor(workerId: string) {
    this.workerId = workerId
  }

  async start() {
    this.stopped = false
    const recovery = await resetOrphanedRunning()
    if (recovery.requeued > 0 || recovery.failed > 0) {
      console.log(
        `backtest worker: recovered ${recovery.requeued} run(s), failed ${recovery.failed}`
      )
    }
    this.timer = setInterval(() => this.kick(), POLL_MS)
    this.kick()
  }

  async stop() {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.drainPromise
  }

  meta() {
    return {
      currentActivity: this.current
        ? `Running ${this.current.market} backtest`
        : "Waiting for queued backtests",
      currentJobMarket: this.current?.market ?? null,
      currentJobProgress: this.currentProgress,
      currentJobStage: this.currentStage,
      completedBacktests: this.completed,
      lastSuccessfulWorkAt: this.lastCompletedAt,
      latestError: this.latestError,
    }
  }

  private kick() {
    if (this.drainPromise || this.stopped) return
    this.drainPromise = this.drain()
      .catch((error) => {
        if (this.current) this.needsRecovery = true
        this.latestError = "Backtest queue failed. Check worker logs."
        console.error("backtest worker: queue failed", error)
      })
      .finally(() => {
        this.current = null
        this.currentProgress = 0
        this.currentStage = "Idle"
        this.drainPromise = null
      })
  }

  private async drain() {
    if (this.needsRecovery) {
      await resetOrphanedRunning()
      this.needsRecovery = false
    }
    while (!this.stopped) {
      const row = await claimNextPendingBacktest(this.workerId)
      this.latestError = null
      if (!row) return
      this.current = row
      await this.runOne(row)
      this.current = null
      this.currentProgress = 0
      this.currentStage = "Idle"
      if (!this.stopped) await sleep(PACING_MS)
    }
  }

  private async progress(row: TradingBacktest, value: number, stage: string) {
    this.currentProgress = value
    this.currentStage = stage
    await updateBacktestProgress(row.id, this.workerId, value, stage)
  }

  private async runOne(row: TradingBacktest) {
    const params = row.params as AutomationConfig
    const interval = row.interval as BacktestInterval
    try {
      await this.progress(row, 10, "Loading history")
      const warmupBars = warmupBarsFor(row.params)
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
      const strategy = resolveStrategy(row.params)
      if (!strategy) {
        throw new Error(`Strategy "${row.strategyType}" can't be backtested.`)
      }

      await this.progress(row, 50, "Running simulation")
      const result = runEngine({
        strategy,
        params,
        candles,
        simStartMs,
        startingEquity: Number(row.startingEquity),
        market: row.market,
        interval,
        costs: row.costs as BacktestCosts,
      })
      await this.progress(row, 95, "Saving results")
      await finishClaimedBacktest(row.id, this.workerId, result)
      this.completed += 1
      this.lastCompletedAt = new Date().toISOString()
    } catch (error) {
      console.error("backtest worker: run failed", row.id, error)
      await failClaimedBacktest(row.id, this.workerId, runFailureMessage(error))
    }
  }
}
