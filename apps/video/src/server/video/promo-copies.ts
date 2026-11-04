import { and, desc, eq, inArray, or } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { videoProjectVideos, videoRenderJobs } from "@/server/video/schema"

/**
 * "With every language copy" in the send window (part 11): each video
 * export brings the newest ready export of each of its language copies, in
 * the same shape, and every one of them carries the original video's id so
 * Promo keeps them together. A copy never exported in that shape is left
 * out and listed as skipped.
 */
export async function withLanguageCopies(
  userId: string,
  exportIds: string[],
  db: CustomShellDb = defaultDb
): Promise<{ exportIds: string[]; groupKeys: Record<string, string>; skipped: string[] }> {
  if (!exportIds.length) return { exportIds: [], groupKeys: {}, skipped: [] }
  const picked = await db
    .select({
      id: videoRenderJobs.id,
      aspect: videoRenderJobs.aspect,
      videoId: videoRenderJobs.videoId,
      languageOf: videoProjectVideos.languageOf,
    })
    .from(videoRenderJobs)
    .innerJoin(videoProjectVideos, eq(videoProjectVideos.id, videoRenderJobs.videoId))
    .where(and(eq(videoRenderJobs.userId, userId), inArray(videoRenderJobs.id, exportIds), eq(videoRenderJobs.kind, "video")))

  const out = new Set(exportIds)
  const groupKeys: Record<string, string> = {}
  const skipped: string[] = []
  for (const row of picked) {
    const original = row.languageOf ?? row.videoId
    if (!original) continue
    const family = await db
      .select({ id: videoProjectVideos.id, name: videoProjectVideos.name })
      .from(videoProjectVideos)
      .where(and(eq(videoProjectVideos.userId, userId), or(eq(videoProjectVideos.id, original), eq(videoProjectVideos.languageOf, original))))
    if (family.length < 2) continue
    groupKeys[row.id] = original
    for (const member of family) {
      if (member.id === row.videoId) continue
      const [newest] = await db
        .select({ id: videoRenderJobs.id })
        .from(videoRenderJobs)
        .where(
          and(
            eq(videoRenderJobs.userId, userId),
            eq(videoRenderJobs.videoId, member.id),
            eq(videoRenderJobs.aspect, row.aspect),
            eq(videoRenderJobs.status, "ready")
          )
        )
        .orderBy(desc(videoRenderJobs.finishedAt))
        .limit(1)
      if (!newest) {
        skipped.push(member.name)
        continue
      }
      out.add(newest.id)
      groupKeys[newest.id] = original
    }
  }
  return { exportIds: [...out], groupKeys, skipped }
}
