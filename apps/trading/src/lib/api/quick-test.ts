import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { runFailureMessage } from "@/lib/backtest/run-error"
import {
  DEFAULT_BACKTEST_COSTS,
  maxWindowDays,
  warmupBarsFor,
  type BacktestResult,
} from "@/lib/backtest/types"
import type { IndicatorOutput } from "@/lib/indicators/contract"
import { INDICATORS } from "@/lib/indicators/registry"
import { strategyConfigSchema } from "@/lib/strategies/strategy-config"

const quickTestSchema = z.object({
  /** Quick tests replay the SAME exchange data the chart shows. */
  network: z.enum(["mainnet", "testnet"]),
  market: z.string().min(1).max(20),
  windowDays: z.number().int().min(1).max(365),
  startingEquity: z.number().positive().max(100_000_000).default(10_000),
  config: strategyConfigSchema,
})

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/** Hyperliquid's candleSnapshot returns at most ~5000 bars per request. */
const MAX_SNAPSHOT_BARS = 4_800

/**
 * One quick test per user at a time: it fetches candles and runs the engine
 * inline in the request, so unbounded parallel calls would hog the server.
 */
const inFlightTests = new Set<string>()

export type QuickTestResponse = {
  result: BacktestResult
  /**
   * The indicator's paint + signals computed over the exact candles the test
   * traded — the chart swaps to these while the result is shown, so zones,
   * arrows, and trade chips all come from one computation.
   */
  output: IndicatorOutput
  simStartMs: number
  windowDays: number
}

/**
 * Quick Test: replay a strategy config over recent history through the SAME
 * deterministic engine backtests use — inline in the request, no queue, no
 * saved row. Candles come from Hyperliquid (the chart's own data source) so
 * the test's trades line up with the signals painted on the chart; the
 * dedicated Backtest area keeps its Binance history for deep windows.
 */
const quickTestFn = createServerFn({ method: "POST" })
  .inputValidator(quickTestSchema)
  .handler(async ({ data }): Promise<QuickTestResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()
    if (!user) throw new Error("Missing Custom Shell session")
    if (inFlightTests.has(user.id)) {
      throw new Error("A quick test is already running — wait for it to finish.")
    }
    inFlightTests.add(user.id)
    try {
      return await evaluateQuickTest(data)
    } catch (error) {
      // Don't leak upstream/internal error text to the client.
      console.error("quick test failed", error)
      throw new Error(runFailureMessage(error))
    } finally {
      inFlightTests.delete(user.id)
    }
  })

/** Pure evaluation (no auth): fetch the chart's own candles, run the engine. */
async function evaluateQuickTest(
  data: z.infer<typeof quickTestSchema>
): Promise<QuickTestResponse> {
  {
    const { getInfoClient } = await import("@/server/hyperliquid/info")
    const { resolveStrategy } = await import("../../../worker/src/strategies/registry")
    const { runBacktest: runEngine } = await import("../../../worker/src/backtest/runner")

    const interval = data.config.interval
    const step = INTERVAL_MS[interval]
    const strategy = resolveStrategy(data.config)
    if (!strategy) throw new Error("Invalid strategy configuration.")

    // Bound the window so warmup + test fit one exchange snapshot.
    const warmupBars = warmupBarsFor(data.config)
    const barsPerDay = 86_400_000 / step
    const maxDays = Math.min(
      maxWindowDays(interval),
      Math.floor((MAX_SNAPSHOT_BARS - warmupBars) / barsPerDay)
    )
    const windowDays = Math.max(1, Math.min(data.windowDays, maxDays))

    const endMs = Date.now()
    const simStartMs = endMs - windowDays * 86_400_000
    const fetchStart = simStartMs - warmupBars * step

    const snapshot = await getInfoClient(data.network).candleSnapshot({
      coin: data.market,
      interval,
      startTime: fetchStart,
      endTime: endMs,
    })
    if (snapshot.length === 0) {
      throw new Error(`No candle history for ${data.market} in that window.`)
    }
    const candles = snapshot.map((candle) => ({
      t: candle.t,
      T: candle.T,
      o: Number(candle.o),
      h: Number(candle.h),
      l: Number(candle.l),
      c: Number(candle.c),
      v: Number(candle.v),
      n: candle.n,
    }))

    const module = INDICATORS[data.config.indicator.type]
    const indicatorParams = module.paramsSchema.parse(data.config.indicator.params)
    const output = module.compute(candles, indicatorParams as never)

    const result = runEngine({
      strategy,
      params: data.config,
      candles,
      simStartMs,
      startingEquity: data.startingEquity,
      market: data.market,
      interval,
      costs: DEFAULT_BACKTEST_COSTS,
    })
    return { result, output, simStartMs, windowDays }
  }
}

export function runQuickTest(input: z.input<typeof quickTestSchema>) {
  return quickTestFn({ data: input })
}
