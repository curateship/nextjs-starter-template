import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  DEFAULT_BACKTEST_COSTS,
  MAX_EXTRA_MARKETS,
  MAX_RUN_BARS,
  maxWindowDays,
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
import type { CreateBacktestInput } from "@/server/backtests"

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

/**
 * Candles the runner pre-loads before simStart so signals are warmed up.
 * 1500 (not 400): QQE's consolidation machine is path-dependent from its
 * first bar, and TradingView anchors it at the chart's full loaded history —
 * a deeper anchor converges zone edges (and thus filtered signals) to TV's.
 * Must stay equal to the chart fetch (CHART_WARMUP_CANDLES) so painted zones
 * and engine signals share an anchor.
 */
const SIGNAL_WARMUP_CANDLES = 1500

export type BacktestListItem = {
  id: string
  groupId: string
  name: string
  strategyType: StrategyType
  market: string
  network: string
  interval: string
  status: "pending" | "running" | "done" | "error"
  /** Triage workflow state (group-level). */
  reviewStatus: "review" | "archived"
  /** Pinned to the top of the run list (group-level). */
  pinned: boolean
  error: string | null
  startTime: string
  endTime: string
  startingEquity: number
  createdAt: string
  completedAt: string | null
  netPnl: number | null
  netPnlPct: number | null
  tradeCount: number | null
  maxDrawdownPct: number | null
  /** Fraction 0..1. */
  winRate: number | null
  sharpe: number | null
}

/** Per-user New Run seeds for one strategy: params plus run config. */
export type StrategyRunDefaults = {
  /** Optional display label for the main default (templates name themselves). */
  name?: string
  /** Default main market, and extra markets the run replays across. */
  market?: string
  extraMarkets?: string[]
  params: Record<string, string>
  interval?: BacktestInterval
  windowDays?: number
  equity?: number
  takerFeeBps?: number
  makerFeeBps?: number
  slippageBps?: number
  /** Optional blended fee %; when set it drives both maker + taker (baked into the bps). */
  feePct?: number
}

/** Per-user New Run seeds, keyed by strategy type. */
export type StrategyDefaultsMap = Partial<
  Record<StrategyType, StrategyRunDefaults>
>

/** A named run-config template — full config, same shape as the main default. */
export type StrategyTemplate = {
  id: string
  strategyType: StrategyType
  name: string
  config: StrategyRunDefaults
}

export type BacktestListResponse = {
  runs: BacktestListItem[]
  strategyDefaults: StrategyDefaultsMap
  templates: StrategyTemplate[]
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
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

/** Sibling run of the same group (one per market). */
export type BacktestGroupRun = {
  id: string
  market: string
  status: "pending" | "running" | "done" | "error"
  netPnlPct: number | null
}

export type BacktestDetailResponse = {
  backtest: BacktestDetail | null
  /** All runs in the loaded run's group, for the market switcher. */
  groupRuns: BacktestGroupRun[]
}

export type BacktestCandlesResponse = {
  candles: HistoryCandle[]
  simStartMs: number
}

const runBacktestSchema = z
  .object({
    name: z.string().max(255).optional(),
    /**
     * Re-run into an existing run group: markets already in the group are
     * replaced in place, new markets are added as new rows.
     */
    groupId: z.string().min(1).optional(),
    /** Main market — the workspace opens on this one's run. */
    market: z.string().min(1).max(20),
    /**
     * Additional markets: the same config is replayed on each (one row per
     * market). Runs are synchronous and sequential, so this is bounded to keep
     * a single request from pinning the server and hammering the upstream API.
     */
    extraMarkets: z.array(z.string().min(1).max(20)).max(MAX_EXTRA_MARKETS).optional(),
    interval: z.enum(CANDLE_INTERVALS),
    windowDays: z.number().int().min(1).max(MAX_RUN_BARS),
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
      (data.params.strategyType === "momentum" ||
        data.params.strategyType === "qqe") &&
      data.params.interval !== data.interval
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Backtest timeframe must match the strategy's signal interval.",
        path: ["interval"],
      })
    }
    const markets = [data.market, ...(data.extraMarkets ?? [])]
    if (data.params.strategyType === "grid" && markets.length > 1) {
      ctx.addIssue({
        code: "custom",
        message:
          "Grid bounds are absolute prices, so a grid config can't be replayed across markets.",
        path: ["extraMarkets"],
      })
    }
    if (new Set(markets).size !== markets.length) {
      ctx.addIssue({
        code: "custom",
        message: "Duplicate markets selected.",
        path: ["extraMarkets"],
      })
    }
    if (data.windowDays > maxWindowDays(data.interval)) {
      ctx.addIssue({
        code: "custom",
        message: `That window is too long for ${data.interval} candles — Hyperliquid serves at most ~${MAX_RUN_BARS} bars per interval (${maxWindowDays(data.interval)} days at ${data.interval}). Shorten the window or use a coarser timeframe.`,
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
      resetUserBacktest,
      finishUserBacktest,
      failUserBacktest,
      listGroupRuns,
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
        resetUserBacktest,
        finishUserBacktest,
        failUserBacktest,
        listGroupRuns,
      })
    } finally {
      inFlightRuns.delete(user.id)
    }
  })

type BacktestServer = Pick<
  typeof import("@/server/backtests"),
  | "createUserBacktest"
  | "resetUserBacktest"
  | "finishUserBacktest"
  | "failUserBacktest"
  | "listGroupRuns"
>

/** Domain errors safe to surface verbatim; anything else is genericized. */
function isKnownRunError(message: string): boolean {
  return (
    message.startsWith("No candle history") ||
    message.includes("can't be backtested")
  )
}

/** Maps a run failure to a user-safe message; upstream/internal text never leaks. */
function runFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    if (isKnownRunError(error.message)) return error.message
    if (error.message.includes("429") || error.message.includes("Too Many Requests")) {
      return "Hyperliquid rate-limited the candle download for this market. Wait a minute and re-run."
    }
  }
  return "Backtest failed — check the server logs."
}

/**
 * Runs one config across its market basket: one backtests row per market, all
 * sharing a groupId. With `groupId` set it re-runs into that existing group —
 * markets already in the group are replaced in place (same row id), new
 * markets are added. Returns the main (first) market's run id.
 */
async function executeRun(
  userId: string,
  data: z.infer<typeof runBacktestSchema>,
  server: BacktestServer
): Promise<{ backtestId: string }> {
  const {
    createUserBacktest,
    resetUserBacktest,
    finishUserBacktest,
    failUserBacktest,
    listGroupRuns,
  } = server

  const markets = [data.market, ...(data.extraMarkets ?? [])]

  // Re-run: map the group's existing rows by market so results replace.
  const existingByMarket = new Map<string, string>()
  if (data.groupId) {
    const siblings = await listGroupRuns(userId, data.groupId)
    if (siblings.length === 0) throw new Error("Run not found.")
    for (const sibling of siblings) {
      existingByMarket.set(sibling.market, sibling.id)
    }
  }
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - data.windowDays * 86_400_000)
  const name =
    data.name?.trim() ||
    `${data.params.strategyType} · ${markets.join(", ")} · ${data.interval}`
  const costs: BacktestCosts = {
    takerFeeBps: data.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps,
    makerFeeBps: data.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps,
    slippageBps: data.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps,
  }

  // The engine is pure — importing it server-side pulls no worker runtime.
  const { fetchCandleHistory } = await import("@/server/backtest/history")
  const { strategies } = await import("../../../worker/src/strategies/registry")
  const { runBacktest: runEngine } = await import(
    "../../../worker/src/backtest/runner"
  )

  const interval = data.interval
  const warmupBars =
    data.params.strategyType === "momentum" || data.params.strategyType === "qqe"
      ? SIGNAL_WARMUP_CANDLES
      : 0
  const simStartMs = startTime.getTime()
  const fetchStart = simStartMs - warmupBars * INTERVAL_MS[interval]

  let mainId: string | null = null
  let mainError: string | null = null
  for (const market of markets) {
    // Persist each row first so it appears in history even if its run throws.
    const input: CreateBacktestInput = {
      name,
      groupId: data.groupId ?? mainId ?? undefined,
      market,
      network: "mainnet",
      interval,
      params: data.params,
      riskParams: data.riskParams,
      costs,
      startTime,
      endTime,
      startingEquity: data.startingEquity,
    }
    const existingId = existingByMarket.get(market)
    const backtest = existingId
      ? await resetUserBacktest(userId, existingId, input)
      : await createUserBacktest(userId, input)
    mainId = mainId ?? backtest.id

    try {
      const candles = await fetchCandleHistory(
        market,
        interval,
        fetchStart,
        endTime.getTime()
      )
      if (candles.length === 0) {
        throw new Error(`No candle history for ${market} in that window.`)
      }
      const strategy = strategies[data.params.strategyType]
      if (!strategy) {
        throw new Error(
          `Strategy "${data.params.strategyType}" can't be backtested.`
        )
      }

      const result = runEngine({
        strategy,
        params: data.params,
        riskParams: data.riskParams,
        candles,
        simStartMs,
        startingEquity: data.startingEquity,
        market,
        interval,
        costs,
      })
      await finishUserBacktest(backtest.id, result)
    } catch (error) {
      // Don't leak upstream/internal error text to the stored row or client.
      console.error("backtest run failed", backtest.id, error)
      const message = runFailureMessage(error)
      await failUserBacktest(backtest.id, message)
      if (market === data.market) mainError = message
    }
  }

  // Extra-market failures show on their own rows; only the main market's
  // failure blocks opening the workspace.
  if (mainError) throw new Error(mainError)
  return { backtestId: mainId as string }
}

const loadBacktestsSchema = z.object({
  strategyType: z.enum(["grid", "dca", "momentum", "qqe", "copy"]).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

const loadBacktestsFn = createServerFn({ method: "GET" })
  .inputValidator(loadBacktestsSchema)
  .handler(async ({ data }): Promise<BacktestListResponse> => {
    const {
      listUserBacktests,
      getUserStrategyDefaults,
      listUserStrategyTemplates,
    } = await import("@/server/backtests")
    const user = await requireUser()
    const page = data.page ?? 1
    const pageSize = data.pageSize ?? 20
    const [list, strategyDefaults, templates] = await Promise.all([
      listUserBacktests(user.id, {
        strategyType: data.strategyType,
        page,
        pageSize: data.strategyType ? pageSize : 500,
      }),
      getUserStrategyDefaults(user.id),
      listUserStrategyTemplates(user.id),
    ])
    return {
      runs: list.rows.map(serializeListItem),
      strategyDefaults: strategyDefaults as StrategyDefaultsMap,
      templates: templates.map((row) => ({
        id: row.id,
        strategyType: row.strategyType as StrategyType,
        name: row.name,
        config: row.params as StrategyRunDefaults,
      })),
      pagination: data.strategyType
        ? {
            page,
            pageSize,
            total: list.totalGroups,
            totalPages: Math.max(1, Math.ceil(list.totalGroups / pageSize)),
          }
        : undefined,
    }
  })

const loadBacktestFn = createServerFn({ method: "POST" })
  .inputValidator(backtestIdSchema)
  .handler(async ({ data }): Promise<BacktestDetailResponse> => {
    const { getUserBacktest, listGroupRuns } = await import(
      "@/server/backtests"
    )
    const user = await requireUser()
    const row = await getUserBacktest(user.id, data.backtestId)
    if (!row) return { backtest: null, groupRuns: [] }
    const siblings = await listGroupRuns(user.id, row.groupId)
    return {
      backtest: serializeDetail(row),
      groupRuns: siblings.map((sibling) => ({
        id: sibling.id,
        market: sibling.market,
        status: sibling.status as BacktestGroupRun["status"],
        netPnlPct:
          sibling.netPnlPct === null ? null : Number(sibling.netPnlPct),
      })),
    }
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
const CHART_WARMUP_CANDLES = SIGNAL_WARMUP_CANDLES
/** Display cap so 1m × 90d configs stay renderable. */
const MAX_CHART_BARS = 5_000

const chartCandlesSchema = z.object({
  market: z.string().min(1).max(20),
  interval: z.enum(CANDLE_INTERVALS),
  windowDays: z.number().int().min(1).max(MAX_RUN_BARS),
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
      .array(z.enum(["grid", "dca", "momentum", "qqe", "copy"]))
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

const updateRunStatusSchema = z
  .object({
    groupIds: z.array(z.string().min(1)).min(1).max(500),
    reviewStatus: z.enum(["review", "archived"]).optional(),
    pinned: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reviewStatus === undefined && data.pinned === undefined) {
      ctx.addIssue({ code: "custom", message: "Nothing to update." })
    }
  })

const updateRunStatusFn = createServerFn({ method: "POST" })
  .inputValidator(updateRunStatusSchema)
  .handler(async ({ data }): Promise<{ updated: number }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { setUserBacktestStatus } = await import("@/server/backtests")
    requireAppOrigin()
    const user = await requireUser()
    const updated = await setUserBacktestStatus(user.id, data)
    return { updated }
  })

export function runBacktest(input: z.input<typeof runBacktestSchema>) {
  return runBacktestFn({ data: input })
}

export function deleteBacktests(input: z.input<typeof deleteBacktestsSchema>) {
  return deleteBacktestsFn({ data: input })
}

export function updateRunStatus(input: z.input<typeof updateRunStatusSchema>) {
  return updateRunStatusFn({ data: input })
}

/** Full run config (ParamValues seeds + run settings); shared by defaults + templates. */
const strategyConfigSchema = z.object({
  /** Optional display label for the main default. */
  name: z.string().max(80).optional(),
  /** Default markets seeded into New Run. */
  market: z.string().min(1).max(20).optional(),
  extraMarkets: z.array(z.string().min(1).max(20)).max(MAX_EXTRA_MARKETS).optional(),
  /** ParamValues form seeds; validated for shape, not runnability. */
  params: z
    .record(z.string().max(40), z.string().max(100))
    .refine((params) => Object.keys(params).length <= 60, "Too many parameters."),
  interval: z.enum(CANDLE_INTERVALS).optional(),
  windowDays: z.number().int().min(1).max(MAX_RUN_BARS).optional(),
  equity: z.number().positive().max(100_000_000).optional(),
  takerFeeBps: z.number().min(0).max(50).optional(),
  makerFeeBps: z.number().min(0).max(50).optional(),
  slippageBps: z.number().min(0).max(100).optional(),
  /** Blended fee % (0–0.5); a UI convenience that also sets taker+maker bps. */
  feePct: z.number().min(0).max(0.5).optional(),
})

const strategyTypeSchema = z.enum(["grid", "dca", "momentum", "qqe", "copy"])

const saveStrategyDefaultsSchema = z.object({
  strategyType: strategyTypeSchema,
  defaults: strategyConfigSchema,
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

const saveStrategyTemplateSchema = z.object({
  /** Present when updating an existing template; omitted to create a new one. */
  id: z.string().min(1).max(36).optional(),
  strategyType: strategyTypeSchema,
  name: z.string().trim().min(1).max(80),
  config: strategyConfigSchema,
})

const saveStrategyTemplateFn = createServerFn({ method: "POST" })
  .inputValidator(saveStrategyTemplateSchema)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { saveUserStrategyTemplate } = await import("@/server/backtests")
    requireAppOrigin()
    const user = await requireUser()
    return saveUserStrategyTemplate(user.id, {
      id: data.id,
      strategyType: data.strategyType,
      name: data.name,
      params: data.config,
    })
  })

export function saveStrategyTemplate(
  input: z.input<typeof saveStrategyTemplateSchema>
) {
  return saveStrategyTemplateFn({ data: input })
}

const deleteStrategyTemplateSchema = z.object({ id: z.string().min(1).max(36) })

const deleteStrategyTemplateFn = createServerFn({ method: "POST" })
  .inputValidator(deleteStrategyTemplateSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { deleteUserStrategyTemplate } = await import("@/server/backtests")
    requireAppOrigin()
    const user = await requireUser()
    await deleteUserStrategyTemplate(user.id, data.id)
    return { ok: true }
  })

export function deleteStrategyTemplate(id: string) {
  return deleteStrategyTemplateFn({ data: { id } })
}

/** Templates + per-strategy defaults only — the New Bot dialog's light load. */
const loadStrategyTemplatesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    strategyDefaults: StrategyDefaultsMap
    templates: StrategyTemplate[]
  }> => {
    const { getUserStrategyDefaults, listUserStrategyTemplates } = await import(
      "@/server/backtests"
    )
    const user = await requireUser()
    const [strategyDefaults, templates] = await Promise.all([
      getUserStrategyDefaults(user.id),
      listUserStrategyTemplates(user.id),
    ])
    return {
      strategyDefaults: strategyDefaults as StrategyDefaultsMap,
      templates: templates.map((row) => ({
        id: row.id,
        strategyType: row.strategyType as StrategyType,
        name: row.name,
        config: row.params as StrategyRunDefaults,
      })),
    }
  }
)

export function loadStrategyTemplates() {
  return loadStrategyTemplatesFn()
}

export function loadBacktests(input: z.input<typeof loadBacktestsSchema> = {}) {
  return loadBacktestsFn({ data: input })
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
  reviewStatus: string
  pinned: boolean
  error: string | null
  startTime: Date
  endTime: Date
  startingEquity: string
  createdAt: Date
  completedAt: Date | null
  netPnl: string | null
  netPnlPct: string | null
  tradeCount: string | null
  maxDrawdownPct: string | null
  winRate: string | null
  sharpe: string | null
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
    reviewStatus: row.reviewStatus as BacktestListItem["reviewStatus"],
    pinned: row.pinned,
    error: row.error,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    startingEquity: Number(row.startingEquity),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    netPnl: row.netPnl === null ? null : Number(row.netPnl),
    netPnlPct: row.netPnlPct === null ? null : Number(row.netPnlPct),
    tradeCount: row.tradeCount === null ? null : Number(row.tradeCount),
    maxDrawdownPct:
      row.maxDrawdownPct === null ? null : Number(row.maxDrawdownPct),
    winRate: row.winRate === null ? null : Number(row.winRate),
    sharpe: row.sharpe === null ? null : Number(row.sharpe),
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
