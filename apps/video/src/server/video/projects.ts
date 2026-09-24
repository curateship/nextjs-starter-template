import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm"

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
import { deleteFromR2, getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { removeExportFiles } from "@/server/video/export-files"
import { videoPlaybackUrl } from "@/server/video/media-urls"
import {
  folderIdOfProject,
  requireOwnedFolder,
} from "@/server/video/project-folders"
import {
  videoMediaProxies,
  videoProjectFolderItems,
  videoProjects,
  videoProjectThumbnails,
  videoRenderJobs,
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
  /** The first clip's picture, once the background worker has made one. */
  thumbnail_url: string | null
  /** A picture is waiting to be made, so the list looks again shortly. */
  thumbnail_pending: boolean
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

export async function getOwnedProject(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
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
    await Promise.all(
      rows.map(
        async (row) =>
          [
            row.media.id,
            await videoPlaybackUrl(
              (await serializeMedia(row.media)).url,
              row.proxyStatus
                ? { status: row.proxyStatus, storagePath: row.proxyStoragePath }
                : null
            ),
          ] as const
      )
    )
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

type ProjectThumbnail = { url: string | null; pending: boolean }

// A project the worker has not looked at yet, such as one made seconds ago,
// has no row. It gets one on the next tick, so it counts as waiting.
const NOT_LOOKED_AT_YET: ProjectThumbnail = { url: null, pending: true }

function serializeProject(
  row: VideoProjectRow,
  thumbnail: ProjectThumbnail
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
    thumbnail_url: thumbnail.url,
    thumbnail_pending: thumbnail.pending,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

/**
 * Straight from storage, the way every clip and library file is. Each new
 * picture has a new file name, so a browser that kept the old one fetches the
 * new one.
 */
async function pictureUrl(storagePath: string | null) {
  return storagePath ? getPublicMediaUrl(storagePath) : null
}

/** The pictures for a page of projects, in one query rather than one each. */
async function thumbnailsFor(rows: VideoProjectRow[], database: CustomShellDb) {
  const thumbnails = new Map<string, ProjectThumbnail>()
  if (!rows.length) return thumbnails
  const stored = await database
    .select()
    .from(videoProjectThumbnails)
    .where(
      inArray(
        videoProjectThumbnails.projectId,
        rows.map((row) => row.id)
      )
    )
  const savedAt = new Map(rows.map((row) => [row.id, row.updatedAt.getTime()]))
  for (const row of stored) {
    thumbnails.set(row.projectId, {
      url: await pictureUrl(row.storagePath),
      // Saved since the worker last looked, so its first clip may have
      // changed: the list keeps asking until the worker has seen the save.
      pending:
        row.status === "queued" ||
        row.status === "generating" ||
        (savedAt.get(row.projectId) ?? 0) > row.checkedAt.getTime(),
    })
  }
  return thumbnails
}

/** One row, picture included — every single-project answer goes through here. */
async function serializeOneProject(
  row: VideoProjectRow,
  database: CustomShellDb
) {
  const thumbnails = await thumbnailsFor([row], database)
  return serializeProject(row, thumbnails.get(row.id) ?? NOT_LOOKED_AT_YET)
}

export async function listOwnedProjects({
  userId,
  page = 1,
  pageSize = 24,
  search = "",
  folderId,
  database = db,
}: {
  userId: string
  page?: number
  pageSize?: number
  search?: string
  /** Absent lists every project; null only those in no folder. */
  folderId?: string | null
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
  if (folderId !== undefined) {
    // No owner check on the folder: the projects are already this person's,
    // and a project only ever goes into a folder its owner owns.
    const filed = database
      .select({ id: videoProjectFolderItems.projectId })
      .from(videoProjectFolderItems)
    filters.push(
      folderId === null
        ? notInArray(videoProjects.id, filed)
        : inArray(
            videoProjects.id,
            filed.where(eq(videoProjectFolderItems.folderId, folderId))
          )
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

  const thumbnails = await thumbnailsFor(rows, database)
  const total = totals?.total ?? 0
  return {
    projects: rows.map((row) =>
      serializeProject(row, thumbnails.get(row.id) ?? NOT_LOOKED_AT_YET)
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

/**
 * `folderId` puts the new project straight into that folder, the one the list
 * was showing when New project was pressed.
 */
export async function createOwnedProject(
  userId: string,
  name: string,
  database: CustomShellDb = db,
  folderId: string | null = null
): Promise<ProjectItem> {
  const createdAt = now()
  const cleanedName = cleanProjectName(name)
  if (folderId) await requireOwnedFolder(userId, folderId, database)
  // A new project starts empty and vertical — the short-form shape almost
  // everything here is made for. The aspect switch changes it in one click.
  const timeline = createEmptyTimeline()
  const created = await database.transaction(async (tx) => {
    const [row] = await tx
      .insert(videoProjects)
      .values({
        id: uuid(),
        userId,
        name: cleanedName,
        aspect: timeline.aspect,
        timeline,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
    if (folderId) {
      await tx
        .insert(videoProjectFolderItems)
        .values({ projectId: row.id, folderId, createdAt })
    }
    return row
  })
  return serializeOneProject(created, database)
}

export async function duplicateOwnedProject(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<ProjectItem> {
  const source = await getOwnedProject(userId, projectId, database)
  const createdAt = now()
  const created = await database.transaction(async (tx) => {
    const [row] = await tx
      .insert(videoProjects)
      .values({
        id: uuid(),
        userId,
        name: cleanProjectName(`${source.name} copy`),
        aspect: source.aspect,
        timeline: source.timeline,
        // The copy is its own project from version 1; it shares nothing with
        // the original after this moment, and the background worker makes its
        // picture on the next pass, the same as any new project.
        version: 1,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
    // The copy sits in the original's folder, so it appears beside it.
    const folderId = await folderIdOfProject(source.id, tx)
    if (folderId) {
      await tx
        .insert(videoProjectFolderItems)
        .values({ projectId: row.id, folderId, createdAt })
    }
    return row
  })
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

  const [saved] = await database
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
    .returning({
      ...getTableColumns(videoProjects),
      // The picture is read by this same statement, so a save still costs
      // one trip to the database. Written out in full because Drizzle leaves
      // columns unqualified inside an UPDATE.
      thumbnailPath: sql<string | null>`(select t.storage_path from video_project_thumbnails t where t.project_id = video_projects.id)`,
    })

  if (saved) {
    const { thumbnailPath, ...row } = saved
    return serializeProject(row, {
      url: await pictureUrl(thumbnailPath),
      // Saved this instant, so the worker has not looked at it yet.
      pending: true,
    })
  }

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
 *
 * The project's exports and its picture do go, because their rows go with it.
 * Their files are removed from storage first, the same way deleting an export
 * does it, and a project whose files would not come out is kept and comes back
 * in `failed_ids`, so no file is ever left with nothing pointing at it.
 */
export async function deleteOwnedProjects(
  userId: string,
  projectIds: string[],
  database: CustomShellDb = db
): Promise<{ deleted_ids: string[]; failed_ids: string[] }> {
  const uniqueIds = Array.from(new Set(projectIds))
  if (!uniqueIds.length) return { deleted_ids: [], failed_ids: [] }

  const owned = and(
    eq(videoProjects.userId, userId),
    inArray(videoProjects.id, uniqueIds)
  )
  const exportRows = await database
    .select({
      id: videoRenderJobs.id,
      projectId: videoRenderJobs.projectId,
      storagePath: videoRenderJobs.storagePath,
      thumbnailStoragePath: videoRenderJobs.thumbnailStoragePath,
    })
    .from(videoRenderJobs)
    .innerJoin(videoProjects, eq(videoProjects.id, videoRenderJobs.projectId))
    .where(owned)
  const removed = await removeExportFiles(exportRows)
  const failed = new Set(
    exportRows.filter((row) => !removed.has(row.id)).map((row) => row.projectId)
  )

  const pictures = await database
    .select({
      projectId: videoProjectThumbnails.projectId,
      storagePath: videoProjectThumbnails.storagePath,
    })
    .from(videoProjectThumbnails)
    .innerJoin(
      videoProjects,
      eq(videoProjects.id, videoProjectThumbnails.projectId)
    )
    .where(and(owned, isNotNull(videoProjectThumbnails.storagePath)))
  for (const picture of pictures) {
    if (failed.has(picture.projectId) || !picture.storagePath) continue
    try {
      await deleteFromR2(picture.storagePath)
    } catch (error) {
      console.error("Project picture removal failed", picture.projectId, error)
      failed.add(picture.projectId)
    }
  }

  const failedIds = Array.from(failed)
  const deletable = uniqueIds.filter((id) => !failed.has(id))
  if (!deletable.length) return { deleted_ids: [], failed_ids: failedIds }

  const rows = await database
    .delete(videoProjects)
    .where(
      and(
        eq(videoProjects.userId, userId),
        inArray(videoProjects.id, deletable)
      )
    )
    .returning({ id: videoProjects.id })

  return { deleted_ids: rows.map((row) => row.id), failed_ids: failedIds }
}
