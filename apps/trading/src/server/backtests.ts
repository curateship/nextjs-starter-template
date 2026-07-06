import { and, desc, eq, inArray, or, sql } from "drizzle-orm"

import type { BacktestCosts, BacktestResult } from "@/lib/backtest/types"
import type { RiskParams, StrategyParams } from "@/lib/strategies/params"
import { db, type CustomShellDb } from "@/server/db"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import {
  tradingBacktests,
  tradingStrategyDefaults,
  type TradingBacktest,
} from "@/server/schema"
import { now, uuid } from "@/server/util"

export type CreateBacktestInput = {
  name: string
  /** Re-run lineage; omitted for a fresh run (group = the new row's id). */
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
      status: "running",
      startedAt: now(),
      createdAt: now(),
    })
    .returning()
  if (!row) throw new Error("Backtest was not created")
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

/** Recent runs for the list page + header dropdown; omits the heavy result. */
export async function listUserBacktests(
  userId: string,
  database: CustomShellDb = db
) {
  return database
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
    })
    .from(tradingBacktests)
    .where(eq(tradingBacktests.userId, userId))
    .orderBy(desc(tradingBacktests.createdAt))
    .limit(500)
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
