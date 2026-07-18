import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm"

import {
  PREVIOUS_RUN_NAME_PREFIX,
  type BacktestCosts,
  type BacktestResult,
} from "@/lib/backtest/types"
import {
  automationCapabilities,
  LIVE_BOOK_BACKTEST_UNAVAILABLE,
  type AutomationConfig,
} from "@/lib/strategies/strategy-config"
import { db, type CustomShellDb } from "@/server/db"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import { tradingBacktests, type TradingBacktest } from "@/server/schema"
import { now, uuid } from "@/server/util"

export type CreateBacktestInput = {
  name: string
  /** Market-group lineage; omitted for the first row (group = its own id). */
  groupId?: string
  /** Editable Automation that produced this immutable params snapshot. */
  automationId?: string | null
  market: string
  network: TradingNetwork
  interval: string
  /** The strategy's full config snapshot. */
  params: AutomationConfig
  costs: BacktestCosts
  startTime: Date
  endTime: Date
  startingEquity: number
}

/** The config columns shared by queued and already-completed runs. */
function backtestConfigValues(input: CreateBacktestInput) {
  return {
    name: input.name.slice(0, 255),
    strategyType: input.params.kind,
    automationId: input.automationId ?? null,
    market: input.market,
    network: input.network,
    interval: input.interval,
    params: input.params,
    riskParams: {},
    costs: input.costs,
    startTime: input.startTime,
    endTime: input.endTime,
    startingEquity: String(input.startingEquity),
  }
}

function backtestResultValues(result: BacktestResult) {
  // The replay tape gets its own column so run-open payloads stay lean —
  // the chart fetches it lazily, only when someone actually replays.
  const { timeline, ...rest } = result
  return {
    result: rest,
    timeline: timeline ?? null,
    resultStats: {
      ...result.stats,
      firstEntryMs: result.trades[0]?.entryTime ?? null,
      lastExitMs: result.trades[result.trades.length - 1]?.exitTime ?? null,
    },
  }
}

function assertBacktestable(input: CreateBacktestInput) {
  if (!automationCapabilities(input.params).supportsHistoricalBacktest) {
    throw new Error(LIVE_BOOK_BACKTEST_UNAVAILABLE)
  }
}

/** Inserts a queued backtest row for the dedicated worker. */
export async function createUserBacktest(
  userId: string,
  input: CreateBacktestInput,
  database: CustomShellDb = db
): Promise<TradingBacktest> {
  assertBacktestable(input)
  const id = uuid()
  const [row] = await database
    .insert(tradingBacktests)
    .values({
      id,
      userId,
      groupId: input.groupId ?? id,
      ...backtestConfigValues(input),
      // Queued; the background queue claims it and stamps startedAt on run.
      status: "pending",
      startedAt: null,
      progress: 0,
      progressStage: "queued",
      createdAt: now(),
    })
    .returning()
  if (!row) throw new Error("Backtest was not created")
  return row
}

/** Inserts every market in one run group atomically before workers can claim it. */
export async function createUserBacktestGroup(
  userId: string,
  inputs: CreateBacktestInput[],
  database: CustomShellDb = db
): Promise<{ groupId: string; rows: TradingBacktest[] }> {
  if (inputs.length === 0) throw new Error("Pick at least one market.")
  for (const input of inputs) assertBacktestable(input)

  const ids = inputs.map(() => uuid())
  const groupId = ids[0]
  const createdAt = now()
  const rows = await database
    .insert(tradingBacktests)
    .values(
      inputs.map((input, index) => ({
        id: ids[index],
        userId,
        groupId,
        ...backtestConfigValues(input),
        status: "pending" as const,
        startedAt: null,
        progress: 0,
        progressStage: "queued",
        createdAt,
      }))
    )
    .returning()
  if (rows.length !== inputs.length) {
    throw new Error("Backtest group was not created")
  }
  return { groupId, rows }
}

/** Saves a result computed by an explicit offline tool without queueing it. */
export async function createCompletedUserBacktest(
  userId: string,
  input: CreateBacktestInput,
  result: BacktestResult,
  database: CustomShellDb = db
): Promise<TradingBacktest> {
  assertBacktestable(input)
  const id = uuid()
  const timestamp = now()
  const [row] = await database
    .insert(tradingBacktests)
    .values({
      id,
      userId,
      groupId: input.groupId ?? id,
      ...backtestConfigValues(input),
      ...backtestResultValues(result),
      status: "done",
      progress: 100,
      progressStage: "complete",
      claimedBy: null,
      createdAt: timestamp,
      startedAt: timestamp,
      completedAt: timestamp,
    })
    .returning()
  if (!row) throw new Error("Completed Backtest was not saved")
  return row
}

/** Finishes only the run still owned by this worker claim. */
export async function finishClaimedBacktest(
  backtestId: string,
  workerId: string,
  result: BacktestResult,
  database: CustomShellDb = db
) {
  const [row] = await database
    .update(tradingBacktests)
    .set({
      status: "done",
      ...backtestResultValues(result),
      completedAt: now(),
      progress: 100,
      progressStage: "complete",
      claimedBy: null,
    })
    .where(
      and(
        eq(tradingBacktests.id, backtestId),
        eq(tradingBacktests.status, "running"),
        eq(tradingBacktests.claimedBy, workerId)
      )
    )
    .returning({ id: tradingBacktests.id })
  if (!row) throw new Error("Backtest claim was lost before completion")
}

/** Fails only the run still owned by this worker claim. */
export async function failClaimedBacktest(
  backtestId: string,
  workerId: string,
  error: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .update(tradingBacktests)
    .set({
      status: "error",
      error: error.slice(0, 400),
      completedAt: now(),
      progress: 100,
      progressStage: "failed",
      claimedBy: null,
    })
    .where(
      and(
        eq(tradingBacktests.id, backtestId),
        eq(tradingBacktests.status, "running"),
        eq(tradingBacktests.claimedBy, workerId)
      )
    )
    .returning({ id: tradingBacktests.id })
  if (!row) throw new Error("Backtest claim was lost before failure was saved")
}

/**
 * Atomically claims the oldest queued (`pending`) row for the background queue:
 * picks one with `FOR UPDATE SKIP LOCKED` so parallel drainers never grab the
 * same row, flips it to `running`, and returns the full row to execute. Returns
 * null when the queue is empty.
 */
export async function claimNextPendingBacktest(
  workerId: string,
  database: CustomShellDb = db
): Promise<TradingBacktest | null> {
  return database.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: tradingBacktests.id })
      .from(tradingBacktests)
      .where(
        and(
          eq(tradingBacktests.status, "pending"),
          sql<boolean>`((${tradingBacktests.params} -> 'qfl') is null or ${tradingBacktests.id} = ${tradingBacktests.groupId})`
        )
      )
      .orderBy(asc(tradingBacktests.createdAt))
      .limit(1)
      .for("update", { skipLocked: true })
    if (!candidate) return null
    const [row] = await tx
      .update(tradingBacktests)
      .set({
        status: "running",
        startedAt: now(),
        attemptCount: sql`${tradingBacktests.attemptCount} + 1`,
        progress: 5,
        progressStage: "claimed",
        claimedBy: workerId,
      })
      .where(eq(tradingBacktests.id, candidate.id))
      .returning()
    return row ?? null
  })
}

/** Claims the still-pending siblings of an already claimed portfolio run. */
export async function claimPendingBacktestGroup(
  groupId: string,
  workerId: string,
  database: CustomShellDb = db
): Promise<TradingBacktest[]> {
  return database
    .update(tradingBacktests)
    .set({
      status: "running",
      startedAt: now(),
      attemptCount: sql`${tradingBacktests.attemptCount} + 1`,
      progress: 5,
      progressStage: "claimed",
      claimedBy: workerId,
    })
    .where(
      and(
        eq(tradingBacktests.groupId, groupId),
        eq(tradingBacktests.status, "pending")
      )
    )
    .returning()
}

/**
 * Restart recovery: any row left `running` was orphaned when the worker stopped
 * (nothing is computing it now), so put it back in the queue as `pending`.
 * Returns how many were requeued.
 */
export async function resetOrphanedRunning(
  database: CustomShellDb = db
): Promise<{ requeued: number; failed: number }> {
  const exhausted = await database
    .update(tradingBacktests)
    .set({
      status: "error",
      error: "Backtest stopped repeatedly while running.",
      progress: 100,
      progressStage: "failed",
      completedAt: now(),
      claimedBy: null,
    })
    .where(
      and(
        eq(tradingBacktests.status, "running"),
        sql`${tradingBacktests.attemptCount} >= 3`
      )
    )
    .returning({ id: tradingBacktests.id })
  const requeued = await database
    .update(tradingBacktests)
    .set({
      status: "pending",
      startedAt: null,
      progress: 0,
      progressStage: "retrying",
      claimedBy: null,
    })
    .where(eq(tradingBacktests.status, "running"))
    .returning({ id: tradingBacktests.id })
  return { requeued: requeued.length, failed: exhausted.length }
}

export async function updateBacktestProgress(
  backtestId: string,
  workerId: string,
  progress: number,
  stage: string,
  database: CustomShellDb = db
) {
  await database
    .update(tradingBacktests)
    .set({
      progress: Math.max(0, Math.min(99, Math.round(progress))),
      progressStage: stage.slice(0, 40),
    })
    .where(
      and(
        eq(tradingBacktests.id, backtestId),
        eq(tradingBacktests.status, "running"),
        eq(tradingBacktests.claimedBy, workerId)
      )
    )
}

/** The run's strategy identity from the config JSON: its indicator id, or the
 * config kind ("automation") for strategies that have no indicator. */
const indicatorTypeSql = sql<
  string | null
>`coalesce(${tradingBacktests.params} #>> '{indicator,type}', ${tradingBacktests.params} ->> 'kind')`

const backtestListFields = {
  id: tradingBacktests.id,
  groupId: tradingBacktests.groupId,
  name: tradingBacktests.name,
  indicatorType: indicatorTypeSql,
  market: tradingBacktests.market,
  network: tradingBacktests.network,
  interval: tradingBacktests.interval,
  startTime: tradingBacktests.startTime,
  endTime: tradingBacktests.endTime,
  startingEquity: tradingBacktests.startingEquity,
  status: tradingBacktests.status,
  reviewStatus: tradingBacktests.reviewStatus,
  pinned: tradingBacktests.pinned,
  error: tradingBacktests.error,
  createdAt: tradingBacktests.createdAt,
  completedAt: tradingBacktests.completedAt,
  progress: tradingBacktests.progress,
  progressStage: tradingBacktests.progressStage,
  netPnl: sql<string | null>`(${tradingBacktests.resultStats} ->> 'netPnl')`,
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
}

/** Recent runs for the list page + header dropdown; omits the heavy result. */
export async function listUserBacktests(
  userId: string,
  options: {
    /** Restrict to runs of one indicator (registry id, e.g. "qqe"). */
    indicatorType?: string
    /** Restrict to one run group (the group page needs nothing else). */
    groupId?: string
    page?: number
    pageSize?: number
  } = {},
  database: CustomShellDb = db
) {
  const page = Math.max(1, options.page ?? 1)
  const maxPageSize = options.indicatorType ? 100 : 500
  const pageSize = Math.min(Math.max(1, options.pageSize ?? 500), maxPageSize)
  const filters = [eq(tradingBacktests.userId, userId)]
  if (options.indicatorType)
    filters.push(sql`${indicatorTypeSql} = ${options.indicatorType}`)
  if (options.groupId)
    filters.push(eq(tradingBacktests.groupId, options.groupId))
  const where = and(...filters)

  if (options.groupId) {
    const rows = await database
      .select(backtestListFields)
      .from(tradingBacktests)
      .where(where)
      .orderBy(desc(tradingBacktests.createdAt))
    return { rows, totalGroups: rows.length > 0 ? 1 : 0 }
  }

  const [{ totalGroups = 0 } = { totalGroups: 0 }] = await database
    .select({
      totalGroups: sql<number>`count(distinct ${tradingBacktests.groupId})::int`,
    })
    .from(tradingBacktests)
    .where(where)

  const groups = await database
    .select({ groupId: tradingBacktests.groupId })
    .from(tradingBacktests)
    .where(where)
    .groupBy(tradingBacktests.groupId)
    .orderBy(
      sql`bool_or(${tradingBacktests.pinned}) desc`,
      sql`max(${tradingBacktests.createdAt}) desc`
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  if (groups.length === 0) return { rows: [], totalGroups }

  const rows = await database
    .select(backtestListFields)
    .from(tradingBacktests)
    .where(
      and(
        eq(tradingBacktests.userId, userId),
        inArray(
          tradingBacktests.groupId,
          groups.map((group) => group.groupId)
        )
      )
    )
    .orderBy(desc(tradingBacktests.pinned), desc(tradingBacktests.createdAt))

  return { rows, totalGroups }
}

export type DeleteBacktestsFilter = {
  /** Individual executions. */
  ids?: string[]
  /** Whole run groups (a run and its re-run history). */
  groupIds?: string[]
  /** Everything belonging to these indicators (registry ids). */
  indicatorTypes?: string[]
}

/**
 * Deletes the user's backtests matching any of the filter facets: execution
 * ids, run groups, or entire strategies. Returns the number removed.
 */
export async function deleteUserBacktests(
  userId: string,
  filter: DeleteBacktestsFilter,
  database: CustomShellDb = db
): Promise<number> {
  const facets = []
  if (filter.ids?.length) facets.push(inArray(tradingBacktests.id, filter.ids))
  if (filter.groupIds?.length) {
    facets.push(inArray(tradingBacktests.groupId, filter.groupIds))
  }
  if (filter.indicatorTypes?.length) {
    facets.push(inArray(indicatorTypeSql, filter.indicatorTypes))
  }
  if (facets.length === 0) return 0

  const deleted = await database
    .delete(tradingBacktests)
    .where(and(eq(tradingBacktests.userId, userId), or(...facets)))
    .returning({ id: tradingBacktests.id })
  return deleted.length
}

/**
 * Sets the triage status and/or pinned flag on every row of the given run
 * groups (status/pin are group-level). Scoped to the user. Returns rows changed.
 */
export async function setUserBacktestStatus(
  userId: string,
  input: {
    groupIds: string[]
    reviewStatus?: "review" | "archived"
    pinned?: boolean
  },
  database: CustomShellDb = db
): Promise<number> {
  if (input.groupIds.length === 0) return 0
  const set: { reviewStatus?: string; pinned?: boolean } = {}
  if (input.reviewStatus !== undefined) set.reviewStatus = input.reviewStatus
  if (input.pinned !== undefined) set.pinned = input.pinned
  if (Object.keys(set).length === 0) return 0

  const updated = await database
    .update(tradingBacktests)
    .set(set)
    .where(
      and(
        eq(tradingBacktests.userId, userId),
        inArray(tradingBacktests.groupId, input.groupIds)
      )
    )
    .returning({ id: tradingBacktests.id })
  return updated.length
}

/** Sibling runs of a group — one per market — for the workspace switcher. */
export async function listGroupRuns(
  userId: string,
  groupId: string,
  database: CustomShellDb = db
) {
  return database
    .select({
      id: tradingBacktests.id,
      market: tradingBacktests.market,
      status: tradingBacktests.status,
      error: tradingBacktests.error,
      netPnlPct: sql<
        string | null
      >`(${tradingBacktests.result} #>> '{stats,netPnlPct}')`,
    })
    .from(tradingBacktests)
    .where(
      and(
        eq(tradingBacktests.userId, userId),
        eq(tradingBacktests.groupId, groupId)
      )
    )
    .orderBy(asc(tradingBacktests.createdAt))
}

export async function getUserBacktest(
  userId: string,
  backtestId: string,
  database: CustomShellDb = db
): Promise<TradingBacktest | null> {
  const [row] = await database
    .select()
    .from(tradingBacktests)
    .where(
      and(
        eq(tradingBacktests.id, backtestId),
        eq(tradingBacktests.userId, userId)
      )
    )
    .limit(1)
  return row ?? null
}

/**
 * Deletes the automation's replaceable groups — unnamed ("Previous run …")
 * and unpinned. Called when a new run of the same automation replaces them;
 * named or pinned groups are keepers and are never touched.
 */
export async function deleteReplaceableAutomationRuns(
  userId: string,
  automationId: string,
  database: CustomShellDb = db
) {
  await database
    .delete(tradingBacktests)
    .where(
      and(
        eq(tradingBacktests.userId, userId),
        eq(tradingBacktests.automationId, automationId),
        eq(tradingBacktests.pinned, false),
        sql`${tradingBacktests.name} like ${`${PREVIOUS_RUN_NAME_PREFIX} ·%`}`
      )
    )
}

/** Names a run group — a named group is a keeper the next run won't replace. */
export async function renameUserBacktestGroup(
  userId: string,
  groupId: string,
  name: string,
  database: CustomShellDb = db
) {
  await database
    .update(tradingBacktests)
    .set({ name })
    .where(
      and(
        eq(tradingBacktests.userId, userId),
        eq(tradingBacktests.groupId, groupId)
      )
    )
}

/** The automation's most recent run group, for editor-mode rehydration. */
export async function getLatestAutomationBacktestGroup(
  userId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<{ groupId: string; name: string } | null> {
  const [row] = await database
    .select({
      groupId: tradingBacktests.groupId,
      name: tradingBacktests.name,
    })
    .from(tradingBacktests)
    .where(
      and(
        eq(tradingBacktests.userId, userId),
        eq(tradingBacktests.automationId, automationId)
      )
    )
    .orderBy(desc(tradingBacktests.createdAt))
    .limit(1)
  return row ?? null
}

/** The replay tape alone — the heavy result blob stays unloaded. */
export async function getUserBacktestTimeline(
  userId: string,
  backtestId: string,
  database: CustomShellDb = db
): Promise<unknown | null> {
  const [row] = await database
    .select({ timeline: tradingBacktests.timeline })
    .from(tradingBacktests)
    .where(
      and(
        eq(tradingBacktests.id, backtestId),
        eq(tradingBacktests.userId, userId)
      )
    )
    .limit(1)
  return row?.timeline ?? null
}
