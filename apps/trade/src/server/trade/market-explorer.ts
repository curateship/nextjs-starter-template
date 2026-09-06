import { eq, sql } from "drizzle-orm"

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
      set: {
        marketExplorer: sql`jsonb_set(jsonb_set(${JSON.stringify(prefs)}::jsonb, '{discoverySound}', COALESCE(${tradePrefs.marketExplorer}->'discoverySound', 'false'::jsonb)), '{lastVisit}', to_jsonb(GREATEST(COALESCE((${tradePrefs.marketExplorer}->>'lastVisit')::numeric, 0), ${prefs.lastVisit}::numeric)))`,
        updatedAt: new Date(),
      },
    })
}

export async function saveExplorerSound(userId: string, enabled: boolean) {
  const initial = { ...defaultExplorerPrefs(), discoverySound: enabled }
  await db
    .insert(tradePrefs)
    .values({ userId, marketExplorer: initial, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: {
        marketExplorer: sql`jsonb_set(COALESCE(${tradePrefs.marketExplorer}, ${JSON.stringify(defaultExplorerPrefs())}::jsonb), '{discoverySound}', ${JSON.stringify(enabled)}::jsonb)`,
        updatedAt: new Date(),
      },
    })
  return enabled
}
