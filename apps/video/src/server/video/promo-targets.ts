import { and, desc, eq, isNotNull, or } from "drizzle-orm"

import type { PromoSendView } from "@/lib/video/promo"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { listPromoSends } from "@/server/video/promo-sends"
import { videoCarousels, videoProjectVideos, videoRenderJobs } from "@/server/video/schema"

/**
 * What Send to Promo opens on from somewhere other than the Exports page
 * (`workspace/docs/send-to-promo.md`): a video's or carousel's newest
 * finished export, or one export named by id, with whether it has language
 * copies and where it was sent before.
 */
export type PromoTarget = {
  exportId: string
  name: string
  kind: "video" | "carousel"
  sourceProjectId: string | null
  hasLanguageCopies: boolean
  earlier: PromoSendView[]
}

export async function promoTargetFor(
  userId: string,
  which: { exportId?: string; videoId?: string; carouselId?: string },
  db: CustomShellDb = defaultDb
): Promise<PromoTarget | null> {
  const mine = and(eq(videoRenderJobs.userId, userId), eq(videoRenderJobs.status, "ready"), isNotNull(videoRenderJobs.storagePath))
  const where = which.exportId
    ? and(mine, eq(videoRenderJobs.id, which.exportId))
    : which.videoId
      ? and(mine, eq(videoRenderJobs.kind, "video"), eq(videoRenderJobs.videoId, which.videoId))
      : which.carouselId
        ? and(mine, eq(videoRenderJobs.kind, "carousel"), eq(videoRenderJobs.carouselId, which.carouselId))
        : null
  if (!where) return null
  const [row] = await db.select().from(videoRenderJobs).where(where).orderBy(desc(videoRenderJobs.finishedAt)).limit(1)
  if (!row) return null

  let sourceProjectId: string | null = row.projectId
  let name = row.title ?? ""
  let hasLanguageCopies = false
  if (row.kind === "carousel" && row.carouselId) {
    const [carousel] = await db
      .select({ name: videoCarousels.name, carouselProjectId: videoCarousels.carouselProjectId })
      .from(videoCarousels)
      .where(eq(videoCarousels.id, row.carouselId))
      .limit(1)
    sourceProjectId = carousel?.carouselProjectId ?? null
    name ||= carousel?.name ?? ""
  } else if (row.videoId) {
    const [video] = await db
      .select({ id: videoProjectVideos.id, name: videoProjectVideos.name, languageOf: videoProjectVideos.languageOf })
      .from(videoProjectVideos)
      .where(eq(videoProjectVideos.id, row.videoId))
      .limit(1)
    name ||= video?.name ?? ""
    if (video) {
      const original = video.languageOf ?? video.id
      const family = await db
        .select({ id: videoProjectVideos.id })
        .from(videoProjectVideos)
        .where(and(eq(videoProjectVideos.userId, userId), or(eq(videoProjectVideos.id, original), eq(videoProjectVideos.languageOf, original))))
        .limit(2)
      hasLanguageCopies = family.length > 1
    }
  }
  return {
    exportId: row.id,
    name: name || "This export",
    kind: row.kind === "carousel" ? "carousel" : "video",
    sourceProjectId,
    hasLanguageCopies,
    earlier: await listPromoSends(userId, { exportIds: [row.id] }, db),
  }
}
