import { eq } from "drizzle-orm"

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
