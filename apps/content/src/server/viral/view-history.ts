import { and, gte, inArray, sql } from "drizzle-orm"

import { growthFrom, NO_GROWTH, viewDay, type ViralGrowth } from "@/lib/viral/rising"
import { db, type CustomShellDb } from "@/server/db"
import { viralViewHistory } from "@/server/viral/schema"

/**
 * The daily views figures behind Rising fast (`workspace/docs/sorts-and-score.md`).
 * Every keyword search and every creator read already carries each video's
 * views, so writing them down here costs no extra YouTube unit. A second
 * reading on the same day keeps the higher figure, because views only go up.
 */

export type ViewReading = { platform: string; platformVideoId: string; views: number | null }

export async function recordViews(readings: ViewReading[], at: Date, database: CustomShellDb = db) {
  const day = viewDay(at)
  const rows = new Map<string, { platform: string; platformVideoId: string; day: string; views: number }>()
  for (const reading of readings) {
    if (reading.views === null || !Number.isFinite(reading.views)) continue
    const key = `${reading.platform}:${reading.platformVideoId}`
    const was = rows.get(key)
    if (!was || was.views < reading.views) {
      rows.set(key, { platform: reading.platform, platformVideoId: reading.platformVideoId, day, views: reading.views })
    }
  }
  if (!rows.size) return
  await database
    .insert(viralViewHistory)
    .values([...rows.values()])
    .onConflictDoUpdate({
      target: [viralViewHistory.platform, viralViewHistory.platformVideoId, viralViewHistory.day],
      set: { views: sql`greatest(${viralViewHistory.views}, excluded.views)` },
    })
}

/** Each video's growth since the day before, by `platform:platformVideoId`. */
export async function growthByKey(
  videos: { platform: string; platformVideoId: string }[],
  at: Date,
  database: CustomShellDb = db
): Promise<Map<string, ViralGrowth>> {
  const growth = new Map<string, ViralGrowth>()
  if (!videos.length) return growth
  const today = viewDay(at)
  const since = viewDay(new Date(at.getTime() - 3 * 24 * 60 * 60 * 1000))
  const byPlatform = new Map<string, string[]>()
  for (const video of videos) {
    byPlatform.set(video.platform, [...(byPlatform.get(video.platform) ?? []), video.platformVideoId])
  }
  const rows = (
    await Promise.all(
      [...byPlatform].map(([platform, ids]) =>
        database
          .select()
          .from(viralViewHistory)
          .where(
            and(
              sql`${viralViewHistory.platform} = ${platform}`,
              inArray(viralViewHistory.platformVideoId, [...new Set(ids)]),
              gte(viralViewHistory.day, since)
            )
          )
      )
    )
  ).flat()
  const days = new Map<string, { day: string; views: number }[]>()
  for (const row of rows) {
    const key = `${row.platform}:${row.platformVideoId}`
    days.set(key, [...(days.get(key) ?? []), { day: row.day, views: row.views }])
  }
  for (const video of videos) {
    const key = `${video.platform}:${video.platformVideoId}`
    growth.set(key, growthFrom(days.get(key) ?? [], today) ?? NO_GROWTH)
  }
  return growth
}
