import { eq } from "drizzle-orm"

import {
  defaultExplorerPrefs,
  explorerPrefsSchema,
  type ExplorerPrefs,
} from "@/lib/trade/market-explorer"
import { db } from "@/server/db"
import { tradePrefs } from "@/server/trade/schema"
import { readMinimumMarketVolume } from "@/lib/trade/market-volume"

export async function loadExplorerPrefs(userId: string) {
  const [row] = await db
    .select({
      marketExplorer: tradePrefs.marketExplorer,
      minimumVolume: tradePrefs.minimumMarketVolumeUsd,
    })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return {
    prefs:
      row?.marketExplorer == null
        ? defaultExplorerPrefs()
        : explorerPrefsSchema.parse(row.marketExplorer),
    minimumVolume: readMinimumMarketVolume(row?.minimumVolume),
  }
}

export async function saveExplorerPrefs(userId: string, prefs: ExplorerPrefs) {
  await db
    .insert(tradePrefs)
    .values({ userId, marketExplorer: prefs, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { marketExplorer: prefs, updatedAt: new Date() },
    })
}
