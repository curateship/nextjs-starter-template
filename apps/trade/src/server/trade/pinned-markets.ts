import { eq } from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import {
  changePinnedMarkets,
  normalizePinnedMarkets,
} from "@/lib/trade/pinned-markets"
import { db, type CustomShellDb } from "@/server/db"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import { getProtocol } from "@/server/protocols/registry"
import { tradePrefs } from "@/server/trade/schema"

export async function loadPinnedMarkets(
  userId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ pins: tradePrefs.pinnedMarkets })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return normalizePinnedMarkets(row?.pins)
}

/** Apply one change under a row lock so two browsers cannot overwrite each other. */
export async function savePinnedMarket(
  userId: string,
  key: string,
  pinned: boolean,
  database: CustomShellDb = db
) {
  if (pinned) {
    const ref = parseMarketKey(key)
    if (!ref || !normalizePinnedMarkets([key]).length)
      throw new Error("That market cannot be pinned to the header.")
    if (!getProtocol(ref.protocol).networks.includes(ref.network))
      throw new Error("That exchange does not offer this network.")
    const catalog = await loadRawMarketCatalog(ref.protocol, ref.network)
    if (!catalog.rows.some((row) => row.key === key))
      throw new Error("That market is no longer listed. Choose another market.")
  }
  return database.transaction(async (tx) => {
    await tx.insert(tradePrefs).values({ userId }).onConflictDoNothing()
    const [row] = await tx
      .select({ pins: tradePrefs.pinnedMarkets })
      .from(tradePrefs)
      .where(eq(tradePrefs.userId, userId))
      .for("update")
    const pins = normalizePinnedMarkets(row?.pins)
    let next: string[]
    try {
      next = changePinnedMarkets(pins, key, pinned)
    } catch (error) {
      return {
        pins,
        error:
          error instanceof Error
            ? error.message
            : "The pin could not be saved.",
      }
    }
    await tx
      .update(tradePrefs)
      .set({ pinnedMarkets: next, updatedAt: new Date() })
      .where(eq(tradePrefs.userId, userId))
    return { pins: next, error: null }
  })
}
