import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm"

import type { BacktestCosts, BacktestResult } from "@/lib/backtest/types"
import type { StrategyConfig } from "@/lib/strategies/strategy-config"
import { db, type CustomShellDb } from "@/server/db"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import {
  tradingBacktests,
  type TradingBacktest,
} from "@/server/schema"
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
  params: StrategyConfig
  costs: BacktestCosts
  startTime: Date
  endTime: Date
  startingEquity: number
}

/** The config columns shared by create and reset. */
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

/** Inserts a running backtest row; the caller computes and finishes it. */
export async function createUserBacktest(
  userId: string,
  input: CreateBacktestInput,
  database: CustomShellDb = db
): Promise<TradingBacktest> {
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
      createdAt: now(),
    })
    .returning()
  if (!row) throw new Error("Backtest was not created")
  return row
}

/**
 * Re-runs an existing row in place: rewrites its config and puts it back in
 * "running" with the old result cleared. Keeps the id, so group lineage (and
 * the main row's id == groupId) survives re-runs.
 */
export async function resetUserBacktest(
  userId: string,
  backtestId: string,
  input: CreateBacktestInput,
  database: CustomShellDb = db
): Promise<TradingBacktest> {
  const [row] = await database
    .update(tradingBacktests)
    .set({
      ...backtestConfigValues(input),
      // Requeued; the background queue claims it and stamps startedAt on run.
      status: "pending",
      error: null,
      result: null,
      resultStats: null,
      startedAt: null,
      completedAt: null,
    })
    .where(
      and(
        eq(tradingBacktests.id, backtestId),
        eq(tradingBacktests.userId, userId)
      )
    )
    .returning()
  if (!row) throw new Error("Backtest was not found")
  return row
}

/** Marks a backtest done and stores its result (+ compact list stats). */
export async function finishUserBacktest(
  backtestId: string,
  result: BacktestResult,
  database: CustomShellDb = db
) {
  await database
    .update(tradingBacktests)
    .set({
      status: "done",
      result,
      resultStats: {
        ...result.stats,
        firstEntryMs: result.trades[0]?.entryTime ?? null,
        lastExitMs: result.trades[result.trades.length - 1]?.exitTime ?? null,
      },
      completedAt: now(),
    })
    .where(eq(tradingBacktests.id, backtestId))
}

/** Marks a backtest failed with a short error message. */
export async function failUserBacktest(
  backtestId: string,
  error: string,
  database: CustomShellDb = db
) {
  await database
    .update(tradingBacktests)
    .set({ status: "error", error: error.slice(0, 400), completedAt: now() })
    .where(eq(tradingBacktests.id, backtestId))
}

/**
 * Atomically claims the oldest queued (`pending`) row for the background queue:
 * picks one with `FOR UPDATE SKIP LOCKED` so parallel drainers never grab the
 * same row, flips it to `running`, and returns the full row to execute. Returns
 * null when the queue is empty.
 */
export async function claimNextPendingBacktest(
  database: CustomShellDb = db
): Promise<TradingBacktest | null> {
  return database.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: tradingBacktests.id })
      .from(tradingBacktests)
      .where(eq(tradingBacktests.status, "pending"))
      .orderBy(asc(tradingBacktests.createdAt))
      .limit(1)
      .for("update", { skipLocked: true })
    if (!candidate) return null
    const [row] = await tx
      .update(tradingBacktests)
      .set({ status: "running", startedAt: now() })
      .where(eq(tradingBacktests.id, candidate.id))
      .returning()
    return row ?? null
  })
}

/**
 * Restart recovery: any row left `running` was orphaned when the server stopped
 * (nothing is computing it now), so put it back in the queue as `pending`.
 * Returns how many were requeued.
 */
export async function resetOrphanedRunning(
  database: CustomShellDb = db
): Promise<number> {
  const rows = await database
    .update(tradingBacktests)
    .set({ status: "pending", startedAt: null })
    .where(eq(tradingBacktests.status, "running"))
    .returning({ id: tradingBacktests.id })
  return rows.length
}

/** The run's strategy identity from the config JSON: its indicator id, or the
 * config kind ("automation") for strategies that have no indicator. */
const indicatorTypeSql = sql<
  string | null
>`coalesce(${tradingBacktests.params} #>> '{indicator,type}', ${tradingBacktests.params} ->> 'kind')`

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
    .select({
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
      // First order opened / last order closed — drives the "Days" (active
      // trading span) column, which varies per coin unlike the padded window.
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
  input: { groupIds: string[]; reviewStatus?: "review" | "archived"; pinned?: boolean },
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
