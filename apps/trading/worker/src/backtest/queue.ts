import { runFailureMessage } from "@/lib/backtest/run-error"
import { automationHtfInterval } from "@/lib/automations/automation"
import {
  warmupBarsFor,
  type BacktestCosts,
  type BacktestInterval,
} from "@/lib/backtest/types"
import { automationHtfWindowBars } from "@/lib/strategies/kinds/automation"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"
import {
  claimNextPendingBacktest,
  claimPendingBacktestGroup,
  failClaimedBacktest,
  finishClaimedBacktest,
  resetOrphanedRunning,
  updateBacktestProgress,
} from "@/server/backtests"
import { fetchCandleHistory, INTERVAL_MS } from "@/server/backtest/history"
import type { TradingBacktest } from "@/server/schema"

import {
  runBacktest as runEngine,
  runDcaPortfolioBacktests,
  type RunBacktestConfig,
} from "./runner"
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
    // A DCA basket shares one wallet across its markets, so the
    // leader claims the whole group and replays it on one account. (A one-market
    // run has no siblings and falls through to the plain single-market path.)
    if (params.dca) {
      const siblings = await claimPendingBacktestGroup(
        row.groupId,
        this.workerId
      )
      if (siblings.length > 0) {
        await this.runPortfolioGroup([row, ...siblings])
        return
      }
    }
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
      // A higher-timeframe filter needs its own series, with its own warmup
      // reaching back far enough for the HTF indicators.
      const htfInterval = automationHtfInterval(params)
      const htfCandles = htfInterval
        ? {
            interval: htfInterval,
            candles: await fetchCandleHistory(
              row.market,
              htfInterval,
              simStartMs -
                automationHtfWindowBars(params) * INTERVAL_MS[htfInterval],
              endMs
            ),
          }
        : undefined
      if (htfInterval && htfCandles?.candles.length === 0) {
        // An empty gate series would silently block every entry — fail the
        // run loudly instead of reporting a fake zero-trade result.
        throw new Error(
          `No ${htfInterval} candle history for ${row.market} in that window.`
        )
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
        htfCandles,
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

  private async runPortfolioGroup(rows: TradingBacktest[]) {
    const configs: Array<{
      row: TradingBacktest
      config: RunBacktestConfig
    }> = []
    // Mark every market as loading up front, in parallel (was one serial DB
    // round-trip per market).
    this.currentProgress = 10
    this.currentStage = "Loading portfolio history"
    await Promise.all(
      rows.map((row) =>
        updateBacktestProgress(
          row.id,
          this.workerId,
          10,
          "Loading portfolio history"
        ).catch(() => {})
      )
    )
    // Fetch each market's candles CONCURRENTLY (a few at a time so we don't
    // hammer the data source). Cold fetches are what dominate a fresh sweep's
    // wall time and they're fully independent, so pulling several at once turns
    // a long serial download into a handful of parallel batches. Slots preserve
    // the original order; a market that can't load fails on its own and drops.
    const FETCH_CONCURRENCY = 8
    const slots: (RunBacktestConfig | null)[] = new Array(rows.length).fill(null)
    let cursor = 0
    const loadWorker = async () => {
      while (cursor < rows.length) {
        const i = cursor++
        const row = rows[i]
        try {
          const params = row.params as AutomationConfig
          const interval = row.interval as BacktestInterval
          const simStartMs = row.startTime.getTime()
          const candles = await fetchCandleHistory(
            row.market,
            interval,
            simStartMs - warmupBarsFor(params) * INTERVAL_MS[interval],
            row.endTime.getTime()
          )
          if (candles.length === 0) {
            throw new Error(`No candle history for ${row.market} in that window.`)
          }
          const strategy = resolveStrategy(params)
          if (!strategy) {
            throw new Error(`Strategy "${row.strategyType}" can't be backtested.`)
          }
          slots[i] = {
            strategy,
            params,
            candles,
            simStartMs,
            startingEquity: Number(row.startingEquity),
            market: row.market,
            interval,
            costs: row.costs as BacktestCosts,
          }
        } catch (error) {
          await failClaimedBacktest(
            row.id,
            this.workerId,
            runFailureMessage(error)
          )
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(FETCH_CONCURRENCY, rows.length) }, loadWorker)
    )
    for (let i = 0; i < rows.length; i++) {
      const config = slots[i]
      if (config) configs.push({ row: rows[i], config })
    }
    if (configs.length === 0) return

    try {
      for (const { row } of configs) {
        await updateBacktestProgress(
          row.id,
          this.workerId,
          50,
          "Running portfolio simulation"
        )
      }
      // Shared-wallet replay; DCA
      // shares 100% of the one wallet. All markets run together on one clock, so
      // they finish as a set — report the replay's progress (50→95%) on every
      // row (throttled) so the UI shows one climbing bar instead of a long
      // freeze that finishes all at once.
      const portfolioConfigs = configs.map((item) => item.config)
      let lastProgressAt = 0
      const onProgress = async (fraction: number) => {
        const now = Date.now()
        if (now - lastProgressAt < 700) return
        lastProgressAt = now
        const pct = Math.min(95, 50 + Math.round(fraction * 45))
        await Promise.all(
          configs.map(({ row }) =>
            updateBacktestProgress(
              row.id,
              this.workerId,
              pct,
              "Running portfolio simulation"
            ).catch(() => {})
          )
        )
      }
      const results = await runDcaPortfolioBacktests(
        portfolioConfigs,
        onProgress
      )
      for (const { row } of configs) {
        const result = results.get(row.market)
        if (!result)
          throw new Error(`Portfolio result missing for ${row.market}.`)
        await finishClaimedBacktest(row.id, this.workerId, result)
        this.completed += 1
      }
      this.lastCompletedAt = new Date().toISOString()
    } catch (error) {
      for (const { row } of configs) {
        await failClaimedBacktest(
          row.id,
          this.workerId,
          runFailureMessage(error)
        ).catch(() => {})
      }
    }
  }
}
