import { PGlite } from "@electric-sql/pglite"
import { count } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  cleanTradeCaches,
  TRADE_CACHE_KEEP_DAYS,
} from "@/server/trade/cache-cleanup"
import {
  tradeBacktestGroups,
  tradeBacktests,
  tradeCandleCoverage,
  tradeCandleGaps,
  tradeCandles,
  tradeFundingCoverage,
  tradeFundingGaps,
  tradeFundingRates,
} from "@/server/trade/schema"

const DAY_MS = 86_400_000
const NOW = new Date("2026-08-28T12:00:00.000Z")
const CUTOFF = NOW.getTime() - TRADE_CACHE_KEEP_DAYS * DAY_MS

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function seedCacheRows(): Promise<void> {
  // A whole minute before the cutoff, so the old coverage piece ends before
  // it too; a piece running past the cutoff is trimmed rather than removed.
  const old = CUTOFF - 60_001
  const kept = CUTOFF

  await db
    .insert(tradeCandles)
    .values([candle("old", old), candle("kept", kept)])
  await db
    .insert(tradeCandleCoverage)
    .values([coverage("old", old), coverage("kept", kept)])
  await db
    .insert(tradeCandleGaps)
    .values([candleGap("old", old), candleGap("kept", kept)])
  await db.insert(tradeFundingRates).values([
    { marketKey: "old", time: old, rate: 0.001 },
    { marketKey: "kept", time: kept, rate: 0.001 },
  ])
  await db
    .insert(tradeFundingCoverage)
    .values([fundingCoverage("old", old), fundingCoverage("kept", kept)])
  await db.insert(tradeFundingGaps).values([gap("old", old), gap("kept", kept)])
}

describe("trade cache cleanup", () => {
  it("removes only rebuildable rows older than the longest backtest window", async () => {
    await seedCacheRows()

    await expect(cleanTradeCaches(db, NOW)).resolves.toEqual({
      candles: 1,
      candleCoverage: 1,
      candleGaps: 1,
      fundingRates: 1,
      fundingCoverage: 1,
      fundingGaps: 1,
    })

    for (const table of CACHE_TABLES) {
      const [remaining] = await db.select({ value: count() }).from(table)
      expect(remaining.value).toBe(1)
    }
  })

  it("trims a coverage piece that runs past the cutoff rather than forgetting it", async () => {
    // Gold's 4-hour coverage ran from 2003 to today in one piece. Deleting
    // it forgot every year still stored, and the next open fetched them all.
    await db.insert(tradeCandleCoverage).values({
      marketKey: "dukascopy:mainnet:xauusd",
      interval: "4h",
      fromTime: CUTOFF - 10 * DAY_MS,
      toTime: CUTOFF + 10 * DAY_MS,
    })
    await db.insert(tradeFundingCoverage).values({
      marketKey: "binance:mainnet:BTC",
      fromTime: CUTOFF - 10 * DAY_MS,
      toTime: CUTOFF + 10 * DAY_MS,
    })

    const counts = await cleanTradeCaches(db, NOW)

    expect(counts.candleCoverage).toBe(0)
    expect(counts.fundingCoverage).toBe(0)
    const [piece] = await db.select().from(tradeCandleCoverage)
    expect(piece.fromTime).toBe(CUTOFF)
    expect(piece.toTime).toBe(CUTOFF + 10 * DAY_MS)
    const [funding] = await db.select().from(tradeFundingCoverage)
    expect(funding.fromTime).toBe(CUTOFF)
  })

  it("leaves every cache alone while a backtest is waiting", async () => {
    await seedCacheRows()
    const user = await insertUser(db)
    await db.insert(tradeBacktestGroups).values({
      userId: user.id,
      id: "group-1",
      automationId: "flow-1",
      automationName: "Cache safety",
      spec: {} as typeof tradeBacktestGroups.$inferInsert.spec,
    })
    await db.insert(tradeBacktests).values({
      userId: user.id,
      id: "run-1",
      groupId: "group-1",
      marketKey: "hyperliquid:mainnet:BTC",
      symbol: "BTC",
      status: "waiting",
    })

    await expect(cleanTradeCaches(db, NOW)).resolves.toEqual({
      candles: 0,
      candleCoverage: 0,
      candleGaps: 0,
      fundingRates: 0,
      fundingCoverage: 0,
      fundingGaps: 0,
    })

    for (const table of CACHE_TABLES) {
      const [remaining] = await db.select({ value: count() }).from(table)
      expect(remaining.value).toBe(2)
    }
  })
})

const CACHE_TABLES = [
  tradeCandles,
  tradeCandleCoverage,
  tradeCandleGaps,
  tradeFundingRates,
  tradeFundingCoverage,
  tradeFundingGaps,
] as const

function candle(marketKey: string, openTime: number) {
  return {
    marketKey,
    interval: "1m" as const,
    openTime,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
  }
}

function coverage(marketKey: string, fromTime: number) {
  return {
    marketKey,
    interval: "1m" as const,
    fromTime,
    toTime: fromTime + 60_000,
  }
}

function fundingCoverage(marketKey: string, fromTime: number) {
  return {
    marketKey,
    fromTime,
    toTime: fromTime + 60_000,
  }
}

function gap(marketKey: string, fromTime: number) {
  return {
    marketKey,
    fromTime,
    toTime: fromTime + 60_000,
    reason: "not available",
  }
}

function candleGap(marketKey: string, fromTime: number) {
  return { ...gap(marketKey, fromTime), interval: "1m" as const }
}
