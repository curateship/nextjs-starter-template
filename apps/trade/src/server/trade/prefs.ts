import { eq } from "drizzle-orm"

import { readChartView, type ChartView } from "@/lib/trade/chart-view"
import { db } from "@/server/db"
import { tradePrefs } from "@/server/trade/schema"

/** The market this person was last looking at, or null on a first visit. */
export async function loadLastMarketKey(userId: string): Promise<string | null> {
  const row = await db
    .select({ lastMarketKey: tradePrefs.lastMarketKey })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return row[0]?.lastMarketKey ?? null
}

/** Remember it — whole-row upsert, the same shape the favourites save uses. */
export async function saveLastMarketKey(
  userId: string,
  lastMarketKey: string
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, lastMarketKey, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { lastMarketKey, updatedAt: new Date() },
    })
}

/**
 * How far the chart was zoomed and scrolled, or null on a first visit.
 *
 * Read back through the same validator it went in through: a value written by
 * a build that meant something else by it is dropped, and the chart frames its
 * own history instead — never applied as a view it is not.
 */
export async function loadChartView(userId: string): Promise<ChartView | null> {
  const row = await db
    .select({ chartView: tradePrefs.chartView })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readChartView(row[0]?.chartView ?? null)
}

/** Remember it. */
export async function saveChartView(
  userId: string,
  chartView: ChartView
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, chartView, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { chartView, updatedAt: new Date() },
    })
}

/** The wallet the account panel was last showing, or null on a first visit. */
export async function loadLastWalletId(
  userId: string
): Promise<string | null> {
  const row = await db
    .select({ lastWalletId: tradePrefs.lastWalletId })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return row[0]?.lastWalletId ?? null
}

/**
 * Remember it. Null clears the memory, which is what deleting the wallet that
 * was showing does — a memory pointing at nothing is worse than none.
 */
export async function saveLastWalletId(
  userId: string,
  lastWalletId: string | null
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, lastWalletId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { lastWalletId, updatedAt: new Date() },
    })
}
