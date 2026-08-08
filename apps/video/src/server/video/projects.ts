import { and, count, desc, eq, ilike, inArray, type SQL } from "drizzle-orm"

import {
  PROJECT_NAME_MAX,
  PROJECT_NAME_REQUIRED_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
} from "@/lib/video/projects"
import {
  createEmptyTimeline,
  parseTimelineForReset,
  PROJECT_CONFLICT_MESSAGE,
  requireCanonicalTimeline,
  type AspectRatio,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { videoPlaybackUrl } from "@/server/video/media-urls"
import {
  videoMediaProxies,
  videoProjects,
  type VideoProjectRow,
} from "@/server/video/schema"

/**
 * Projects: the list, and the one write path for a timeline.
 *
 * Two rules hold this together. Every read re-derives a clip's address from its
 * media id rather than trusting the address stored months ago, so a moved file
 * or a newly built proxy is picked up on open. And every write is a
 * compare-and-swap on `version`, so the second of two open tabs is told it lost
 * instead of quietly overwriting the first.
 */

/** List rows carry stats, never the timeline itself — it can be megabytes. */
export type ProjectItem = {
  id: string
  name: string
  aspect: AspectRatio
  clip_count: number
  duration_ms: number
  /** Set when the stored timeline no longer validates; the editor says so. */
  timeline_error: string | null
  /** Send this back with the next save; see writeProjectTimeline. */
  version: number
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

/** What the editor opens with: the summary plus the timeline to draw. */
export type ProjectDetail = ProjectItem & {
  timeline: ProjectTimeline
}

export type ProjectListResponse = {
  projects: ProjectItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export function cleanProjectName(value: string) {
  const name = value.trim().replace(/\s+/g, " ")
  if (!name) {
    throw new Error(PROJECT_NAME_REQUIRED_MESSAGE)
  }
  return name.slice(0, PROJECT_NAME_MAX)
}

/** Clip count and length, derived from the timeline rather than stored twice. */
export function summarizeTimeline(timeline: ProjectTimeline) {
  let clipCount = 0
  let durationMs = 0
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      clipCount += 1
      durationMs = Math.max(durationMs, clip.startMs + clip.durationMs)
    }
  }
  return { clipCount, durationMs }
}

async function getOwnedProject(
  userId: string,
  projectId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select()
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  if (!row) {
    throw new Error(PROJECT_NOT_FOUND_MESSAGE)
  }
  return row
}

/**
 * Point every media-backed clip at the address to play it from today: the
 * smooth proxy when one is ready, the original file otherwise. A stored address
 * is never handed back as-is — it was written whenever the clip was added, and
 * anything could have changed since.
 *
 * A clip whose media the person no longer owns keeps its own stored address:
 * the clip stays visible with a broken picture rather than vanishing, which is
 * a state somebody can see and fix.
 */
async function resolveTimelineMediaUrls(
  userId: string,
  timeline: ProjectTimeline,
  database: CustomShellDb
): Promise<ProjectTimeline> {
  const mediaIds = Array.from(
    new Set(
      timeline.tracks.flatMap((track) =>
        track.clips.flatMap((clip) => (clip.mediaId ? [clip.mediaId] : []))
      )
    )
  )
  if (!mediaIds.length) return timeline

  const rows = await database
    .select({
      media: customShellMedia,
      proxyStatus: videoMediaProxies.status,
      proxyStoragePath: videoMediaProxies.storagePath,
    })
    .from(customShellMedia)
    .leftJoin(
      videoMediaProxies,
      eq(videoMediaProxies.mediaId, customShellMedia.id)
    )
    .where(
      and(
        eq(customShellMedia.userId, userId),
        inArray(customShellMedia.id, mediaIds)
      )
    )

  const urls = new Map(
    rows.map((row) => [
      row.media.id,
      videoPlaybackUrl(
        serializeMedia(row.media).url,
        row.proxyStatus
          ? { status: row.proxyStatus, storagePath: row.proxyStoragePath }
          : null
      ),
    ])
  )

  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        const url = clip.mediaId ? urls.get(clip.mediaId) : undefined
        return url ? { ...clip, url } : clip
      }),
    })),
  }
}

function serializeProject(
  row: VideoProjectRow,
  thumbnailUrl: string | null
): ProjectItem {
  const { timeline, error } = parseTimelineForReset(row.timeline)
  const stats = summarizeTimeline(timeline)
  return {
    id: row.id,
    name: row.name,
    aspect: row.aspect as AspectRatio,
    clip_count: stats.clipCount,
    duration_ms: stats.durationMs,
    timeline_error: error,
    version: row.version,
    thumbnail_url: thumbnailUrl,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

/** Cover pictures for a page of projects, in one query rather than one each. */
async function thumbnailUrlsFor(
  rows: VideoProjectRow[],
  database: CustomShellDb
) {
  const ids = Array.from(
    new Set(rows.flatMap((row) => (row.thumbnailMediaId ? [row.thumbnailMediaId] : [])))
  )
  const urls = new Map<string, string>()
  if (!ids.length) return urls
  const media = await database
    .select()
    .from(customShellMedia)
    .where(inArray(customShellMedia.id, ids))
  for (const row of media) {
    urls.set(row.id, serializeMedia(row).url)
  }
  return urls
}

/** One row, cover picture included — every single-project answer goes through here. */
async function serializeOneProject(
  row: VideoProjectRow,
  database: CustomShellDb
) {
  const thumbnails = await thumbnailUrlsFor([row], database)
  return serializeProject(
    row,
    row.thumbnailMediaId ? (thumbnails.get(row.thumbnailMediaId) ?? null) : null
  )
}

export async function listOwnedProjects({
  userId,
  page = 1,
  pageSize = 24,
  search = "",
  database = db,
}: {
  userId: string
  page?: number
  pageSize?: number
  search?: string
  database?: CustomShellDb
}): Promise<ProjectListResponse> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))

  const filters: SQL[] = [eq(videoProjects.userId, userId)]
  const cleanedSearch = search.trim()
  if (cleanedSearch) {
    // The wildcards are escaped so a search for "%" finds a project called
    // "100%" instead of matching everything.
    filters.push(
      ilike(videoProjects.name, `%${cleanedSearch.replace(/([\\%_])/g, "\\$1")}%`)
    )
  }
  const where = and(...filters)

  const [rows, [totals]] = await Promise.all([
    database
      .select()
      .from(videoProjects)
      .where(where)
      .orderBy(desc(videoProjects.updatedAt), desc(videoProjects.id))
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    database.select({ total: count() }).from(videoProjects).where(where),
  ])

  const thumbnails = await thumbnailUrlsFor(rows, database)
  const total = totals?.total ?? 0
  return {
    projects: rows.map((row) =>
      serializeProject(
        row,
        row.thumbnailMediaId
          ? (thumbnails.get(row.thumbnailMediaId) ?? null)
          : null
      )
    ),
    total,
    page: safePage,
    page_size: safePageSize,
    total_pages: Math.max(1, Math.ceil(total / safePageSize)),
  }
}

export async function getOwnedProjectDetail(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<ProjectDetail> {
  const row = await getOwnedProject(userId, projectId, database)
  const { timeline } = parseTimelineForReset(row.timeline)
  return {
    ...(await serializeOneProject(row, database)),
    timeline: await resolveTimelineMediaUrls(userId, timeline, database),
  }
}

export async function createOwnedProject(
  userId: string,
  name: string,
  database: CustomShellDb = db
): Promise<ProjectItem> {
  const createdAt = now()
  // A new project starts empty and vertical — the short-form shape almost
  // everything here is made for. The aspect switch changes it in one click.
  const timeline = createEmptyTimeline()
  const [created] = await database
    .insert(videoProjects)
    .values({
      id: uuid(),
      userId,
      name: cleanProjectName(name),
      aspect: timeline.aspect,
      timeline,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
  return serializeOneProject(created, database)
}

export async function duplicateOwnedProject(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<ProjectItem> {
  const source = await getOwnedProject(userId, projectId, database)
  const createdAt = now()
  const [created] = await database
    .insert(videoProjects)
    .values({
      id: uuid(),
      userId,
      name: cleanProjectName(`${source.name} copy`),
      aspect: source.aspect,
      timeline: source.timeline,
      // The copy is its own project from version 1; it shares nothing with the
      // original after this moment.
      version: 1,
      thumbnailMediaId: source.thumbnailMediaId,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
  return serializeOneProject(created, database)
}

export async function renameOwnedProject(
  userId: string,
  projectId: string,
  name: string,
  database: CustomShellDb = db
): Promise<ProjectItem> {
  const [row] = await database
    .update(videoProjects)
    .set({ name: cleanProjectName(name), updatedAt: now() })
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .returning()
  if (!row) {
    throw new Error(PROJECT_NOT_FOUND_MESSAGE)
  }
  return serializeOneProject(row, database)
}

/**
 * The one timeline write path. The update lands only while the project is
 * still at `expectedVersion`, so a save built on a copy someone else has since
 * moved past is refused rather than applied over the top. Nothing else in this
 * app writes a timeline.
 */
export async function writeProjectTimeline(
  userId: string,
  projectId: string,
  timeline: ProjectTimeline,
  expectedVersion: number,
  database: CustomShellDb = db
): Promise<ProjectItem> {
  const canonical = requireCanonicalTimeline(timeline)

  const [row] = await database
    .update(videoProjects)
    .set({
      timeline: canonical,
      // Kept in step with the timeline by this one statement, so the column
      // and the document can never disagree.
      aspect: canonical.aspect,
      version: expectedVersion + 1,
      updatedAt: now(),
    })
    .where(
      and(
        eq(videoProjects.id, projectId),
        eq(videoProjects.userId, userId),
        eq(videoProjects.version, expectedVersion)
      )
    )
    .returning()

  if (row) return serializeOneProject(row, database)

  // Nothing was updated: either the project is gone (or never ours), or it has
  // moved past the version this save was built on. Only the second is a clash.
  const [existing] = await database
    .select({ id: videoProjects.id })
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)

  throw new Error(existing ? PROJECT_CONFLICT_MESSAGE : PROJECT_NOT_FOUND_MESSAGE)
}

/**
 * Deleting projects. The media they used is left alone on purpose — it is the
 * person's own library, shared with every other project, and a delete here must
 * never take footage away from somewhere else.
 */
export async function deleteOwnedProjects(
  userId: string,
  projectIds: string[],
  database: CustomShellDb = db
): Promise<{ deleted_ids: string[] }> {
  const uniqueIds = Array.from(new Set(projectIds))
  if (!uniqueIds.length) return { deleted_ids: [] }

  const rows = await database
    .delete(videoProjects)
    .where(
      and(
        eq(videoProjects.userId, userId),
        inArray(videoProjects.id, uniqueIds)
      )
    )
    .returning({ id: videoProjects.id })

  return { deleted_ids: rows.map((row) => row.id) }
}
