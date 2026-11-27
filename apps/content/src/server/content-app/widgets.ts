import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoProjects } from "@/server/social/schema"
import { videoProjectVideos } from "@/server/video/schema"
import { viralProjectResults } from "@/server/viral/schema"

/**
 * The two Overview widgets Content adds to the Projects dashboard's
 * (`workspace/docs/content-app.md`, "The Projects dashboard"): what Research
 * found in the last day, and the videos still drafts, one row per project,
 * each opening that project.
 */

/** A day, in milliseconds: Found today means the last 24 hours. */
const DAY_MS = 24 * 60 * 60 * 1000

export type FoundTodayRow = { projectId: string; projectName: string; found: number; fresh: number }
export type DraftVideoRow = { projectId: string; projectName: string; videoId: string; name: string; updatedAt: string }

/** Each project's videos Research found in the last 24 hours, most first. */
export async function readFoundToday(userId: string, database: CustomShellDb = defaultDb, at = new Date()): Promise<FoundTodayRow[]> {
  const rows = await database
    .select({
      projectId: promoProjects.id,
      projectName: promoProjects.name,
      found: count(),
      fresh: sql<number>`count(*) filter (where ${viralProjectResults.isNew})`.mapWith(Number),
    })
    .from(viralProjectResults)
    .innerJoin(promoProjects, eq(promoProjects.id, viralProjectResults.projectId))
    .where(and(eq(promoProjects.userId, userId), gt(viralProjectResults.foundAt, new Date(at.getTime() - DAY_MS))))
    .groupBy(promoProjects.id, promoProjects.name)
  return rows.sort((a, b) => b.found - a.found)
}

/** The videos still drafts, last edited first, at most 20. */
export async function readDraftVideos(userId: string, database: CustomShellDb = defaultDb): Promise<DraftVideoRow[]> {
  const rows = await database
    .select({
      projectId: promoProjects.id,
      projectName: promoProjects.name,
      videoId: videoProjectVideos.id,
      name: videoProjectVideos.name,
      updatedAt: videoProjectVideos.updatedAt,
    })
    .from(videoProjectVideos)
    .innerJoin(promoProjects, eq(promoProjects.id, videoProjectVideos.projectId))
    .where(
      and(
        eq(promoProjects.userId, userId),
        eq(videoProjectVideos.status, "draft"),
        isNull(videoProjectVideos.archivedAt)
      )
    )
    .orderBy(desc(videoProjectVideos.updatedAt))
    .limit(20)
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }))
}
