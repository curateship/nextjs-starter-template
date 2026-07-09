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
import { runFailureMessage } from "@/lib/backtest/run-error"
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
  /** Optional per-user override of the strategy's display name (Edit strategy). */
  strategyName?: string
  /** Optional per-user override of the strategy's type/kind label (Edit strategy). */
  strategyKind?: string
  /** Templates only: pinned templates sort to the top of the Templates list. */
  pinned?: boolean
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
        data.params.strategyType === "qqe" ||
        data.params.strategyType === "vwap") &&
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

/**
 * One walk-forward per user at a time: it fetches candles and runs the engine
 * inline in the request, so unbounded parallel calls would hog the server. (Plain
 * backtests don't use this — they enqueue instantly and drain in the background.)
 */
const inFlightRuns = new Set<string>()

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
      stableStringify(data.riskParams) !== stableStringify(anchor.riskParams) ||
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
        `${data.params.strategyType} · ${markets.join(", ")} · ${data.interval}`
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
    `${data.params.strategyType} · ${markets.join(", ")} · ${data.interval}`
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
    riskParams: data.riskParams,
    costs,
    startTime,
    endTime,
    startingEquity: data.startingEquity,
  }
}

// --- Walk-forward validation -------------------------------------------------

const DAY_MS = 86_400_000

const walkForwardSchema = z
  .object({
    market: z.string().min(1).max(20),
    extraMarkets: z.array(z.string().min(1).max(20)).max(MAX_EXTRA_MARKETS).optional(),
    interval: z.enum(CANDLE_INTERVALS),
    windowDays: z.number().int().min(4).max(MAX_RUN_BARS),
    /** Fraction of the window used to fit; the rest is held out to test. */
    trainPct: z.number().min(0.3).max(0.9),
    startingEquity: z.number().positive().max(100_000_000),
    takerFeeBps: z.number().min(0).max(50).optional(),
    makerFeeBps: z.number().min(0).max(50).optional(),
    slippageBps: z.number().min(0).max(100).optional(),
    params: strategyParamsSchema,
    riskParams: riskParamsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.params.strategyType === "copy") {
      ctx.addIssue({ code: "custom", message: "Copy trading can't be backtested.", path: ["params"] })
    }
    if (
      (data.params.strategyType === "momentum" ||
        data.params.strategyType === "qqe" ||
        data.params.strategyType === "vwap") &&
      data.params.interval !== data.interval
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Backtest timeframe must match the strategy's signal interval.",
        path: ["interval"],
      })
    }
    const markets = [data.market, ...(data.extraMarkets ?? [])]
    if (new Set(markets).size !== markets.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate markets selected.", path: ["extraMarkets"] })
    }
    if (data.windowDays > maxWindowDays(data.interval)) {
      ctx.addIssue({
        code: "custom",
        message: `That window is too long for ${data.interval} candles.`,
        path: ["windowDays"],
      })
    }
    const totalBars = markets.length * windowBars(data.interval, data.windowDays)
    if (totalBars > MAX_TOTAL_RUN_BARS) {
      ctx.addIssue({
        code: "custom",
        message: `This walk-forward would pull ~${totalBars.toLocaleString()} candles across ${markets.length} market(s), over the ${MAX_TOTAL_RUN_BARS.toLocaleString()} per-run limit. Use fewer markets, a shorter window, or a coarser timeframe.`,
        path: ["extraMarkets"],
      })
    }
  })

/** Blended, diversified metrics for a train or test window. */
export type WalkForwardPhase = {
  fromMs: number
  toMs: number
  days: number
  /** Equal-capital blended return across the basket. */
  netPnlPct: number
  /** Drawdown of the summed portfolio equity curve. */
  maxDrawdownPct: number
  /** Fraction of markets that were net-positive. */
  winRate: number
  trades: number
}

export type WalkForwardResult = {
  markets: string[]
  train: WalkForwardPhase
  test: WalkForwardPhase
  /** OOS positive and within range of train / OOS positive but weak / OOS negative. */
  verdict: "holds" | "weak" | "fails"
}

const walkForwardFn = createServerFn({ method: "POST" })
  .inputValidator(walkForwardSchema)
  .handler(async ({ data }): Promise<WalkForwardResult> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    if (inFlightRuns.has(user.id)) {
      throw new Error("A backtest is already running — wait for it to finish.")
    }
    inFlightRuns.add(user.id)
    try {
      return await evaluateWalkForward(data)
    } catch (error) {
      // Don't leak upstream/internal error text to the client (matches executeRun).
      console.error("walk-forward run failed", error)
      throw new Error(runFailureMessage(error))
    } finally {
      inFlightRuns.delete(user.id)
    }
  })

/** Pure walk-forward evaluation (no auth/DB): fetch, run train + test, blend. */
async function evaluateWalkForward(
  data: z.infer<typeof walkForwardSchema>
): Promise<WalkForwardResult> {
  const { fetchCandleHistory } = await import("@/server/backtest/history")
  const { strategies } = await import("../../../worker/src/strategies/registry")
  const { runBacktest: runEngine } = await import("../../../worker/src/backtest/runner")

  const strategy = strategies[data.params.strategyType]
  if (!strategy) throw new Error(`Strategy "${data.params.strategyType}" can't be backtested.`)

  const markets = [data.market, ...(data.extraMarkets ?? [])]
  const interval = data.interval
  const costs: BacktestCosts = {
    takerFeeBps: data.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps,
    makerFeeBps: data.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps,
    slippageBps: data.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps,
  }
  const warmupBars = warmupBarsFor(data.params.strategyType)

  const endMs = Date.now()
  const totalStartMs = endMs - data.windowDays * DAY_MS
  const trainEndMs = totalStartMs + Math.round(data.windowDays * data.trainPct) * DAY_MS
  const fetchStart = totalStartMs - warmupBars * INTERVAL_MS[interval]

  const trainRuns: BacktestResult[] = []
  const testRuns: BacktestResult[] = []
  const kept: string[] = []
  for (const market of markets) {
    const candles = await fetchCandleHistory(market, interval, fetchStart, endMs)
    // Skip markets without a full window (newer listings), like the scripts do.
    if (candles.length === 0 || candles[0].t > totalStartMs) continue
    // Train: fit window only (candles sliced so the engine can't see the future).
    const trainCandles = candles.filter((c) => c.t <= trainEndMs)
    const base = { strategy, params: data.params, riskParams: data.riskParams, startingEquity: data.startingEquity, market, interval, costs } as const
    trainRuns.push(runEngine({ ...base, candles: trainCandles, simStartMs: totalStartMs }))
    // Test: fresh capital, trading only the held-out window (warmup from before).
    testRuns.push(runEngine({ ...base, candles, simStartMs: trainEndMs }))
    kept.push(market)
  }
  if (kept.length === 0) {
    throw new Error("No candle history for those markets in that window.")
  }

  const trainDays = (trainEndMs - totalStartMs) / DAY_MS
  const testDays = (endMs - trainEndMs) / DAY_MS
  const train = aggregatePhase(trainRuns, data.startingEquity, totalStartMs, trainEndMs, trainDays)
  const test = aggregatePhase(testRuns, data.startingEquity, trainEndMs, endMs, testDays)

  const trDaily = train.netPnlPct / trainDays
  const teDaily = test.netPnlPct / testDays
  const verdict = teDaily <= 0 ? "fails" : teDaily >= trDaily * 0.4 ? "holds" : "weak"
  return { markets: kept, train, test, verdict }
}

function aggregatePhase(
  runs: BacktestResult[],
  equityPerMarket: number,
  fromMs: number,
  toMs: number,
  days: number
): WalkForwardPhase {
  let netPnl = 0
  let winners = 0
  let trades = 0
  for (const run of runs) {
    netPnl += run.stats.netPnl
    if (run.stats.netPnlPct > 0) winners += 1
    trades += run.stats.all.trades
  }
  const totalEquity = equityPerMarket * runs.length
  return {
    fromMs,
    toMs,
    days,
    netPnlPct: totalEquity > 0 ? (netPnl / totalEquity) * 100 : 0,
    maxDrawdownPct: portfolioDrawdown(runs, equityPerMarket),
    winRate: runs.length > 0 ? winners / runs.length : 0,
    trades,
  }
}

/** Drawdown % of the summed per-market equity curves (diversified portfolio). */
function portfolioDrawdown(runs: BacktestResult[], equityPerMarket: number): number {
  const times = new Set<number>()
  for (const r of runs) for (const p of r.equityCurve) times.add(p.t)
  const axis = [...times].sort((a, b) => a - b)
  if (axis.length === 0) return 0
  const portfolio = new Array<number>(axis.length).fill(0)
  for (const r of runs) {
    let j = 0
    let last = equityPerMarket
    for (let k = 0; k < axis.length; k += 1) {
      while (j < r.equityCurve.length && r.equityCurve[j].t <= axis[k]) {
        last = r.equityCurve[j].eq
        j += 1
      }
      portfolio[k] += last
    }
  }
  let peak = -Infinity
  let dd = 0
  for (const v of portfolio) {
    if (v > peak) peak = v
    if (peak > 0) dd = Math.max(dd, ((peak - v) / peak) * 100)
  }
  return dd
}

const loadBacktestsSchema = z.object({
  strategyType: z.enum(["grid", "dca", "momentum", "qqe", "vwap", "copy"]).optional(),
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
    const { kickBacktestQueue } = await import("@/server/backtest/queue")
    const user = await requireUser()
    // Resume any queued/orphaned runs whenever the dashboard is opened — covers
    // a server restart mid-run without a dedicated boot hook. Idempotent.
    kickBacktestQueue()
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
      .array(z.enum(["grid", "dca", "momentum", "qqe", "vwap", "copy"]))
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

export function runWalkForward(input: z.input<typeof walkForwardSchema>) {
  return walkForwardFn({ data: input })
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
  /** Per-user overrides of the strategy's display name + type (Edit strategy). */
  strategyName: z.string().max(80).optional(),
  strategyKind: z.string().max(40).optional(),
  /** Templates only: pinned to the top of the Templates list. */
  pinned: z.boolean().optional(),
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

const strategyTypeSchema = z.enum(["grid", "dca", "momentum", "qqe", "vwap", "copy"])

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
