import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  DEFAULT_BACKTEST_COSTS,
  MAX_BACKTEST_BARS,
  MAX_EXTRA_MARKETS,
  MAX_RUN_BARS,
  MAX_TOTAL_RUN_BARS,
  maxWindowDays,
  windowBars,
  SIGNAL_WARMUP_CANDLES,
  warmupBarsFor,
  type BacktestCosts,
  type BacktestResult,
  type GroupPortfolioMetrics,
} from "@/lib/backtest/types"
import {
  type StrategyParams,
  type StrategyType,
} from "@/lib/strategies/params"
import {
  strategyConfigSchema as signalConfigSchema,
  type StrategyConfig,
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
  strategyType: StrategyType | "signal"
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

export type BacktestDetail = {
  id: string
  groupId: string
  name: string
  strategyType: StrategyType | "signal"
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
  /** Legacy StrategyParams, or a StrategyConfig for new-model runs. */
  params: StrategyParams | StrategyConfig
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

/** Default run-name prefix: the config's indicator. */
function runLabelOf(params: StrategyConfig): string {
  return params.indicator.type
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
     * market). The background queue drains them one at a time, so this bounds a
     * run group's total upstream cost.
     */
    extraMarkets: z.array(z.string().min(1).max(20)).max(MAX_EXTRA_MARKETS).optional(),
    interval: z.enum(CANDLE_INTERVALS),
    windowDays: z.number().int().min(1).max(MAX_RUN_BARS),
    startingEquity: z.number().positive().max(100_000_000),
    takerFeeBps: z.number().min(0).max(50).optional(),
    makerFeeBps: z.number().min(0).max(50).optional(),
    slippageBps: z.number().min(0).max(100).optional(),
    /** The strategy's full config: indicator + universal settings. */
    params: signalConfigSchema,
  })
  .superRefine((data, ctx) => {
    if (data.params.interval !== data.interval) {
      ctx.addIssue({
        code: "custom",
        message:
          "Backtest timeframe must match the strategy's signal interval.",
        path: ["interval"],
      })
    }
    const markets = [data.market, ...(data.extraMarkets ?? [])]
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
        message: `That window is too long for ${data.interval} candles — a run covers at most ${maxWindowDays(data.interval)} days at ${data.interval}. Shorten the window or use a coarser timeframe.`,
        path: ["windowDays"],
      })
    }
    const totalBars = markets.length * windowBars(data.interval, data.windowDays)
    if (totalBars > MAX_TOTAL_RUN_BARS) {
      ctx.addIssue({
        code: "custom",
        message: `This run would pull ~${totalBars.toLocaleString()} candles across ${markets.length} market(s), over the ${MAX_TOTAL_RUN_BARS.toLocaleString()} per-run limit. Use fewer markets, a shorter window, or a coarser timeframe.`,
        path: ["extraMarkets"],
      })
    }
  })

const backtestIdSchema = z.object({ backtestId: z.string().min(1) })

const runBacktestFn = createServerFn({ method: "POST" })
  .inputValidator(runBacktestSchema)
  .handler(async ({ data }): Promise<{ backtestId: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const {
      createUserBacktest,
      resetUserBacktest,
      listGroupRuns,
      getUserBacktest,
    } = await import("@/server/backtests")
    const { kickBacktestQueue } = await import("@/server/backtest/queue")
    requireAppOrigin()
    const user = await requireUser()

    // Enqueue markets as `pending` and return immediately; the background queue
    // downloads history and runs the engine one market at a time so a big basket
    // can't hold the request open or flood the candle source.
    const result = await enqueueRun(user.id, data, {
      createUserBacktest,
      resetUserBacktest,
      listGroupRuns,
      getUserBacktest,
    })
    kickBacktestQueue()
    return result
  })

type BacktestEnqueueServer = Pick<
  typeof import("@/server/backtests"),
  | "createUserBacktest"
  | "resetUserBacktest"
  | "listGroupRuns"
  | "getUserBacktest"
>

/** Canonical JSON (keys sorted at every depth) so config equality ignores key order. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        )
      : val
  )
}

/**
 * Queues a config across its market basket as `pending` rows (the background
 * queue fills in results). Fresh runs create one row per market sharing a new
 * groupId. Re-runs (`groupId` set) are incremental:
 *
 * - If the strategy/risk/fee/interval/equity config **or** the window changed,
 *   it's a full re-run — every market is requeued over a fresh window (a
 *   backtest's numbers depend on its whole history, so partial dates can't be
 *   reused).
 * - Otherwise only genuinely new markets are queued; markets already in the
 *   group keep their results and their existing window untouched.
 *
 * Returns the run id to open (the group's main row on a re-run).
 */
async function enqueueRun(
  userId: string,
  data: z.infer<typeof runBacktestSchema>,
  server: BacktestEnqueueServer
): Promise<{ backtestId: string }> {
  const { createUserBacktest, resetUserBacktest, listGroupRuns, getUserBacktest } =
    server

  const markets = [data.market, ...(data.extraMarkets ?? [])]
  const costs: BacktestCosts = {
    takerFeeBps: data.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps,
    makerFeeBps: data.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps,
    slippageBps: data.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps,
  }

  // --- Re-run: decide full re-run vs. add-only ------------------------------
  if (data.groupId) {
    const siblings = await listGroupRuns(userId, data.groupId)
    if (siblings.length === 0) throw new Error("Run not found.")
    const existingMarkets = new Set(siblings.map((s) => s.market))
    // The group's anchor row (id === groupId) holds the shared config.
    const anchor = await getUserBacktest(userId, data.groupId)

    const configChanged =
      !anchor ||
      stableStringify(data.params) !== stableStringify(anchor.params) ||
      stableStringify(costs) !== stableStringify(anchor.costs) ||
      data.interval !== anchor.interval ||
      data.startingEquity !== Number(anchor.startingEquity)
    const anchorWindowDays = anchor
      ? Math.round(
          (anchor.endTime.getTime() - anchor.startTime.getTime()) / 86_400_000
        )
      : -1
    const windowChanged = data.windowDays !== anchorWindowDays

    if (configChanged || windowChanged) {
      // Full re-run: requeue every submitted market over a fresh window.
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - data.windowDays * 86_400_000)
      const name =
        data.name?.trim() ||
        `${runLabelOf(data.params)} · ${markets.join(", ")} · ${data.interval}`
      for (const market of markets) {
        const input = buildRunInput({
          name,
          groupId: data.groupId,
          market,
          data,
          costs,
          startTime,
          endTime,
        })
        const existingId = siblings.find((s) => s.market === market)?.id
        if (existingId) {
          await resetUserBacktest(userId, existingId, input)
        } else {
          await createUserBacktest(userId, input)
        }
      }
    } else {
      // Nothing that affects results changed — only queue markets not already
      // in the group, reusing the group's existing window and name so the
      // basket stays consistent. Existing rows keep their results.
      const newMarkets = markets.filter((m) => !existingMarkets.has(m))
      for (const market of newMarkets) {
        const input = buildRunInput({
          name: anchor!.name,
          groupId: data.groupId,
          market,
          data,
          costs,
          startTime: anchor!.startTime,
          endTime: anchor!.endTime,
        })
        await createUserBacktest(userId, input)
      }
    }

    return { backtestId: data.groupId }
  }

  // --- Fresh run: one new row per market, sharing the main market's id ------
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - data.windowDays * 86_400_000)
  const name =
    data.name?.trim() ||
    `${runLabelOf(data.params)} · ${markets.join(", ")} · ${data.interval}`
  let mainId: string | null = null
  for (const market of markets) {
    const input = buildRunInput({
      name,
      groupId: mainId ?? undefined,
      market,
      data,
      costs,
      startTime,
      endTime,
    })
    const backtest = await createUserBacktest(userId, input)
    mainId = mainId ?? backtest.id
  }
  return { backtestId: mainId as string }
}

/** Assembles a CreateBacktestInput from a run's shared config + one market's window. */
function buildRunInput(args: {
  name: string
  groupId: string | undefined
  market: string
  data: z.infer<typeof runBacktestSchema>
  costs: BacktestCosts
  startTime: Date
  endTime: Date
}): CreateBacktestInput {
  const { name, groupId, market, data, costs, startTime, endTime } = args
  return {
    name,
    groupId,
    market,
    network: "mainnet",
    interval: data.interval,
    params: data.params,
    costs,
    startTime,
    endTime,
    startingEquity: data.startingEquity,
  }
}

const loadBacktestsSchema = z.object({
  strategyType: z.enum(["signal", "grid", "dca", "momentum", "qqe", "vwap", "copy"]).optional(),
  /** Restrict to one run group — the group page needs nothing else. */
  groupId: z.string().min(1).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

const loadBacktestsFn = createServerFn({ method: "GET" })
  .inputValidator(loadBacktestsSchema)
  .handler(async ({ data }): Promise<BacktestListResponse> => {
    const { listUserBacktests } = await import("@/server/backtests")
    const { kickBacktestQueue } = await import("@/server/backtest/queue")
    const user = await requireUser()
    // Resume any queued/orphaned runs whenever the dashboard is opened — covers
    // a server restart mid-run without a dedicated boot hook. Idempotent.
    kickBacktestQueue()
    const page = data.page ?? 1
    const pageSize = data.pageSize ?? 20
    const list = await listUserBacktests(user.id, {
      strategyType: data.strategyType,
      groupId: data.groupId,
      page,
      pageSize: data.strategyType ? pageSize : 500,
    })
    return {
      runs: list.rows.map(serializeListItem),
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

const groupMetricsSchema = z.object({
  groupIds: z.array(z.string().min(1)).max(100),
})

const loadGroupMetricsFn = createServerFn({ method: "GET" })
  .inputValidator(groupMetricsSchema)
  .handler(
    async ({ data }): Promise<Record<string, GroupPortfolioMetrics>> => {
      const { loadGroupPortfolioMetrics } = await import(
        "@/server/backtest/portfolio-metrics"
      )
      const user = await requireUser()
      return loadGroupPortfolioMetrics(user.id, data.groupIds)
    }
  )

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
    const warmupMs =
      warmupBarsFor((row.params as StrategyParams).strategyType) * stepMs
    let fetchStart = visibleStartMs - warmupMs
    const maxSpanMs = MAX_CHART_BARS * stepMs
    if (toMs - fetchStart > maxSpanMs) fetchStart = toMs - maxSpanMs

    const candles = await fetchCandleHistory(row.market, interval, fetchStart, toMs)
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
    strategyTypes: z
      .array(z.enum(["signal", "grid", "dca", "momentum", "qqe", "vwap", "copy"]))
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

export function loadBacktests(input: z.input<typeof loadBacktestsSchema> = {}) {
  return loadBacktestsFn({ data: input })
}

export function loadGroupMetrics(groupIds: string[]) {
  return loadGroupMetricsFn({ data: { groupIds } })
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
    // Active trading span: first order opened → last order closed.
    tradingDays:
      firstEntry !== null && lastExit !== null
        ? Math.round((lastExit - firstEntry) / 86_400_000)
        : null,
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
