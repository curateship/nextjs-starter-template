import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm"

import type { BacktestCosts, BacktestResult } from "@/lib/backtest/types"
import type { RiskParams, StrategyParams } from "@/lib/strategies/params"
import { db, type CustomShellDb } from "@/server/db"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import {
  tradingBacktests,
  tradingStrategyDefaults,
  tradingStrategyTemplates,
  type TradingBacktest,
} from "@/server/schema"
import { now, uuid } from "@/server/util"

export type CreateBacktestInput = {
  name: string
  /** Market-group lineage; omitted for the first row (group = its own id). */
  groupId?: string
  market: string
  network: TradingNetwork
  interval: string
  params: StrategyParams
  riskParams: RiskParams
  costs: BacktestCosts
  startTime: Date
  endTime: Date
  startingEquity: number
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
      name: input.name.slice(0, 255),
      strategyType: input.params.strategyType,
      market: input.market,
      network: input.network,
      interval: input.interval,
      params: input.params,
      riskParams: input.riskParams,
      costs: input.costs,
      startTime: input.startTime,
      endTime: input.endTime,
      startingEquity: String(input.startingEquity),
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
      name: input.name.slice(0, 255),
      strategyType: input.params.strategyType,
      market: input.market,
      network: input.network,
      interval: input.interval,
      params: input.params,
      riskParams: input.riskParams,
      costs: input.costs,
      startTime: input.startTime,
      endTime: input.endTime,
      startingEquity: String(input.startingEquity),
      // Requeued; the background queue claims it and stamps startedAt on run.
      status: "pending",
      error: null,
      result: null,
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

/** Marks a backtest done and stores its result. */
export async function finishUserBacktest(
  backtestId: string,
  result: BacktestResult,
  database: CustomShellDb = db
) {
  await database
    .update(tradingBacktests)
    .set({ status: "done", result, completedAt: now() })
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

/** Recent runs for the list page + header dropdown; omits the heavy result. */
export async function listUserBacktests(
  userId: string,
  options: {
    strategyType?: string
    page?: number
    pageSize?: number
  } = {},
  database: CustomShellDb = db
) {
  const page = Math.max(1, options.page ?? 1)
  const maxPageSize = options.strategyType ? 100 : 500
  const pageSize = Math.min(Math.max(1, options.pageSize ?? 500), maxPageSize)
  const where = options.strategyType
    ? and(
        eq(tradingBacktests.userId, userId),
        eq(tradingBacktests.strategyType, options.strategyType)
      )
    : eq(tradingBacktests.userId, userId)

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
      strategyType: tradingBacktests.strategyType,
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
      >`(${tradingBacktests.result} #>> '{stats,netPnl}')`,
      netPnlPct: sql<
        string | null
      >`(${tradingBacktests.result} #>> '{stats,netPnlPct}')`,
      tradeCount: sql<
        string | null
      >`(${tradingBacktests.result} #>> '{stats,all,trades}')`,
      maxDrawdownPct: sql<
        string | null
      >`(${tradingBacktests.result} #>> '{stats,maxDrawdownPct}')`,
      winRate: sql<
        string | null
      >`(${tradingBacktests.result} #>> '{stats,all,winRate}')`,
      sharpe: sql<
        string | null
      >`(${tradingBacktests.result} #>> '{stats,all,sharpe}')`,
      // First order opened / last order closed — drives the "Days" (active
      // trading span) column, which varies per coin unlike the padded window.
      firstEntryMs: sql<
        string | null
      >`(${tradingBacktests.result} #>> '{trades,0,entryTime}')`,
      lastExitMs: sql<
        string | null
      >`(${tradingBacktests.result} -> 'trades' -> -1 ->> 'exitTime')`,
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
  /** Everything belonging to these strategies. */
  strategyTypes?: string[]
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
  if (filter.strategyTypes?.length) {
    facets.push(inArray(tradingBacktests.strategyType, filter.strategyTypes))
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

/**
 * Per-user New Run seeds, keyed by strategy type. The stored object is the
 * full run config `{params, interval?, windowDays?, equity?, ...costs}` —
 * the save path validates the shape, so rows are read as-is.
 */
export async function getUserStrategyDefaults(
  userId: string,
  database: CustomShellDb = db
): Promise<Record<string, Record<string, unknown>>> {
  const rows = await database
    .select({
      strategyType: tradingStrategyDefaults.strategyType,
      params: tradingStrategyDefaults.params,
    })
    .from(tradingStrategyDefaults)
    .where(eq(tradingStrategyDefaults.userId, userId))

  const defaults: Record<string, Record<string, unknown>> = {}
  for (const row of rows) {
    defaults[row.strategyType] = row.params as Record<string, unknown>
  }
  return defaults
}

export async function saveUserStrategyDefaults(
  userId: string,
  strategyType: string,
  defaults: Record<string, unknown>,
  database: CustomShellDb = db
) {
  await database
    .insert(tradingStrategyDefaults)
    .values({ userId, strategyType, params: defaults, updatedAt: now() })
    .onConflictDoUpdate({
      target: [
        tradingStrategyDefaults.userId,
        tradingStrategyDefaults.strategyType,
      ],
      set: { params: defaults, updatedAt: now() },
    })
}

/**
 * Named run-config templates for a user — many per strategy, alongside the
 * single main default. `params` is the same full run config as the default.
 */
export async function listUserStrategyTemplates(
  userId: string,
  database: CustomShellDb = db
): Promise<
  { id: string; strategyType: string; name: string; params: Record<string, unknown> }[]
> {
  const rows = await database
    .select({
      id: tradingStrategyTemplates.id,
      strategyType: tradingStrategyTemplates.strategyType,
      name: tradingStrategyTemplates.name,
      params: tradingStrategyTemplates.params,
    })
    .from(tradingStrategyTemplates)
    .where(eq(tradingStrategyTemplates.userId, userId))
    .orderBy(asc(tradingStrategyTemplates.name))

  return rows.map((row) => ({
    id: row.id,
    strategyType: row.strategyType,
    name: row.name,
    params: row.params as Record<string, unknown>,
  }))
}

/**
 * Saves a template. With `id`, updates that user's existing row (and errors if
 * it's gone); otherwise inserts, overwriting any of the user's templates with
 * the same (strategy, name). Returns the row id.
 */
export async function saveUserStrategyTemplate(
  userId: string,
  input: {
    id?: string
    strategyType: string
    name: string
    params: Record<string, unknown>
  },
  database: CustomShellDb = db
): Promise<{ id: string }> {
  if (input.id) {
    const updated = await database
      .update(tradingStrategyTemplates)
      .set({ name: input.name, params: input.params, updatedAt: now() })
      .where(
        and(
          eq(tradingStrategyTemplates.id, input.id),
          eq(tradingStrategyTemplates.userId, userId)
        )
      )
      .returning({ id: tradingStrategyTemplates.id })
    if (!updated[0]) {
      throw new Error("Template not found — it may have been deleted.")
    }
    return { id: updated[0].id }
  }

  const id = uuid()
  const [row] = await database
    .insert(tradingStrategyTemplates)
    .values({
      id,
      userId,
      strategyType: input.strategyType,
      name: input.name,
      params: input.params,
      createdAt: now(),
      updatedAt: now(),
    })
    .onConflictDoUpdate({
      target: [
        tradingStrategyTemplates.userId,
        tradingStrategyTemplates.strategyType,
        tradingStrategyTemplates.name,
      ],
      set: { params: input.params, updatedAt: now() },
    })
    .returning({ id: tradingStrategyTemplates.id })
  return { id: row.id }
}

export async function deleteUserStrategyTemplate(
  userId: string,
  id: string,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .delete(tradingStrategyTemplates)
    .where(
      and(
        eq(tradingStrategyTemplates.id, id),
        eq(tradingStrategyTemplates.userId, userId)
      )
    )
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
