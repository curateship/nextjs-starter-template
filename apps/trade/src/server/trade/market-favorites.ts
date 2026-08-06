import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { tradeMarketFavorites } from "@/server/trade/schema"

/** The market keys this person has starred, oldest star first. */
export async function loadMarketFavoriteKeys(userId: string): Promise<string[]> {
  const row = await db
    .select({ marketKeys: tradeMarketFavorites.marketKeys })
    .from(tradeMarketFavorites)
    .where(eq(tradeMarketFavorites.userId, userId))
    .limit(1)
  return row[0]?.marketKeys ?? []
}

/**
 * Replaces the whole list, the way the automation favourites save does: the
 * screen sends what the stars look like now, and the answer is what got
 * saved. One row per person, written whole, so there is no set of partial
 * updates to get out of order.
 */
export async function saveMarketFavoriteKeys(
  userId: string,
  marketKeys: string[]
): Promise<string[]> {
  // De-duplicated on the way in; two stars on one market is a double-click,
  // not an intention.
  const unique = [...new Set(marketKeys)]
  await db
    .insert(tradeMarketFavorites)
    .values({ userId, marketKeys: unique, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradeMarketFavorites.userId,
      set: { marketKeys: unique, updatedAt: new Date() },
    })
  return unique
}
