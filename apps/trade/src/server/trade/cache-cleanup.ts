import { inArray, lt, sql, type SQL } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"

import { MAX_BACKTEST_DAYS } from "@/lib/recipes/trade-markets"
import { db, type CustomShellDb } from "@/server/db"
import {
  tradeBacktests,
  tradeCandleCoverage,
  tradeCandleGaps,
  tradeCandles,
  tradeFundingCoverage,
  tradeFundingGaps,
  tradeFundingRates,
} from "@/server/trade/schema"

const DAY_MS = 86_400_000
export const TRADE_CACHE_KEEP_DAYS = MAX_BACKTEST_DAYS
export const TRADE_CACHE_SWEEP_BATCH = 10_000

export type TradeCacheCleanupCounts = {
  candles: number
  candleCoverage: number
  candleGaps: number
  fundingRates: number
  fundingCoverage: number
  fundingGaps: number
}

const EMPTY_COUNTS: TradeCacheCleanupCounts = {
  candles: 0,
  candleCoverage: 0,
  candleGaps: 0,
  fundingRates: 0,
  fundingCoverage: 0,
  fundingGaps: 0,
}

/**
 * Trims only exchange data that can be fetched again. Trading records and
 * completed backtests are deliberately absent.
 */
export async function cleanTradeCaches(
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<TradeCacheCleanupCounts> {
  const [active] = await database
    .select({ id: tradeBacktests.id })
    .from(tradeBacktests)
    .where(inArray(tradeBacktests.status, ["waiting", "running"]))
    .limit(1)
  if (active) return { ...EMPTY_COUNTS }

  const cutoff = at.getTime() - TRADE_CACHE_KEEP_DAYS * DAY_MS
  return database.transaction(async (tx) => ({
    candles: await deleteCapped(
      tx,
      tradeCandles,
      lt(tradeCandles.openTime, cutoff)
    ),
    candleCoverage: await deleteCapped(
      tx,
      tradeCandleCoverage,
      lt(tradeCandleCoverage.fromTime, cutoff)
    ),
    candleGaps: await deleteCapped(
      tx,
      tradeCandleGaps,
      lt(tradeCandleGaps.fromTime, cutoff)
    ),
    fundingRates: await deleteCapped(
      tx,
      tradeFundingRates,
      lt(tradeFundingRates.time, cutoff)
    ),
    fundingCoverage: await deleteCapped(
      tx,
      tradeFundingCoverage,
      lt(tradeFundingCoverage.fromTime, cutoff)
    ),
    fundingGaps: await deleteCapped(
      tx,
      tradeFundingGaps,
      lt(tradeFundingGaps.fromTime, cutoff)
    ),
  }))
}

/** PostgreSQL has no DELETE LIMIT, so select physical rows before deleting. */
async function deleteCapped(
  database: CustomShellDb,
  table: PgTable,
  where: SQL
): Promise<number> {
  const deleted = await database.execute(sql`
    with doomed as (
      select ctid
      from ${table}
      where ${where}
      limit ${TRADE_CACHE_SWEEP_BATCH}
    )
    delete from ${table}
    where ctid in (select ctid from doomed)
    returning 1
  `)
  return deleted.rows.length
}

let lastSweepDay: string | null = null

export function resetTradeCacheSweepForTests(): void {
  lastSweepDay = null
}

/** Runs at most once a day per web process, off a real dashboard request. */
export async function maybeCleanTradeCaches(
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<void> {
  const day = at.toISOString().slice(0, 10)
  if (lastSweepDay === day) return
  lastSweepDay = day
  try {
    await cleanTradeCaches(database, at)
  } catch (error) {
    console.error("Trade cache cleanup failed", error)
  }
}
