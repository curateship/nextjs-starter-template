import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import {
  PROJECT_NAME_MAX,
  PROJECT_NAME_REQUIRED_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
  INTRO_OUTRO_NOT_A_VIDEO_MESSAGE,
} from "@/lib/video/projects"
import type { AspectRatio } from "@/lib/video/timeline-schema"
import { LOOK_PICTURE_NOT_AN_IMAGE_MESSAGE } from "@/lib/video/visual-style"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  deleteMediaAsAdmin,
  findOwnedImageByUrl,
  serializeMedia,
} from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { mediaStillInUse } from "@/server/video/media-in-use"
import {
  folderIdOfProject,
  requireOwnedFolder,
} from "@/server/video/project-folders"
import {
  insertVideo,
  NOT_LOOKED_AT_YET,
  removeVideoFiles,
  sourcesForVideos,
  thumbnailsForVideos,
  type VideoItem,
  type VideoSource,
  type VideoThumbnail,
} from "@/server/video/project-videos"
import {
  videoActors,
  videoAiGenerations,
  videoCarousels,
  videoFirstFrames,
  videoProjectFolderItems,
  videoProjects,
  videoProjectVideos,
  videoRenderJobs,
  type VideoProjectRow,
} from "@/server/video/schema"

/**
 * Projects: the projects table, and what a project holds for all its videos
 * (`workspace/docs/project-videos.md`). A project's videos, and the one write
 * path for a timeline, are in `project-videos.ts`.
 */

/** A row of the projects table. */
export type ProjectItem = {
  id: string
  name: string
  /** Its videos that are not archived. */
  video_count: number
  /** Those videos' lengths added together. */
  duration_ms: number
  /** The shapes those videos are in, most used first. */
  aspects: AspectRatio[]
  /** The picture of its last edited video. */
  thumbnail_url: string | null
  /** A picture is waiting to be made, so the list looks again shortly. */
  thumbnail_pending: boolean
  /**
   * The project's look, set in Project settings (see visual-style.ts). Null
   * when it has neither a style line nor a look picture.
   */
  look: { style: string | null; picture_url: string | null } | null
  /** Videos from the library added before and after every export (intro-and-outro.md). */
  intro_media_id: string | null
  outro_media_id: string | null
  pinned: boolean
  archived: boolean
  /** The actors with a first frame in this project, earliest first. */
  actors: ProjectActor[]
  /** The viral video its last edited copying video copies. */
  source: ProjectSource | null
  created_at: string
  updated_at: string
}

export type ProjectActor = { id: string; name: string; image_url: string }

export type ProjectSource = VideoSource

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

/** What a projects table row shows beside the project's own columns. */
type ProjectExtras = {
  videos: { count: number; durationMs: number; aspects: AspectRatio[] }
  thumbnail: VideoThumbnail
  lookPictures: Map<string, string>
  actors: ProjectActor[]
  source: ProjectSource | null
}

const NO_VIDEOS = { count: 0, durationMs: 0, aspects: [] as AspectRatio[] }

function serializeProject(
  row: VideoProjectRow,
  { videos, thumbnail, lookPictures, actors, source }: ProjectExtras
): ProjectItem {
  const lookPicture = row.styleMediaId
    ? (lookPictures.get(row.styleMediaId) ?? null)
    : null
  return {
    id: row.id,
    name: row.name,
    video_count: videos.count,
    duration_ms: videos.durationMs,
    aspects: videos.aspects,
    thumbnail_url: thumbnail.url,
    thumbnail_pending: thumbnail.pending,
    look:
      row.style || lookPicture
        ? { style: row.style, picture_url: lookPicture }
        : null,
    intro_media_id: row.introMediaId,
    outro_media_id: row.outroMediaId,
    pinned: row.pinnedAt !== null,
    archived: row.archivedAt !== null,
    actors,
    source,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

/**
 * The count, length and shapes of a page of projects' videos, in one query.
 * Archived videos are left out, as the Videos tab leaves them out.
 */
async function videoTotalsFor(rows: VideoProjectRow[], database: CustomShellDb) {
  const totals = new Map<string, ProjectExtras["videos"]>()
  if (!rows.length) return totals
  const found = await database
    .select({
      projectId: videoProjectVideos.projectId,
      aspect: videoProjectVideos.aspect,
      count: sql<number>`count(*)::int`,
      durationMs: sql<number>`coalesce(sum(${videoProjectVideos.durationMs}), 0)::int`,
    })
    .from(videoProjectVideos)
    .where(
      and(
        inArray(videoProjectVideos.projectId, rows.map((row) => row.id)),
        isNull(videoProjectVideos.archivedAt)
      )
    )
    .groupBy(videoProjectVideos.projectId, videoProjectVideos.aspect)
    .orderBy(desc(sql`3`))
  for (const row of found) {
    const total = totals.get(row.projectId) ?? { count: 0, durationMs: 0, aspects: [] }
    total.count += row.count
    total.durationMs += row.durationMs
    total.aspects.push(row.aspect as AspectRatio)
    totals.set(row.projectId, total)
  }
  return totals
}

/**
 * Each project's last edited video, for its picture, and its last edited
 * video that copies a viral video, for the "Copies" line. Two queries.
 */
async function latestVideosFor(rows: VideoProjectRow[], database: CustomShellDb) {
  const thumbnails = new Map<string, VideoThumbnail>()
  const sources = new Map<string, ProjectSource>()
  if (!rows.length) return { thumbnails, sources }
  const ids = rows.map((row) => row.id)
  const [latest, copying] = await Promise.all([
    database
      .selectDistinctOn([videoProjectVideos.projectId], {
        id: videoProjectVideos.id,
        projectId: videoProjectVideos.projectId,
        updatedAt: videoProjectVideos.updatedAt,
      })
      .from(videoProjectVideos)
      .where(and(inArray(videoProjectVideos.projectId, ids), isNull(videoProjectVideos.archivedAt)))
      .orderBy(videoProjectVideos.projectId, desc(videoProjectVideos.updatedAt)),
    database
      .selectDistinctOn([videoProjectVideos.projectId], {
        projectId: videoProjectVideos.projectId,
        userId: videoProjectVideos.userId,
        sourceViralVideoId: videoProjectVideos.sourceViralVideoId,
      })
      .from(videoProjectVideos)
      .where(
        and(
          inArray(videoProjectVideos.projectId, ids),
          isNull(videoProjectVideos.archivedAt),
          isNotNull(videoProjectVideos.sourceViralVideoId)
        )
      )
      .orderBy(videoProjectVideos.projectId, desc(videoProjectVideos.updatedAt)),
  ])
  const [pictures, copied] = await Promise.all([
    thumbnailsForVideos(latest, database),
    sourcesForVideos(copying, database),
  ])
  for (const row of latest) {
    thumbnails.set(row.projectId, pictures.get(row.id) ?? NOT_LOOKED_AT_YET)
  }
  for (const row of copying) {
    const source = row.sourceViralVideoId ? copied.get(row.sourceViralVideoId) : undefined
    if (source) sources.set(row.projectId, source)
  }
  return { thumbnails, sources }
}

/**
 * The addresses of the look pictures of a page of projects, in one query. The
 * column is only ever set to the owner's own picture and is blanked when the
 * picture is deleted. The owner is checked here as well, so a picture can only
 * ever be shown to the person it belongs to.
 */
async function lookPicturesFor(
  rows: VideoProjectRow[],
  database: CustomShellDb
) {
  const withPicture = rows.filter((row) => row.styleMediaId)
  const pictures = new Map<string, string>()
  if (!withPicture.length) return pictures
  const media = await database
    .select()
    .from(customShellMedia)
    .where(
      and(
        inArray(customShellMedia.id, [
          ...new Set(withPicture.map((row) => row.styleMediaId!)),
        ]),
        inArray(customShellMedia.userId, [
          ...new Set(withPicture.map((row) => row.userId)),
        ])
      )
    )
  for (const row of media) {
    pictures.set(row.id, (await serializeMedia(row)).url)
  }
  return pictures
}

const actorPicture = alias(customShellMedia, "project_actor_picture")

/**
 * The actors with a first frame in each of a page of projects, in one query.
 * An actor whose picture is gone is left out rather than drawn broken.
 */
async function actorsFor(rows: VideoProjectRow[], database: CustomShellDb) {
  const actors = new Map<string, ProjectActor[]>()
  if (!rows.length) return actors
  const found = await database
    .selectDistinctOn([videoFirstFrames.projectId, videoActors.id], {
      projectId: videoFirstFrames.projectId,
      actor: videoActors,
      picture: actorPicture,
      firstAt: videoFirstFrames.createdAt,
    })
    .from(videoFirstFrames)
    .innerJoin(videoActors, eq(videoActors.id, videoFirstFrames.actorId))
    .innerJoin(
      actorPicture,
      and(
        eq(actorPicture.id, videoActors.imageMediaId),
        eq(actorPicture.userId, videoActors.userId)
      )
    )
    .where(
      inArray(
        videoFirstFrames.projectId,
        rows.map((row) => row.id)
      )
    )
    .orderBy(
      videoFirstFrames.projectId,
      videoActors.id,
      videoFirstFrames.createdAt
    )
  found.sort((a, b) => a.firstAt.getTime() - b.firstAt.getTime())
  for (const row of found) {
    if (!row.projectId) continue
    const list = actors.get(row.projectId) ?? []
    list.push({
      id: row.actor.id,
      name: row.actor.name,
      image_url: (await serializeMedia(row.picture)).url,
    })
    actors.set(row.projectId, list)
  }
  return actors
}

/**
 * Everything a page of rows shows besides its own columns, in a handful of
 * queries however many rows there are.
 */
async function extrasFor(rows: VideoProjectRow[], database: CustomShellDb) {
  const [videos, latest, lookPictures, actors] = await Promise.all([
    videoTotalsFor(rows, database),
    latestVideosFor(rows, database),
    lookPicturesFor(rows, database),
    actorsFor(rows, database),
  ])
  return (row: VideoProjectRow): ProjectExtras => ({
    videos: videos.get(row.id) ?? NO_VIDEOS,
    // A project with no video yet has no picture to wait for.
    thumbnail: latest.thumbnails.get(row.id) ?? { url: null, pending: false },
    lookPictures,
    actors: actors.get(row.id) ?? [],
    source: latest.sources.get(row.id) ?? null,
  })
}

/** One row, pictures included. Every single-project answer goes through here. */
export async function serializeOneProject(
  row: VideoProjectRow,
  database: CustomShellDb
) {
  return serializeProject(row, (await extrasFor([row], database))(row))
}

export async function listOwnedProjects({
  userId,
  page = 1,
  pageSize = 24,
  search = "",
  folderId,
  archived = false,
  actorId,
  database = db,
}: {
  userId: string
  page?: number
  pageSize?: number
  search?: string
  /** Absent lists every project; null only those in no folder. */
  folderId?: string | null
  /** True lists only archived projects; the list leaves them out otherwise. */
  archived?: boolean
  /** Only projects with a first frame of this actor. */
  actorId?: string
  database?: CustomShellDb
}): Promise<ProjectListResponse> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))

  const filters: SQL[] = [
    eq(videoProjects.userId, userId),
    archived
      ? isNotNull(videoProjects.archivedAt)
      : isNull(videoProjects.archivedAt),
  ]
  if (actorId) {
    filters.push(
      inArray(
        videoProjects.id,
        database
          .select({ id: sql<string>`${videoFirstFrames.projectId}` })
          .from(videoFirstFrames)
          .where(
            and(
              eq(videoFirstFrames.userId, userId),
              eq(videoFirstFrames.actorId, actorId)
            )
          )
      )
    )
  }
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
      // Pinned projects first, so a page never leaves one out.
      .orderBy(
        sql`${videoProjects.pinnedAt} is null`,
        desc(videoProjects.updatedAt),
        desc(videoProjects.id)
      )
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    database.select({ total: count() }).from(videoProjects).where(where),
  ])

  const extras = await extrasFor(rows, database)
  const total = totals?.total ?? 0
  return {
    projects: rows.map((row) => serializeProject(row, extras(row))),
    total,
    page: safePage,
    page_size: safePageSize,
    total_pages: Math.max(1, Math.ceil(total / safePageSize)),
  }
}

export async function getOwnedProjectItem(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<ProjectItem> {
  return serializeOneProject(await getOwnedProject(userId, projectId, database), database)
}

/**
 * A new project with its first video, named after the project. `folderId`
 * puts it straight into that folder, the one the list was showing when New
 * project was pressed. A project made by Make this a template has its first
 * video copy the viral video.
 */
export async function createOwnedProject(
  userId: string,
  name: string,
  database: CustomShellDb = db,
  folderId: string | null = null,
  /** The saved viral video the first video copies, from Make this a template. */
  sourceViralVideoId: string | null = null,
  /** The Viral project Make this a template was pressed in. */
  sourceViralProjectId: string | null = null
): Promise<{ project: ProjectItem; video: VideoItem["id"] }> {
  const createdAt = now()
  const cleanedName = cleanProjectName(name)
  if (folderId) await requireOwnedFolder(userId, folderId, database)
  const created = await database.transaction(async (tx) => {
    const [row] = await tx
      .insert(videoProjects)
      .values({
        id: uuid(),
        userId,
        name: cleanedName,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
    if (folderId) {
      await tx
        .insert(videoProjectFolderItems)
        .values({ projectId: row.id, folderId, createdAt })
    }
    const video = await insertVideo(
      userId,
      row.id,
      { name: cleanedName, sourceViralVideoId, sourceViralProjectId },
      tx
    )
    return { row, videoId: video.id }
  })
  const [project] = await database
    .select()
    .from(videoProjects)
    .where(eq(videoProjects.id, created.row.id))
  return { project: await serializeOneProject(project, database), video: created.videoId }
}

/**
 * A copy of a whole project, in the same folder: its look, extras and every
 * video with its timeline, status and spend limit. Its first frames come too,
 * as new records of its own that show the same pictures. A picture leaves
 * storage only once nothing uses it. AI shots, history and exports stay with
 * the original; the shots already on a timeline come with the timeline.
 */
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
        userId: source.userId,
        name: cleanProjectName(`${source.name} copy`),
        style: source.style,
        styleMediaId: source.styleMediaId,
        extraPicks: source.extraPicks,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
    const videos = await tx
      .select()
      .from(videoProjectVideos)
      .where(eq(videoProjectVideos.projectId, source.id))
    // New ids, and a language copy points at its original's copy.
    const newIds = new Map(videos.map((video) => [video.id, uuid()]))
    if (videos.length) {
      await tx.insert(videoProjectVideos).values(
        videos.map((video) => ({
          ...video,
          id: newIds.get(video.id)!,
          projectId: row.id,
          languageOf: video.languageOf ? (newIds.get(video.languageOf) ?? null) : null,
          version: 1,
          createdAt,
          updatedAt: createdAt,
        }))
      )
    }
    const frames = await tx
      .select()
      .from(videoFirstFrames)
      .where(eq(videoFirstFrames.projectId, source.id))
    if (frames.length) {
      await tx.insert(videoFirstFrames).values(
        frames.map((frame) => ({ ...frame, id: uuid(), projectId: row.id }))
      )
    }
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
 * Project settings: the name and the look, saved together. Neither is part
 * of a timeline, so an editor open on one of the videos carries on saving.
 * The look picture arrives as the address the Media picker handed back and
 * is kept by its library id; anything that is not one of the person's own
 * pictures is refused. Each video's spend limit is its own
 * (`saveVideoSpendLimit`).
 */
export async function saveOwnedProjectSettings(
  userId: string,
  projectId: string,
  settings: {
    name: string
    style: string | null
    lookPictureUrl: string | null
    /** Left out keeps what is set. Null takes it off. */
    introMediaId?: string | null
    outroMediaId?: string | null
  },
  database: CustomShellDb = db
): Promise<ProjectItem> {
  for (const mediaId of [settings.introMediaId, settings.outroMediaId]) {
    if (mediaId) await requireOwnedVideoFile(userId, mediaId, database)
  }
  let styleMediaId: string | null = null
  if (settings.lookPictureUrl) {
    const picture = await findOwnedImageByUrl(
      userId,
      settings.lookPictureUrl,
      database
    )
    if (picture?.fileType !== "image") {
      throw new Error(LOOK_PICTURE_NOT_AN_IMAGE_MESSAGE)
    }
    styleMediaId = picture.id
  }
  const [row] = await database
    .update(videoProjects)
    .set({
      name: cleanProjectName(settings.name),
      style: settings.style?.trim() || null,
      styleMediaId,
      ...(settings.introMediaId !== undefined ? { introMediaId: settings.introMediaId } : {}),
      ...(settings.outroMediaId !== undefined ? { outroMediaId: settings.outroMediaId } : {}),
      updatedAt: now(),
    })
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .returning()
  if (!row) {
    throw new Error(PROJECT_NOT_FOUND_MESSAGE)
  }
  return serializeOneProject(row, database)
}

async function requireOwnedVideoFile(userId: string, mediaId: string, database: CustomShellDb) {
  const [media] = await database
    .select({ id: customShellMedia.id })
    .from(customShellMedia)
    .where(
      and(
        eq(customShellMedia.id, mediaId),
        eq(customShellMedia.userId, userId),
        eq(customShellMedia.fileType, "video")
      )
    )
    .limit(1)
  if (!media) throw new Error(INTRO_OUTRO_NOT_A_VIDEO_MESSAGE)
}

/**
 * Archives projects, or brings them back. An archived project keeps
 * everything and leaves the list. A project that is not the caller's, or is
 * already where it was asked to go, comes back in `skipped_ids`.
 */
export async function setProjectsArchived(
  userId: string,
  projectIds: string[],
  archived: boolean,
  database: CustomShellDb = db
): Promise<{ done_ids: string[]; skipped_ids: string[] }> {
  const ids = [...new Set(projectIds)]
  if (!ids.length) return { done_ids: [], skipped_ids: [] }
  const rows = await database
    .update(videoProjects)
    // Archiving unpins: a pin is for what is being worked on now.
    .set(archived ? { archivedAt: now(), pinnedAt: null } : { archivedAt: null })
    .where(
      and(
        eq(videoProjects.userId, userId),
        inArray(videoProjects.id, ids),
        archived
          ? isNull(videoProjects.archivedAt)
          : isNotNull(videoProjects.archivedAt)
      )
    )
    .returning({ id: videoProjects.id })
  const done = rows.map((row) => row.id)
  return { done_ids: done, skipped_ids: ids.filter((id) => !done.includes(id)) }
}

/** Pins a project to the top of the list, or takes the pin off. */
export async function setProjectPinned(
  userId: string,
  projectId: string,
  pinned: boolean,
  database: CustomShellDb = db
): Promise<ProjectItem> {
  const [row] = await database
    .update(videoProjects)
    .set({ pinnedAt: pinned ? now() : null })
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .returning()
  if (!row) throw new Error(PROJECT_NOT_FOUND_MESSAGE)
  return serializeOneProject(row, database)
}

/** What deleting these projects takes with it, counted for the delete window. */
export type ProjectDeleteSummary = {
  videos: number
  first_frames: number
  ai_clips: number
  exports: number
  /** Carousels made from the projects; the window asks what to do. */
  carousels: number
}

export async function summarizeProjectDelete(
  userId: string,
  projectIds: string[],
  database: CustomShellDb = db
): Promise<ProjectDeleteSummary> {
  const ids = [...new Set(projectIds)]
  if (!ids.length) {
    return { videos: 0, first_frames: 0, ai_clips: 0, exports: 0, carousels: 0 }
  }
  const owned = and(
    eq(videoProjects.userId, userId),
    inArray(videoProjects.id, ids)
  )
  const [[videos], [frames], [clips], [exports], [carousels]] = await Promise.all([
    database
      .select({ total: count() })
      .from(videoProjectVideos)
      .innerJoin(videoProjects, eq(videoProjects.id, videoProjectVideos.projectId))
      .where(owned),
    database
      .select({ total: count() })
      .from(videoFirstFrames)
      .innerJoin(videoProjects, eq(videoProjects.id, videoFirstFrames.projectId))
      .where(owned),
    database
      .select({ total: sql<number>`count(distinct ${videoAiGenerations.shotId})::int` })
      .from(videoAiGenerations)
      .innerJoin(videoProjects, eq(videoProjects.id, videoAiGenerations.projectId))
      .where(owned),
    database
      .select({ total: count() })
      .from(videoRenderJobs)
      .innerJoin(videoProjects, eq(videoProjects.id, videoRenderJobs.projectId))
      .where(owned),
    database
      .select({ total: count() })
      .from(videoCarousels)
      .innerJoin(videoProjects, eq(videoProjects.id, videoCarousels.projectId))
      .where(owned),
  ])
  return {
    videos: videos?.total ?? 0,
    first_frames: frames?.total ?? 0,
    ai_clips: clips?.total ?? 0,
    exports: exports?.total ?? 0,
    carousels: carousels?.total ?? 0,
  }
}

/**
 * The pictures and clips a project's first frames and AI clips were made as.
 * They belong to the project, so they go when it goes, unless something else
 * uses them by then (see `mediaStillInUse`).
 */
async function madeForProjects(projectIds: string[], database: CustomShellDb) {
  if (!projectIds.length) return []
  const [frames, clips] = await Promise.all([
    database
      .select({ id: videoFirstFrames.imageMediaId })
      .from(videoFirstFrames)
      .where(inArray(videoFirstFrames.projectId, projectIds)),
    database
      .select({
        output: videoAiGenerations.outputMediaId,
        start: videoAiGenerations.firstFrameMediaId,
      })
      .from(videoAiGenerations)
      .where(inArray(videoAiGenerations.projectId, projectIds)),
  ])
  return [
    ...new Set([
      ...frames.map((row) => row.id),
      ...clips.flatMap((row) => [row.output, row.start]).filter(
        (id): id is string => !!id
      ),
    ]),
  ]
}

/**
 * Deleting projects, with every video in them. The library files a project
 * merely used are left alone on purpose: they are the person's own library,
 * shared with every other project, and a delete here must never take footage
 * away from somewhere else.
 *
 * What was made for the project does go. Its first frames and AI clips go with
 * the row, and their pictures and clips leave storage afterwards unless
 * another project, an actor or a carousel still uses them. A picture that will
 * not come out is logged and left in the library, where it can be deleted by
 * hand; the project is gone either way.
 *
 * Its videos' exports and pictures do go, because their rows go with it.
 * Their files are removed from storage first, the same way deleting an export
 * does it, and a project with a file that would not come out is kept and
 * comes back in `failed_ids`, so no file is ever left with nothing pointing
 * at it.
 */
export async function deleteOwnedProjects(
  userId: string,
  projectIds: string[],
  database: CustomShellDb = db,
  /**
   * The delete window asks each time (workspace/docs/carousel-projects.md):
   * true deletes the carousels made from the projects too, false keeps them
   * with no "made from" project.
   */
  deleteCarousels = false
): Promise<{ deleted_ids: string[]; failed_ids: string[] }> {
  const uniqueIds = Array.from(new Set(projectIds))
  if (!uniqueIds.length) return { deleted_ids: [], failed_ids: [] }

  const videos = await database
    .select({ id: videoProjectVideos.id, projectId: videoProjectVideos.projectId })
    .from(videoProjectVideos)
    .innerJoin(videoProjects, eq(videoProjects.id, videoProjectVideos.projectId))
    .where(and(eq(videoProjects.userId, userId), inArray(videoProjects.id, uniqueIds)))
  const clean = await removeVideoFiles(videos.map((video) => video.id), database)
  const failed = new Set(
    videos.filter((video) => !clean.has(video.id)).map((video) => video.projectId)
  )

  const failedIds = Array.from(failed)
  const deletable = uniqueIds.filter((id) => !failed.has(id))
  if (!deletable.length) return { deleted_ids: [], failed_ids: failedIds }

  const made = await madeForProjects(deletable, database)
  // Carousels and projects go together or not at all, so a failure never
  // leaves a project whose carousels were already deleted.
  const rows = await database.transaction(async (tx) => {
    if (deleteCarousels) {
      // The carousels' own kept exports stay, as when a carousel is deleted
      // from its list (workspace/docs/carousel-exports.md).
      await tx
        .delete(videoCarousels)
        .where(
          and(
            eq(videoCarousels.userId, userId),
            inArray(videoCarousels.projectId, deletable)
          )
        )
    }
    return tx
      .delete(videoProjects)
      .where(
        and(
          eq(videoProjects.userId, userId),
          inArray(videoProjects.id, deletable)
        )
      )
      .returning({ id: videoProjects.id })
  })

  const inUse = await mediaStillInUse(userId, made, database)
  const unused = made.filter((id) => !inUse.has(id))
  if (unused.length) {
    try {
      await deleteMediaAsAdmin(unused, database)
    } catch (error) {
      console.error("A deleted project's AI pictures stayed in storage", error)
    }
  }

  return { deleted_ids: rows.map((row) => row.id), failed_ids: failedIds }
}
