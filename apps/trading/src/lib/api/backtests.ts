import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  DEFAULT_BACKTEST_COSTS,
  type BacktestCosts,
  type BacktestResult,
} from "@/lib/backtest/types"
import {
  riskParamsSchema,
  strategyParamsSchema,
  type RiskParams,
  type StrategyParams,
  type StrategyType,
} from "@/lib/strategies/params"
// Type-only — erased at build, so the node-only history module never reaches
// the client bundle.
import type { HistoryCandle } from "@/server/backtest/history"

const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const
type BacktestInterval = (typeof CANDLE_INTERVALS)[number]

/** Isomorphic copy so the validator has no node dependency. */
const INTERVAL_MS: Record<BacktestInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/** Candles the runner pre-loads before simStart so signals are warmed up. */
const MOMENTUM_WARMUP_CANDLES = 400
/** Guards result size and run time; also enforced by the history fetch cap. */
const MAX_BARS = 10_000

export type BacktestListItem = {
  id: string
  groupId: string
  name: string
  strategyType: StrategyType
  market: string
  network: string
  interval: string
  status: "pending" | "running" | "done" | "error"
  error: string | null
  startTime: string
  endTime: string
  startingEquity: number
  createdAt: string
  completedAt: string | null
  netPnl: number | null
  netPnlPct: number | null
  tradeCount: number | null
}

/** Per-user New Run seeds for one strategy: params plus run config. */
export type StrategyRunDefaults = {
  params: Record<string, string>
  interval?: BacktestInterval
  windowDays?: number
  equity?: number
  takerFeeBps?: number
  makerFeeBps?: number
  slippageBps?: number
}

/** Per-user New Run seeds, keyed by strategy type. */
export type StrategyDefaultsMap = Partial<
  Record<StrategyType, StrategyRunDefaults>
>

export type BacktestListResponse = {
  runs: BacktestListItem[]
  strategyDefaults: StrategyDefaultsMap
}

export type BacktestDetail = {
  id: string
  groupId: string
  name: string
  strategyType: StrategyType
  market: string
  network: string
  interval: string
  status: "pending" | "running" | "done" | "error"
  error: string | null
  startTime: string
  endTime: string
  startingEquity: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  params: StrategyParams
  riskParams: RiskParams
  costs: BacktestCosts
  result: BacktestResult | null
}

export type BacktestDetailResponse = {
  backtest: BacktestDetail | null
}

export type BacktestCandlesResponse = {
  candles: HistoryCandle[]
  simStartMs: number
}

const runBacktestSchema = z
  .object({
    name: z.string().max(255).optional(),
    /** Re-run of an existing backtest: joins its group and reuses its name. */
    rerunOf: z.string().min(1).optional(),
    market: z.string().min(1).max(20),
    interval: z.enum(CANDLE_INTERVALS),
    windowDays: z.number().int().min(1).max(90),
    startingEquity: z.number().positive().max(100_000_000),
    takerFeeBps: z.number().min(0).max(50).optional(),
    makerFeeBps: z.number().min(0).max(50).optional(),
    slippageBps: z.number().min(0).max(100).optional(),
    params: strategyParamsSchema,
    riskParams: riskParamsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.params.strategyType === "copy") {
      ctx.addIssue({
        code: "custom",
        message:
          "Copy trading can't be backtested yet — it needs historical event replay.",
        path: ["params"],
      })
    }
    if (
      data.params.strategyType === "momentum" &&
      data.params.interval !== data.interval
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Backtest timeframe must match the momentum signal interval.",
        path: ["interval"],
      })
    }
    const bars = (data.windowDays * 86_400_000) / INTERVAL_MS[data.interval]
    if (bars > MAX_BARS) {
      ctx.addIssue({
        code: "custom",
        message:
          "That window is too long for this timeframe (over 10,000 bars). Shorten the window or use a coarser timeframe.",
        path: ["windowDays"],
      })
    }
  })

const backtestIdSchema = z.object({ backtestId: z.string().min(1) })

/**
 * One backtest per user at a time: each run does upstream candle fetches plus
 * a CPU-bound engine pass inside the request, so unbounded parallel calls
 * would hog the server and amplify traffic to Hyperliquid.
 */
const inFlightRuns = new Set<string>()

const runBacktestFn = createServerFn({ method: "POST" })
  .inputValidator(runBacktestSchema)
  .handler(async ({ data }): Promise<{ backtestId: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const {
      createUserBacktest,
      finishUserBacktest,
      failUserBacktest,
      getUserBacktest,
    } = await import("@/server/backtests")
    requireAppOrigin()
    const user = await requireUser()

    if (inFlightRuns.has(user.id)) {
      throw new Error("A backtest is already running — wait for it to finish.")
    }
    inFlightRuns.add(user.id)
    try {
      return await executeRun(user.id, data, {
        createUserBacktest,
        finishUserBacktest,
        failUserBacktest,
        getUserBacktest,
      })
    } finally {
      inFlightRuns.delete(user.id)
    }
  })

type BacktestServer = Pick<
  typeof import("@/server/backtests"),
  | "createUserBacktest"
  | "finishUserBacktest"
  | "failUserBacktest"
  | "getUserBacktest"
>

/** Domain errors safe to surface verbatim; anything else is genericized. */
function isKnownRunError(message: string): boolean {
  return (
    message === "Backtest not found" ||
    message.startsWith("No candle history") ||
    message.includes("can't be backtested")
  )
}

async function executeRun(
  userId: string,
  data: z.infer<typeof runBacktestSchema>,
  server: BacktestServer
): Promise<{ backtestId: string }> {
  const {
    createUserBacktest,
    finishUserBacktest,
    failUserBacktest,
    getUserBacktest,
  } = server

  // Re-runs join the original run's group and keep its name.
  const original = data.rerunOf
    ? await getUserBacktest(userId, data.rerunOf)
    : null
  if (data.rerunOf && !original) throw new Error("Backtest not found")

  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - data.windowDays * 86_400_000)
  const name =
    original?.name ||
    data.name?.trim() ||
    `${data.params.strategyType} · ${data.market} · ${data.interval}`
  const costs: BacktestCosts = {
    takerFeeBps: data.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps,
    makerFeeBps: data.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps,
    slippageBps: data.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps,
  }

  // Persist the run first so it appears in history even if the engine throws.
  const backtest = await createUserBacktest(userId, {
    name,
    groupId: original?.groupId,
    market: data.market,
    network: "mainnet",
    interval: data.interval,
    params: data.params,
    riskParams: data.riskParams,
    costs,
    startTime,
    endTime,
    startingEquity: data.startingEquity,
  })

  try {
    // A backtest is a fast deterministic computation, so we run it inline
    // here (no worker/queue). The engine is pure — importing it server-side
    // pulls no worker-only runtime.
    const { fetchCandleHistory } = await import("@/server/backtest/history")
    const { strategies } = await import(
      "../../../worker/src/strategies/registry"
    )
    const { runBacktest: runEngine } = await import(
      "../../../worker/src/backtest/runner"
    )

    const interval = data.interval
    const warmupBars =
      data.params.strategyType === "momentum" ? MOMENTUM_WARMUP_CANDLES : 0
    const simStartMs = startTime.getTime()
    const fetchStart = simStartMs - warmupBars * INTERVAL_MS[interval]
    const candles = await fetchCandleHistory(
      data.market,
      interval,
      fetchStart,
      endTime.getTime()
    )
    if (candles.length === 0) {
      throw new Error("No candle history for that market and window.")
    }
    const strategy = strategies[data.params.strategyType]
    if (!strategy) {
      throw new Error(`Strategy "${data.params.strategyType}" can't be backtested.`)
    }

    const result = runEngine({
      strategy,
      params: data.params,
      riskParams: data.riskParams,
      candles,
      simStartMs,
      startingEquity: data.startingEquity,
      market: data.market,
      interval,
      costs,
    })
    await finishUserBacktest(backtest.id, result)
  } catch (error) {
    // Don't leak upstream/internal error text to the stored row or client.
    console.error("backtest run failed", backtest.id, error)
    const message =
      error instanceof Error && isKnownRunError(error.message)
        ? error.message
        : "Backtest failed — check the server logs."
    await failUserBacktest(backtest.id, message)
    throw new Error(message)
  }

  return { backtestId: backtest.id }
}

const loadBacktestsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BacktestListResponse> => {
    const { listUserBacktests, getUserStrategyDefaults } = await import(
      "@/server/backtests"
    )
    const user = await requireUser()
    const [rows, strategyDefaults] = await Promise.all([
      listUserBacktests(user.id),
      getUserStrategyDefaults(user.id),
    ])
    return {
      runs: rows.map(serializeListItem),
      strategyDefaults: strategyDefaults as StrategyDefaultsMap,
    }
  }
)

const loadBacktestFn = createServerFn({ method: "POST" })
  .inputValidator(backtestIdSchema)
  .handler(async ({ data }): Promise<BacktestDetailResponse> => {
    const { getUserBacktest } = await import("@/server/backtests")
    const user = await requireUser()
    const row = await getUserBacktest(user.id, data.backtestId)
    return { backtest: row ? serializeDetail(row) : null }
  })

const loadBacktestCandlesFn = createServerFn({ method: "POST" })
  .inputValidator(backtestIdSchema)
  .handler(async ({ data }): Promise<BacktestCandlesResponse> => {
    const { getUserBacktest } = await import("@/server/backtests")
    const { fetchCandleHistory } = await import("@/server/backtest/history")
    const user = await requireUser()
    const row = await getUserBacktest(user.id, data.backtestId)
    if (!row) throw new Error("Backtest not found")

    const interval = row.interval as BacktestInterval
    const simStartMs = row.startTime.getTime()
    const fetchStart = simStartMs - CHART_WARMUP_CANDLES * INTERVAL_MS[interval]

    const candles = await fetchCandleHistory(
      row.market,
      interval,
      fetchStart,
      row.endTime.getTime()
    )
    return { candles, simStartMs }
  })

/** Extra history before the window so indicator overlays have warmup. */
const CHART_WARMUP_CANDLES = MOMENTUM_WARMUP_CANDLES
/** Display cap so 1m × 90d configs stay renderable. */
const MAX_CHART_BARS = 5_000

const chartCandlesSchema = z.object({
  market: z.string().min(1).max(20),
  interval: z.enum(CANDLE_INTERVALS),
  windowDays: z.number().int().min(1).max(90),
})

/** Config-mode candles: the window the user is browsing, ending now. */
const loadChartCandlesFn = createServerFn({ method: "POST" })
  .inputValidator(chartCandlesSchema)
  .handler(async ({ data }): Promise<BacktestCandlesResponse> => {
    const { fetchCandleHistory } = await import("@/server/backtest/history")
    await requireUser()

    const stepMs = INTERVAL_MS[data.interval]
    const endMs = Date.now()
    const windowStart = endMs - data.windowDays * 86_400_000
    const simStartMs = Math.max(windowStart, endMs - MAX_CHART_BARS * stepMs)

    const candles = await fetchCandleHistory(
      data.market,
      data.interval,
      simStartMs - CHART_WARMUP_CANDLES * stepMs,
      endMs
    )
    return { candles, simStartMs }
  })

const deleteBacktestsSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(500).optional(),
    groupIds: z.array(z.string().min(1)).max(500).optional(),
    strategyTypes: z
      .array(z.enum(["grid", "dca", "momentum", "copy"]))
      .max(4)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.ids?.length && !data.groupIds?.length && !data.strategyTypes?.length) {
      ctx.addIssue({ code: "custom", message: "Nothing selected to delete." })
    }
  })

const deleteBacktestsFn = createServerFn({ method: "POST" })
  .inputValidator(deleteBacktestsSchema)
  .handler(async ({ data }): Promise<{ deleted: number }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { deleteUserBacktests } = await import("@/server/backtests")
    requireAppOrigin()
    const user = await requireUser()
    const deleted = await deleteUserBacktests(user.id, data)
    return { deleted }
  })

export function runBacktest(input: z.input<typeof runBacktestSchema>) {
  return runBacktestFn({ data: input })
}

export function deleteBacktests(input: z.input<typeof deleteBacktestsSchema>) {
  return deleteBacktestsFn({ data: input })
}

const saveStrategyDefaultsSchema = z.object({
  strategyType: z.enum(["grid", "dca", "momentum", "copy"]),
  defaults: z.object({
    /** ParamValues form seeds; validated for shape, not runnability. */
    params: z
      .record(z.string().max(40), z.string().max(100))
      .refine(
        (params) => Object.keys(params).length <= 60,
        "Too many parameters."
      ),
    interval: z.enum(CANDLE_INTERVALS).optional(),
    windowDays: z.number().int().min(1).max(90).optional(),
    equity: z.number().positive().max(100_000_000).optional(),
    takerFeeBps: z.number().min(0).max(50).optional(),
    makerFeeBps: z.number().min(0).max(50).optional(),
    slippageBps: z.number().min(0).max(100).optional(),
  }),
})

const saveStrategyDefaultsFn = createServerFn({ method: "POST" })
  .inputValidator(saveStrategyDefaultsSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { saveUserStrategyDefaults } = await import("@/server/backtests")
    requireAppOrigin()
    const user = await requireUser()
    await saveUserStrategyDefaults(user.id, data.strategyType, data.defaults)
    return { ok: true }
  })

export function saveStrategyDefaults(
  input: z.input<typeof saveStrategyDefaultsSchema>
) {
  return saveStrategyDefaultsFn({ data: input })
}

export function loadBacktests() {
  return loadBacktestsFn()
}

export function loadBacktest(backtestId: string) {
  return loadBacktestFn({ data: { backtestId } })
}

export function loadBacktestCandles(backtestId: string) {
  return loadBacktestCandlesFn({ data: { backtestId } })
}

export function loadChartCandles(input: z.input<typeof chartCandlesSchema>) {
  return loadChartCandlesFn({ data: input })
}

type ListRow = {
  id: string
  groupId: string
  name: string
  strategyType: string
  market: string
  network: string
  interval: string
  status: string
  error: string | null
  startTime: Date
  endTime: Date
  startingEquity: string
  createdAt: Date
  completedAt: Date | null
  netPnl: string | null
  netPnlPct: string | null
  tradeCount: string | null
}

function serializeListItem(row: ListRow): BacktestListItem {
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    strategyType: row.strategyType as StrategyType,
    market: row.market,
    network: row.network,
    interval: row.interval,
    status: row.status as BacktestListItem["status"],
    error: row.error,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    startingEquity: Number(row.startingEquity),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    netPnl: row.netPnl === null ? null : Number(row.netPnl),
    netPnlPct: row.netPnlPct === null ? null : Number(row.netPnlPct),
    tradeCount: row.tradeCount === null ? null : Number(row.tradeCount),
  }
}

type DetailRow = {
  id: string
  groupId: string
  name: string
  strategyType: string
  market: string
  network: string
  interval: string
  status: string
  error: string | null
  startTime: Date
  endTime: Date
  startingEquity: string
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  params: unknown
  riskParams: unknown
  costs: unknown
  result: unknown
}

function serializeDetail(row: DetailRow): BacktestDetail {
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    strategyType: row.strategyType as StrategyType,
    market: row.market,
    network: row.network,
    interval: row.interval,
    status: row.status as BacktestDetail["status"],
    error: row.error,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    startingEquity: Number(row.startingEquity),
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    params: row.params as StrategyParams,
    riskParams: row.riskParams as RiskParams,
    costs: row.costs as BacktestCosts,
    result: (row.result as BacktestResult | null) ?? null,
  }
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Custom Shell session")
  return user
}
