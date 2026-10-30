import { and, desc, eq, notInArray } from "drizzle-orm"

import {
  BREAK_MS,
  HOURLY_MS,
  KEEP_VERSIONS,
  VERSION_NOT_FOUND_MESSAGE,
  VERSION_UNREADABLE_MESSAGE,
  type VersionReason,
} from "@/lib/video/project-versions"
import {
  parseTimelineForReset,
  summarizeTimeline,
  type AspectRatio,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  videoProjects,
  videoProjectVersions,
  type VideoProjectRow,
  type VideoProjectVersionRow,
} from "@/server/video/schema"

/**
 * Project history: earlier timelines of a project, kept by the save that
 * replaces them (see `workspace/docs/project-history.md`).
 *
 * Nothing here reads `projects.ts`, because the save there calls in here. The
 * two reads that hand a timeline to the editor live there instead, beside the
 * address lookup they need.
 */

/** One row of the History list. The timeline itself is not sent. */
export type ProjectVersionItem = {
  id: string
  reason: VersionReason
  aspect: AspectRatio
  clip_count: number
  duration_ms: number
  /** When the kept timeline was last saved, which is the time it shows. */
  saved_at: string
  /** "Sam via Project" when a guest sent from Project saved it, null for the owner. */
  edited_by: string | null
}

export function serializeVersion(
  row: Pick<
    VideoProjectVersionRow,
    "id" | "reason" | "aspect" | "clipCount" | "durationMs" | "savedAt" | "editedBy"
  >
): ProjectVersionItem {
  return {
    id: row.id,
    reason: row.reason as VersionReason,
    aspect: row.aspect as AspectRatio,
    clip_count: row.clipCount,
    duration_ms: row.durationMs,
    saved_at: row.savedAt.toISOString(),
    edited_by: row.editedBy,
  }
}

type ProjectBeingSaved = Pick<
  VideoProjectRow,
  "id" | "userId" | "createdAt" | "updatedAt" | "lastEditedBy"
>

/**
 * A timeline written out without its media addresses. Every read looks those
 * up again (`resolveTimelineMediaUrls`), so a restored timeline comes back
 * with addresses its stored copy lacked, and is still the same timeline.
 */
function contentOf(timeline: ProjectTimeline) {
  return JSON.stringify({
    aspect: timeline.aspect,
    progressBar: timeline.progressBar,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map(({ url: _url, ...clip }) => clip),
    })),
  })
}

/**
 * Keeps one timeline as a version, unless one of the project's versions
 * already holds the same clips and shape, then deletes any past the newest
 * `KEEP_VERSIONS`. Restoring back and forth between two cuts so keeps each
 * once, not once per press.
 */
async function keepVersion(
  database: CustomShellDb,
  {
    projectId,
    userId,
    reason,
    timeline,
    savedAt,
    editedBy,
    at,
  }: {
    projectId: string
    userId: string
    reason: VersionReason
    timeline: ProjectTimeline
    savedAt: Date
    /** Whoever made the save that left this timeline: `lastEditedBy` at the time. */
    editedBy: string | null
    at: Date
  }
) {
  const content = contentOf(timeline)
  const kept = await database
    .select({ timeline: videoProjectVersions.timeline })
    .from(videoProjectVersions)
    .where(eq(videoProjectVersions.projectId, projectId))
  const alreadyKept = kept.some((row) => {
    const parsed = parseTimelineForReset(row.timeline)
    return !parsed.error && contentOf(parsed.timeline) === content
  })
  if (alreadyKept) return

  const stats = summarizeTimeline(timeline)
  await database.insert(videoProjectVersions).values({
    id: uuid(),
    projectId,
    userId,
    reason,
    timeline,
    aspect: timeline.aspect,
    clipCount: stats.clipCount,
    // A clip at a speed other than 1x can run a fraction of a millisecond.
    durationMs: Math.round(stats.durationMs),
    savedAt,
    editedBy,
    createdAt: at,
  })
  const newest = database
    .select({ id: videoProjectVersions.id })
    .from(videoProjectVersions)
    .where(eq(videoProjectVersions.projectId, projectId))
    .orderBy(desc(videoProjectVersions.createdAt))
    .limit(KEEP_VERSIONS)
  await database
    .delete(videoProjectVersions)
    .where(
      and(
        eq(videoProjectVersions.projectId, projectId),
        notInArray(videoProjectVersions.id, newest)
      )
    )
}

/** The stored timeline, or null when it no longer parses. */
async function readStoredTimeline(database: CustomShellDb, projectId: string) {
  const [row] = await database
    .select({ timeline: videoProjects.timeline })
    .from(videoProjects)
    .where(eq(videoProjects.id, projectId))
    .limit(1)
  if (!row) return null
  const { timeline, error } = parseTimelineForReset(row.timeline)
  return error ? null : timeline
}

/**
 * Why the timeline a save is about to replace should be kept, or null. It was
 * last saved `BREAK_MS` ago or more, or the newest version is `HOURLY_MS` old
 * or more (a project with none counts from when it was made). `lastKeptAt` is
 * read by the save's own locked read, so a save that keeps nothing costs no
 * extra trip to the database.
 */
export function versionDue(
  project: ProjectBeingSaved,
  lastKeptAt: Date | null,
  at: Date
): VersionReason | null {
  // Kept after its last save, such as "Before restoring", so it is already
  // in history.
  if (lastKeptAt && lastKeptAt > project.updatedAt) return null
  if (at.getTime() - project.updatedAt.getTime() >= BREAK_MS) return "break"
  const since = lastKeptAt ?? project.createdAt
  return at.getTime() - since.getTime() >= HOURLY_MS ? "hourly" : null
}

/**
 * Called by the save, inside its transaction and before it writes, once
 * `versionDue` says so. A timeline with no clips is never kept here.
 *
 * It runs in a savepoint of its own, so a version that fails to keep is logged
 * and the save still lands. A missing version costs less than a lost save.
 */
export async function keepVersionBeforeSave(
  database: CustomShellDb,
  project: ProjectBeingSaved,
  reason: VersionReason,
  at: Date
) {
  try {
    await database.transaction(async (savepoint) => {
      const timeline = await readStoredTimeline(savepoint, project.id)
      if (!timeline || summarizeTimeline(timeline).clipCount === 0) return
      await keepVersion(savepoint, {
        projectId: project.id,
        userId: project.userId,
        reason,
        timeline,
        savedAt: project.updatedAt,
        editedBy: project.lastEditedBy,
        at,
      })
    })
  } catch (error) {
    console.error("Keeping a project version failed", project.id, error)
  }
}

/**
 * Keeps what the project holds right now, before a restore changes it, so
 * the restore can be undone. Kept even when it is empty, because empty is
 * what the person had.
 */
export async function keepVersionBeforeRestore(
  database: CustomShellDb,
  project: ProjectBeingSaved,
  at: Date
) {
  const timeline = await readStoredTimeline(database, project.id)
  if (!timeline) return
  await keepVersion(database, {
    projectId: project.id,
    userId: project.userId,
    reason: "restore",
    timeline,
    savedAt: project.updatedAt,
    editedBy: project.lastEditedBy,
    at,
  })
}

/** The project's versions, newest first. Somebody else's project lists none. */
export async function listOwnedProjectVersions(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<ProjectVersionItem[]> {
  const rows = await database
    .select({
      id: videoProjectVersions.id,
      reason: videoProjectVersions.reason,
      aspect: videoProjectVersions.aspect,
      clipCount: videoProjectVersions.clipCount,
      durationMs: videoProjectVersions.durationMs,
      savedAt: videoProjectVersions.savedAt,
      editedBy: videoProjectVersions.editedBy,
    })
    .from(videoProjectVersions)
    .innerJoin(videoProjects, eq(videoProjects.id, videoProjectVersions.projectId))
    .where(
      and(
        eq(videoProjectVersions.projectId, projectId),
        eq(videoProjects.userId, userId)
      )
    )
    .orderBy(desc(videoProjectVersions.createdAt))
  return rows.map(serializeVersion)
}

/**
 * One version of one of this person's projects, with its timeline as stored.
 * The addresses in it are months old at worst; `projects.ts` re-reads them
 * before the editor gets it.
 */
export async function readOwnedProjectVersion(
  userId: string,
  projectId: string,
  versionId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ version: videoProjectVersions })
    .from(videoProjectVersions)
    .innerJoin(videoProjects, eq(videoProjects.id, videoProjectVersions.projectId))
    .where(
      and(
        eq(videoProjectVersions.id, versionId),
        eq(videoProjectVersions.projectId, projectId),
        eq(videoProjects.userId, userId)
      )
    )
    .limit(1)
  if (!row) throw new Error(VERSION_NOT_FOUND_MESSAGE)
  const { timeline, error } = parseTimelineForReset(row.version.timeline)
  if (error) throw new Error(VERSION_UNREADABLE_MESSAGE)
  return { row: row.version, timeline }
}
