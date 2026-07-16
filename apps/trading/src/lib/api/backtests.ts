import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  MAX_BACKTEST_BARS,
  MAX_EXTRA_MARKETS,
  MAX_RUN_BARS,
  MAX_TOTAL_RUN_BARS,
  maxWindowDays,
  totalRunBars,
  SIGNAL_WARMUP_CANDLES,
  warmupBarsFor,
  type BacktestCosts,
  type BacktestResult,
  type GroupCombinedCurve,
  type GroupPortfolioMetrics,
} from "@/lib/backtest/types"
import {
  automationCapabilities,
  automationConfigSchema,
  LIVE_BOOK_BACKTEST_UNAVAILABLE,
  normalizeAutomationConfig,
  automationTypeIdSchema,
  type AutomationConfig,
  type AutomationTypeId,
} from "@/lib/strategies/strategy-config"
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

export type BacktestListItem = {
  id: string
  groupId: string
  name: string
  /** The run's strategy identity: its indicator (registry id) or "automation". */
  indicatorType: AutomationTypeId
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
  progress: number
  progressStage: string | null
  netPnl: number | null
  netPnlPct: number | null
  tradeCount: number | null
  maxDrawdownPct: number | null
  /** Fraction 0..1. */
  winRate: number | null
  sharpe: number | null
  /** Days from the first order opened to the last order closed. */
  tradingDays: number | null
}

export type BacktestListResponse = {
  runs: BacktestListItem[]
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export type BacktestProgressItem = Pick<
  BacktestListItem,
  | "id"
  | "status"
  | "error"
  | "completedAt"
  | "progress"
  | "progressStage"
  | "netPnl"
  | "netPnlPct"
  | "tradeCount"
  | "maxDrawdownPct"
  | "winRate"
  | "sharpe"
  | "tradingDays"
>

export type BacktestDetail = {
  id: string
  groupId: string
  automationId: string | null
  name: string
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
  progress: number
  progressStage: string | null
  params: AutomationConfig
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
     * The only run source. Everything else about the run — interval, compiled
     * strategy, fees, starting capital — is read server-side from the saved
     * Automation, so the client can't send a config that differs from it.
     */
    automationId: z.string().uuid(),
    /** Main market — the workspace opens on this one's run. */
    market: z.string().min(1).max(20),
    /**
     * Additional markets: the same config is replayed on each (one row per
     * market). This limit bounds a run group's total history and engine cost.
     */
    extraMarkets: z
      .array(z.string().min(1).max(20))
      .max(MAX_EXTRA_MARKETS)
      .optional(),
    windowDays: z.number().int().min(1).max(MAX_RUN_BARS),
  })
  .superRefine((data, ctx) => {
    const markets = [data.market, ...(data.extraMarkets ?? [])]
    if (new Set(markets).size !== markets.length) {
      ctx.addIssue({
        code: "custom",
        message: "Duplicate markets selected.",
        path: ["extraMarkets"],
      })
    }
  })

const backtestIdSchema = z.object({ backtestId: z.string().min(1) })

export type ResolvedAutomationRun = {
  automationId: string
  automationName: string
  interval: BacktestInterval
  params: AutomationConfig
  costs: BacktestCosts
  startingEquity: number
}

/**
 * Resolves everything a run needs from the saved Automation at the trusted
 * server boundary: the compiled config plus the automation's own backtest
 * settings (fees + starting capital).
 */
export async function resolveAutomationRun(
  userId: string,
  automationId: string
): Promise<ResolvedAutomationRun> {
  const { getUserAutomation, inspectAutomation } =
    await import("@/server/automations")
  const source = await getUserAutomation(userId, automationId)
  if (!source) throw new Error("Automation not found")
  const compiled = automationConfigSchema.safeParse(source.compiledConfig)
  if (!compiled.success) {
    throw new Error("Fix this Automation before running a backtest.")
  }
  if (!automationCapabilities(compiled.data).supportsHistoricalBacktest) {
    throw new Error(LIVE_BOOK_BACKTEST_UNAVAILABLE)
  }
  const inspected = inspectAutomation(source)
  return {
    automationId: source.id,
    automationName: source.name,
    interval: compiled.data.interval,
    params: compiled.data,
    costs: {
      takerFeeBps: inspected.backtest.takerFeeBps,
      makerFeeBps: inspected.backtest.makerFeeBps,
      slippageBps: inspected.backtest.slippageBps,
    },
    startingEquity: inspected.backtest.startingEquity,
  }
}

const runBacktestFn = createServerFn({ method: "POST" })
  .inputValidator(runBacktestSchema)
  .handler(async ({ data }): Promise<{ backtestId: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { createUserBacktestGroup } = await import("@/server/backtests")
    requireAppOrigin()
    const user = await requireUser()
    const run = await resolveAutomationRun(user.id, data.automationId)

    // The window limits depend on the automation's interval, so they're
    // checked here rather than in the schema.
    const markets = [data.market, ...(data.extraMarkets ?? [])]
    if (data.windowDays > maxWindowDays(run.interval)) {
      throw new Error(
        `That window is too long for ${run.interval} candles — a run covers at most ${maxWindowDays(run.interval)} days at ${run.interval}. Shorten the window or use a coarser timeframe.`
      )
    }
    const totalBars = totalRunBars(
      run.params,
      run.interval,
      data.windowDays,
      markets.length
    )
    if (totalBars > MAX_TOTAL_RUN_BARS) {
      throw new Error(
        `This run would pull ~${totalBars.toLocaleString()} candles including required history across ${markets.length} market(s), over the ${MAX_TOTAL_RUN_BARS.toLocaleString()} per-run limit. Use fewer markets, a shorter window, or a coarser timeframe.`
      )
    }

    // Enqueue markets as one atomic pending group and return immediately. The
    // worker loads their history in the background; QFL replays the group on
    // one shared clock and account.
    const result = await enqueueRun(user.id, data, run, {
      createUserBacktestGroup,
    })
    return result
  })

type BacktestEnqueueServer = Pick<
  typeof import("@/server/backtests"),
  "createUserBacktestGroup"
>

/**
 * Queues the run across its market basket as `pending` rows (the background
 * queue fills in results). One row per market, all sharing the first market's
 * row id as groupId. Returns the run id to open.
 */
async function enqueueRun(
  userId: string,
  data: z.infer<typeof runBacktestSchema>,
  run: ResolvedAutomationRun,
  server: BacktestEnqueueServer
): Promise<{ backtestId: string }> {
  const { createUserBacktestGroup } = server

  const markets = [data.market, ...(data.extraMarkets ?? [])]
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - data.windowDays * 86_400_000)
  const name =
    data.name?.trim() ||
    `${run.automationName} · ${markets.join(", ")} · ${run.interval}`
  const group = await createUserBacktestGroup(
    userId,
    markets.map((market) =>
      buildRunInput({
        name,
        groupId: undefined,
        market,
        run,
        startTime,
        endTime,
      })
    )
  )
  return { backtestId: group.groupId }
}

/** Assembles a CreateBacktestInput from a run's shared config + one market's window. */
function buildRunInput(args: {
  name: string
  groupId: string | undefined
  market: string
  run: ResolvedAutomationRun
  startTime: Date
  endTime: Date
}): CreateBacktestInput {
  const { name, groupId, market, run, startTime, endTime } = args
  return {
    name,
    groupId,
    automationId: run.automationId,
    market,
    network: "mainnet",
    interval: run.interval,
    params: run.params,
    costs: run.costs,
    startTime,
    endTime,
    startingEquity: run.startingEquity,
  }
}

const loadBacktestsSchema = z.object({
  indicatorType: automationTypeIdSchema.optional(),
  /** Restrict to one run group — the group page needs nothing else. */
  groupId: z.string().min(1).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

const loadBacktestsFn = createServerFn({ method: "GET" })
  .inputValidator(loadBacktestsSchema)
  .handler(async ({ data }): Promise<BacktestListResponse> => {
    const { listUserBacktests } = await import("@/server/backtests")
    const user = await requireUser()
    const page = data.page ?? 1
    const pageSize = data.pageSize ?? 20
    const list = await listUserBacktests(user.id, {
      indicatorType: data.indicatorType,
      groupId: data.groupId,
      page,
      pageSize: data.indicatorType ? pageSize : 500,
    })
    return {
      runs: list.rows.map(serializeListItem),
      pagination: data.indicatorType
        ? {
            page,
            pageSize,
            total: list.totalGroups,
            totalPages: Math.max(1, Math.ceil(list.totalGroups / pageSize)),
          }
        : undefined,
    }
  })

const loadBacktestOverviewFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<
    BacktestListResponse & {
      groupMetrics: Record<string, GroupPortfolioMetrics>
    }
  > => {
    const { listUserBacktests } = await import("@/server/backtests")
    const { loadGroupPortfolioMetrics } =
      await import("@/server/backtest/portfolio-metrics")
    const user = await requireUser()
    const list = await listUserBacktests(user.id, { page: 1, pageSize: 500 })
    const runs = list.rows.map(serializeListItem)
    const groupIds = [...new Set(runs.map((run) => run.groupId))].slice(0, 100)
    return {
      runs,
      groupMetrics: await loadGroupPortfolioMetrics(user.id, groupIds),
    }
  }
)

const groupSummarySchema = z.object({ groupId: z.string().min(1) })

const loadBacktestGroupSummaryFn = createServerFn({ method: "GET" })
  .inputValidator(groupSummarySchema)
  .handler(
    async ({
      data,
    }): Promise<
      BacktestListResponse & {
        groupMetrics: Record<string, GroupPortfolioMetrics>
        groupCurve: GroupCombinedCurve | null
      }
    > => {
      const { listUserBacktests } = await import("@/server/backtests")
      const { loadGroupPortfolioSummary } =
        await import("@/server/backtest/portfolio-metrics")
      const user = await requireUser()
      const [list, portfolio] = await Promise.all([
        listUserBacktests(user.id, { groupId: data.groupId }),
        loadGroupPortfolioSummary(user.id, data.groupId),
      ])
      return {
        runs: list.rows.map(serializeListItem),
        groupMetrics: portfolio.metrics
          ? { [data.groupId]: portfolio.metrics }
          : {},
        groupCurve: portfolio.curve,
      }
    }
  )

const backtestProgressSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
})

const pollBacktestProgressFn = createServerFn({ method: "GET" })
  .inputValidator(backtestProgressSchema)
  .handler(async ({ data }): Promise<BacktestProgressItem[]> => {
    const { and, eq, inArray, sql } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { tradingBacktests } = await import("@/server/schema")
    const user = await requireUser()
    const rows = await db
      .select({
        id: tradingBacktests.id,
        status: tradingBacktests.status,
        error: tradingBacktests.error,
        completedAt: tradingBacktests.completedAt,
        progress: tradingBacktests.progress,
        progressStage: tradingBacktests.progressStage,
        netPnl: sql<
          string | null
        >`(${tradingBacktests.resultStats} ->> 'netPnl')`,
        netPnlPct: sql<
          string | null
        >`(${tradingBacktests.resultStats} ->> 'netPnlPct')`,
        tradeCount: sql<
          string | null
        >`(${tradingBacktests.resultStats} #>> '{all,trades}')`,
        maxDrawdownPct: sql<
          string | null
        >`(${tradingBacktests.resultStats} ->> 'maxDrawdownPct')`,
        winRate: sql<
          string | null
        >`(${tradingBacktests.resultStats} #>> '{all,winRate}')`,
        sharpe: sql<
          string | null
        >`(${tradingBacktests.resultStats} #>> '{all,sharpe}')`,
        firstEntryMs: sql<
          string | null
        >`(${tradingBacktests.resultStats} ->> 'firstEntryMs')`,
        lastExitMs: sql<
          string | null
        >`(${tradingBacktests.resultStats} ->> 'lastExitMs')`,
      })
      .from(tradingBacktests)
      .where(
        and(
          eq(tradingBacktests.userId, user.id),
          inArray(tradingBacktests.id, data.ids)
        )
      )
    return rows.map(serializeProgressItem)
  })

const loadBacktestFn = createServerFn({ method: "POST" })
  .inputValidator(backtestIdSchema)
  .handler(async ({ data }): Promise<BacktestDetailResponse> => {
    const { getUserBacktest, listGroupRuns } =
      await import("@/server/backtests")
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

/** Run candles, optionally re-sampled at a chosen display interval. */
const backtestCandlesSchema = z.object({
  backtestId: z.string().min(1),
  /** Display timeframe; defaults to the run's own interval. */
  interval: z.enum(CANDLE_INTERVALS).optional(),
  /**
   * Visible window (ms) to load, for progressive loading. Absent = the whole
   * run. The loader always adds the strategy's warmup runway behind `fromMs` so
   * overlays paint accurately even when only a slice is shown.
   */
  fromMs: z.number().int().positive().optional(),
  toMs: z.number().int().positive().optional(),
})

const loadBacktestCandlesFn = createServerFn({ method: "POST" })
  .inputValidator(backtestCandlesSchema)
  .handler(async ({ data }): Promise<BacktestCandlesResponse> => {
    const { getUserBacktest } = await import("@/server/backtests")
    const { fetchCandleHistory } = await import("@/server/backtest/history")
    const user = await requireUser()
    const row = await getUserBacktest(user.id, data.backtestId)
    if (!row) throw new Error("Backtest not found")

    const interval = (data.interval ?? row.interval) as BacktestInterval
    const stepMs = INTERVAL_MS[interval]
    const runStartMs = row.startTime.getTime()
    const runEndMs = row.endTime.getTime()

    // The window the client wants shown; both ends stay inside the run.
    const toMs = Math.min(data.toMs ?? runEndMs, runEndMs)
    const visibleStartMs = Math.min(
      Math.max(data.fromMs ?? runStartMs, runStartMs),
      runEndMs
    )

    // Fetch a warmup runway behind the visible start so signal overlays (QQE
    // zones etc.) are correct for what's shown. Cap the total span so a fine
    // display interval can't overflow the render ceiling.
    const warmupMs = warmupBarsFor(row.params) * stepMs
    let fetchStart = visibleStartMs - warmupMs
    const maxSpanMs = MAX_CHART_BARS * stepMs
    if (toMs - fetchStart > maxSpanMs) fetchStart = toMs - maxSpanMs

    const candles = await fetchCandleHistory(
      row.market,
      interval,
      fetchStart,
      toMs
    )
    return { candles, simStartMs: visibleStartMs }
  })

/** Extra history before the window so indicator overlays have warmup. */
const CHART_WARMUP_CANDLES = SIGNAL_WARMUP_CANDLES
/** Display cap for config-browse candles; matches the backtest window ceiling. */
const MAX_CHART_BARS = MAX_BACKTEST_BARS

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
    indicatorTypes: z.array(automationTypeIdSchema).max(9).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      !data.ids?.length &&
      !data.groupIds?.length &&
      !data.indicatorTypes?.length
    ) {
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

export function loadBacktests(input: z.input<typeof loadBacktestsSchema> = {}) {
  return loadBacktestsFn({ data: input })
}

export function loadBacktestOverview() {
  return loadBacktestOverviewFn()
}

export function loadBacktestGroupSummary(groupId: string) {
  return loadBacktestGroupSummaryFn({ data: { groupId } })
}

export function pollBacktestProgress(ids: string[]) {
  return pollBacktestProgressFn({ data: { ids } })
}

export function loadBacktest(backtestId: string) {
  return loadBacktestFn({ data: { backtestId } })
}

export function loadBacktestCandles(
  backtestId: string,
  interval?: BacktestInterval,
  range?: { fromMs?: number; toMs?: number }
) {
  return loadBacktestCandlesFn({
    data: { backtestId, interval, fromMs: range?.fromMs, toMs: range?.toMs },
  })
}

export function loadChartCandles(input: z.input<typeof chartCandlesSchema>) {
  return loadChartCandlesFn({ data: input })
}

type ListRow = {
  id: string
  groupId: string
  name: string
  indicatorType: string | null
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
  progress: number
  progressStage: string | null
  netPnl: string | null
  netPnlPct: string | null
  tradeCount: string | null
  maxDrawdownPct: string | null
  winRate: string | null
  sharpe: string | null
  firstEntryMs: string | null
  lastExitMs: string | null
}

function serializeListItem(row: ListRow): BacktestListItem {
  const firstEntry = row.firstEntryMs === null ? null : Number(row.firstEntryMs)
  const lastExit = row.lastExitMs === null ? null : Number(row.lastExitMs)
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    indicatorType: row.indicatorType as AutomationTypeId,
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
    progress: row.progress,
    progressStage: row.progressStage,
    netPnl: row.netPnl === null ? null : Number(row.netPnl),
    netPnlPct: row.netPnlPct === null ? null : Number(row.netPnlPct),
    tradeCount: row.tradeCount === null ? null : Number(row.tradeCount),
    maxDrawdownPct:
      row.maxDrawdownPct === null ? null : Number(row.maxDrawdownPct),
    winRate: row.winRate === null ? null : Number(row.winRate),
    sharpe: row.sharpe === null ? null : Number(row.sharpe),
    // Active trading span: first order opened → last order closed.
    tradingDays:
      firstEntry !== null && lastExit !== null
        ? Math.round((lastExit - firstEntry) / 86_400_000)
        : null,
  }
}

function serializeProgressItem(row: {
  id: string
  status: string
  error: string | null
  completedAt: Date | null
  progress: number
  progressStage: string | null
  netPnl: string | null
  netPnlPct: string | null
  tradeCount: string | null
  maxDrawdownPct: string | null
  winRate: string | null
  sharpe: string | null
  firstEntryMs: string | null
  lastExitMs: string | null
}): BacktestProgressItem {
  const firstEntry = row.firstEntryMs === null ? null : Number(row.firstEntryMs)
  const lastExit = row.lastExitMs === null ? null : Number(row.lastExitMs)
  return {
    id: row.id,
    status: row.status as BacktestProgressItem["status"],
    error: row.error,
    completedAt: row.completedAt?.toISOString() ?? null,
    progress: row.progress,
    progressStage: row.progressStage,
    netPnl: row.netPnl === null ? null : Number(row.netPnl),
    netPnlPct: row.netPnlPct === null ? null : Number(row.netPnlPct),
    tradeCount: row.tradeCount === null ? null : Number(row.tradeCount),
    maxDrawdownPct:
      row.maxDrawdownPct === null ? null : Number(row.maxDrawdownPct),
    winRate: row.winRate === null ? null : Number(row.winRate),
    sharpe: row.sharpe === null ? null : Number(row.sharpe),
    tradingDays:
      firstEntry !== null && lastExit !== null
        ? Math.round((lastExit - firstEntry) / 86_400_000)
        : null,
  }
}

type DetailRow = {
  id: string
  groupId: string
  automationId: string | null
  name: string
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
  progress: number
  progressStage: string | null
  params: unknown
  costs: unknown
  result: unknown
}

function serializeDetail(row: DetailRow): BacktestDetail {
  return {
    id: row.id,
    groupId: row.groupId,
    automationId: row.automationId,
    name: row.name,
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
    progress: row.progress,
    progressStage: row.progressStage,
    // Normalized so `params.kind` is always set (pre-kind rows lack it).
    params:
      normalizeAutomationConfig(row.params) ?? (row.params as AutomationConfig),
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
