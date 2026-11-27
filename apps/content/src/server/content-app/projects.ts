import { and, count, eq, inArray, isNull, sql } from "drizzle-orm"

import { ANALYSIS_TOPIC_MAX } from "@/lib/viral/analysis"
import type { VideoStatus } from "@/lib/video/project-videos"
import { projectDescriptionText } from "@/lib/social/project-description"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoProjects } from "@/server/social/schema"
import { videoProjects } from "@/server/video/schema"
import { viralProjectResults, viralProjects, viralVaultItems } from "@/server/viral/schema"

/**
 * One project in Content (`workspace/docs/content-app.md`, "One project").
 *
 * A project is one thing you promote, Promo's meaning (Tyler, 26 Nov 2026:
 * "One thing you promote"). It is a row in `promo_projects`, and its research
 * and its videos are a row in `viral_projects` and a row in `video_projects`
 * **under the same id**. The same id is the link: the project's page, its
 * Research and its video editor all open on it, and nothing has to look one up
 * from another.
 *
 * Research searches with the project's description as its topic, so
 * `viral_projects.topic` is the description's plain words, written here
 * whenever the description is saved.
 */

/** The description's plain words as Research's topic, cut to the length an analysis takes. */
export function researchTopic(description: string) {
  return projectDescriptionText(description).replace(/\s+/g, " ").trim().slice(0, ANALYSIS_TOPIC_MAX)
}

/**
 * Makes the project's research and video rows when they are missing. Run when
 * a project is made or duplicated, and again when its page opens, so a project
 * from before Content, or one whose parts were lost, gets them back. Two tabs
 * opening at once both run it: the rows are keyed by the project's id, and the
 * second insert does nothing.
 */
export async function ensureProjectParts(projectId: string, database: CustomShellDb = defaultDb): Promise<boolean> {
  const [project] = await database
    .select({
      id: promoProjects.id,
      userId: promoProjects.userId,
      name: promoProjects.name,
      description: promoProjects.description,
    })
    .from(promoProjects)
    .where(eq(promoProjects.id, projectId))
    .limit(1)
  if (!project) return false
  const at = new Date()
  await database
    .insert(viralProjects)
    .values({
      id: project.id,
      ownerId: project.userId,
      name: project.name,
      topic: researchTopic(project.description),
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing()
  await database
    .insert(videoProjects)
    .values({ id: project.id, userId: project.userId, name: project.name, createdAt: at, updatedAt: at })
    .onConflictDoNothing()
  return true
}

/**
 * Keeps the research and video rows named as the project is, and Research's
 * topic on its description, after either is saved.
 */
export async function syncProjectParts(projectId: string, database: CustomShellDb = defaultDb) {
  const [project] = await database
    .select({ name: promoProjects.name, description: promoProjects.description })
    .from(promoProjects)
    .where(eq(promoProjects.id, projectId))
    .limit(1)
  if (!project) return
  const at = new Date()
  await database
    .update(viralProjects)
    .set({ name: project.name, topic: researchTopic(project.description), updatedAt: at })
    .where(eq(viralProjects.id, projectId))
  await database.update(videoProjects).set({ name: project.name, updatedAt: at }).where(eq(videoProjects.id, projectId))
}

/**
 * Deletes a project's videos and research before the project itself goes.
 * Video's and Research's own deletes take their files out of storage, so they
 * run here rather than as a cascade, which would leave the files behind. A
 * video whose files would not come out keeps the whole project, with why.
 */
export async function deleteProjectParts(userId: string, projectId: string, database: CustomShellDb = defaultDb) {
  // Imported here: both reach back into the project's own modules.
  const { deleteOwnedProjects } = await import("@/server/video/projects")
  const { deleteViralProjects } = await import("@/server/viral/projects")
  const [video] = await database
    .select({ id: videoProjects.id })
    .from(videoProjects)
    .where(eq(videoProjects.id, projectId))
    .limit(1)
  if (video) {
    const { failed_ids } = await deleteOwnedProjects(userId, [projectId], database, false)
    if (failed_ids.length) {
      throw new Error("A file of one of this project's videos would not come out of storage. Try deleting the project again.")
    }
  }
  await deleteViralProjects(userId, [projectId])
}

/** Which of these ids are projects, so a research or video row is known to belong to one. */
export async function projectIdsAmong(ids: string[], database: CustomShellDb = defaultDb): Promise<Set<string>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Set()
  const rows = await database.select({ id: promoProjects.id }).from(promoProjects).where(inArray(promoProjects.id, unique))
  return new Set(rows.map((row) => row.id))
}

/** The counts on Research's row of tabs, and the videos on Content's Videos tab. */
export type ProjectParts = {
  research: {
    socials: string[]
    pausedSocials: string[]
    /** Every video Research found, and how many are new, per social. */
    found: Record<string, { total: number; fresh: number }>
    vaultCount: number
    sample: boolean
  }
  videos: Array<{ id: string; name: string; status: VideoStatus; durationMs: number; updatedAt: string; archived: boolean }>
}

/** The project's research and videos, made first if missing, for its left panel. */
export async function readProjectParts(userId: string, projectId: string, database: CustomShellDb = defaultDb): Promise<ProjectParts> {
  await ensureProjectParts(projectId, database)
  const [research] = await database
    .select({ socials: viralProjects.socials, pausedSocials: viralProjects.pausedSocials, sample: viralProjects.isSample })
    .from(viralProjects)
    .where(and(eq(viralProjects.id, projectId), eq(viralProjects.ownerId, userId)))
    .limit(1)
  const found = await database
    .select({
      platform: viralProjectResults.platform,
      total: count(),
      fresh: sql<number>`count(*) filter (where ${viralProjectResults.isNew})`.mapWith(Number),
    })
    .from(viralProjectResults)
    .where(eq(viralProjectResults.projectId, projectId))
    .groupBy(viralProjectResults.platform)
  const [vault] = await database
    .select({ n: count() })
    .from(viralVaultItems)
    .where(eq(viralVaultItems.projectId, projectId))
  const { listProjectVideos } = await import("@/server/video/project-videos")
  const listed = await listProjectVideos({ userId, projectId, sort: "edited", database })
  return {
    research: {
      socials: research?.socials ?? [],
      pausedSocials: research?.pausedSocials ?? [],
      found: Object.fromEntries(found.map((row) => [row.platform, { total: row.total, fresh: row.fresh }])),
      vaultCount: vault?.n ?? 0,
      sample: research?.sample ?? false,
    },
    videos: listed.videos.map((video) => ({
      id: video.id,
      name: video.name,
      status: video.status,
      durationMs: video.duration_ms,
      updatedAt: video.updated_at,
      archived: video.archived,
    })),
  }
}

/**
 * Makes a project of every research or video row of this person's that has
 * none, under the same id and name. Research and video rows are still made
 * outside a project's page: Viral's New project, Duplicate and sample, and
 * Video's New project and Duplicate. Run after each of those and whenever a
 * list of projects is read, so a row never stays loose (Part 5 of the task:
 * "Video's projects become the project's videos").
 */
export async function adoptLooseParts(userId: string, database: CustomShellDb = defaultDb): Promise<string[]> {
  const [research, videos] = await Promise.all([
    database
      .select({ id: viralProjects.id, name: viralProjects.name })
      .from(viralProjects)
      .leftJoin(promoProjects, eq(promoProjects.id, viralProjects.id))
      .where(and(eq(viralProjects.ownerId, userId), isNull(promoProjects.id))),
    database
      .select({ id: videoProjects.id, name: videoProjects.name })
      .from(videoProjects)
      .leftJoin(promoProjects, eq(promoProjects.id, videoProjects.id))
      .where(and(eq(videoProjects.userId, userId), isNull(promoProjects.id))),
  ])
  const loose = new Map([...videos, ...research].map((row) => [row.id, row.name]))
  if (!loose.size) return []
  const at = new Date()
  await database
    .insert(promoProjects)
    .values([...loose].map(([id, name]) => ({ id, userId, name: name.slice(0, PROJECT_NAME_MAX), createdAt: at, updatedAt: at })))
    .onConflictDoNothing()
  for (const id of loose.keys()) await ensureProjectParts(id, database)
  return [...loose.keys()]
}

/** The longest name `promo_projects` holds; research and video names may be longer. */
const PROJECT_NAME_MAX = 120
