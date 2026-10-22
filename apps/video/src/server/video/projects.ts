import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
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
  REFUSED_COPY_SUFFIX,
} from "@/lib/video/projects"
import {
  createEmptyTimeline,
  parseTimelineForReset,
  PROJECT_CONFLICT_MESSAGE,
  requireCanonicalTimeline,
  summarizeTimeline,
  type AspectRatio,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import {
  languageCopyName,
  type TranslateLanguage,
} from "@/lib/video/translate"
import { LOOK_PICTURE_NOT_AN_IMAGE_MESSAGE } from "@/lib/video/visual-style"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  deleteMediaAsAdmin,
  findOwnedImageByUrl,
  serializeMedia,
} from "@/server/media/library"
import { deleteFromR2, getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { removeExportFiles } from "@/server/video/export-files"
import { mediaStillInUse } from "@/server/video/media-in-use"
import { videoPlaybackUrl } from "@/server/video/media-urls"
import {
  folderIdOfProject,
  requireOwnedFolder,
} from "@/server/video/project-folders"
import {
  keepVersionBeforeRestore,
  keepVersionBeforeSave,
  readOwnedProjectVersion,
  serializeVersion,
  versionDue,
  type ProjectVersionItem,
} from "@/server/video/project-versions"
import {
  videoActors,
  videoAiGenerations,
  videoCarousels,
  videoFirstFrames,
  videoMediaProxies,
  videoProjectFolderItems,
  videoProjects,
  videoProjectThumbnails,
  videoProjectVersions,
  videoRenderJobs,
  videoViralVideos,
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
  /**
   * The project's look, set in Project settings (see visual-style.ts). Null
   * when it has neither a style line nor a look picture.
   */
  look: { style: string | null; picture_url: string | null } | null
  /** The most AI spending allowed, in cents; null is no limit. */
  spend_limit_cents: number | null
  pinned: boolean
  archived: boolean
  /** The actors with a first frame in this project, earliest first. */
  actors: ProjectActor[]
  /** The viral video this project copies, from Copy this. */
  source: ProjectSource | null
  created_at: string
  updated_at: string
}

export type ProjectActor = { id: string; name: string; image_url: string }

export type ProjectSource = {
  id: string
  title: string | null
  cover_url: string | null
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

/** What a list row shows beside the project's own columns. */
type ProjectExtras = {
  thumbnail: ProjectThumbnail
  lookPictures: Map<string, string>
  actors: ProjectActor[]
  source: ProjectSource | null
}

function serializeProject(
  row: VideoProjectRow,
  { thumbnail, lookPictures, actors, source }: ProjectExtras
): ProjectItem {
  const lookPicture = row.styleMediaId
    ? (lookPictures.get(row.styleMediaId) ?? null)
    : null
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
    look:
      row.style || lookPicture
        ? { style: row.style, picture_url: lookPicture }
        : null,
    spend_limit_cents: row.spendLimitCents,
    pinned: row.pinnedAt !== null,
    archived: row.archivedAt !== null,
    actors,
    source,
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

/** The viral videos a page of projects copies, in one query. */
async function sourcesFor(rows: VideoProjectRow[], database: CustomShellDb) {
  const sources = new Map<string, ProjectSource>()
  const ids = [
    ...new Set(rows.flatMap((row) => row.sourceViralVideoId ?? [])),
  ]
  if (!ids.length) return sources
  const found = await database
    .select({
      id: videoViralVideos.id,
      title: videoViralVideos.title,
      cover: videoViralVideos.thumbnailStoragePath,
    })
    .from(videoViralVideos)
    // Only ever the project owner's own saved video, the same as the look
    // picture above.
    .where(
      and(
        inArray(videoViralVideos.id, ids),
        inArray(videoViralVideos.ownerId, [
          ...new Set(rows.map((row) => row.userId)),
        ])
      )
    )
  for (const row of found) {
    sources.set(row.id, {
      id: row.id,
      title: row.title,
      cover_url: await pictureUrl(row.cover),
    })
  }
  return sources
}

/**
 * Everything a page of rows shows besides its own columns, in four queries.
 * A save already knows its picture, so it skips that one.
 */
async function extrasFor(
  rows: VideoProjectRow[],
  database: CustomShellDb,
  withThumbnails = true
) {
  const [thumbnails, lookPictures, actors, sources] = await Promise.all([
    withThumbnails
      ? thumbnailsFor(rows, database)
      : new Map<string, ProjectThumbnail>(),
    lookPicturesFor(rows, database),
    actorsFor(rows, database),
    sourcesFor(rows, database),
  ])
  return (row: VideoProjectRow): ProjectExtras => ({
    thumbnail: thumbnails.get(row.id) ?? NOT_LOOKED_AT_YET,
    lookPictures,
    actors: actors.get(row.id) ?? [],
    source: row.sourceViralVideoId
      ? (sources.get(row.sourceViralVideoId) ?? null)
      : null,
  })
}

/** One row, pictures included — every single-project answer goes through here. */
async function serializeOneProject(
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
  folderId: string | null = null,
  /** The saved viral video the project copies, from Copy this. */
  sourceViralVideoId: string | null = null,
  /** The Viral project Copy this was pressed in. */
  sourceViralProjectId: string | null = null
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
        sourceViralVideoId,
        sourceViralProjectId,
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
  return insertProjectCopy(
    source,
    `${source.name} copy`,
    { timeline: source.timeline, aspect: source.aspect },
    database
  )
}

/**
 * Keeps the work of a window whose save was refused because the project
 * changed in another window. It becomes a new project beside the original,
 * holding exactly what that window had on screen, so nothing done in it is
 * lost and nothing done in the other window is overwritten.
 */
export async function keepRefusedTimeline(
  userId: string,
  projectId: string,
  timeline: ProjectTimeline,
  database: CustomShellDb = db
): Promise<ProjectItem> {
  const canonical = requireCanonicalTimeline(timeline)
  const source = await getOwnedProject(userId, projectId, database)
  return insertProjectCopy(
    source,
    `${source.name} ${REFUSED_COPY_SUFFIX}`,
    { timeline: canonical, aspect: canonical.aspect },
    database
  )
}

/**
 * A copy of one of the caller's own projects in another language, holding a
 * timeline already laid with the new voice and its captions. It is named
 * "My Short (Spanish)" and remembers the project it came from. The original
 * is only read.
 */
export async function insertLanguageCopy(
  source: VideoProjectRow,
  language: TranslateLanguage,
  timeline: ProjectTimeline,
  database: CustomShellDb = db
): Promise<ProjectItem> {
  const canonical = requireCanonicalTimeline(timeline)
  return insertProjectCopy(
    source,
    languageCopyName(source.name, language),
    { timeline: canonical, aspect: canonical.aspect },
    database,
    // A copy made from a copy belongs with the first original.
    { languageOf: source.languageOf ?? source.id, language }
  )
}

/**
 * A new project made from an existing one, in the same folder. A duplicate
 * passes the stored timeline over as it is, even one that no longer parses; a
 * kept copy passes one the schema has just checked.
 */
async function insertProjectCopy(
  source: VideoProjectRow,
  name: string,
  content: Pick<VideoProjectRow, "timeline" | "aspect">,
  database: CustomShellDb,
  translated?: Pick<VideoProjectRow, "languageOf" | "language">
): Promise<ProjectItem> {
  const createdAt = now()
  const created = await database.transaction(async (tx) => {
    const [row] = await tx
      .insert(videoProjects)
      .values({
        id: uuid(),
        userId: source.userId,
        name: cleanProjectName(name),
        aspect: content.aspect,
        timeline: content.timeline,
        // The look goes with the copy, which is how the next video in a
        // series starts from the same one.
        style: source.style,
        styleMediaId: source.styleMediaId,
        // So do the viral video it copies (or that video's title, once it
        // was deleted), the Viral project it came from, and its spend limit.
        sourceViralVideoId: source.sourceViralVideoId,
        sourceViralVideoTitle: source.sourceViralVideoTitle,
        sourceViralProjectId: source.sourceViralProjectId,
        spendLimitCents: source.spendLimitCents,
        // And the extras picked in its AI clip panel, for the same reason.
        extraPicks: source.extraPicks,
        // A language copy says what it is a copy of; any other copy does not.
        languageOf: translated?.languageOf ?? null,
        language: translated?.language ?? null,
        // The copy is its own project from version 1; it shares nothing with
        // the original after this moment, and the background worker makes its
        // picture on the next pass, the same as any new project.
        version: 1,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
    // Its first frames come too, as new records of its own that show the
    // same pictures. A picture leaves storage only once nothing uses it.
    const frames = await tx
      .select()
      .from(videoFirstFrames)
      .where(eq(videoFirstFrames.projectId, source.id))
    if (frames.length) {
      await tx.insert(videoFirstFrames).values(
        frames.map((frame) => ({ ...frame, id: uuid(), projectId: row.id }))
      )
    }
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
 * Project settings: the name, the look and the spend limit, saved together. None of them is
 * part of the timeline, so `version` stays where it is and an editor open on
 * the project carries on saving. The look picture arrives as the address the
 * Media picker handed back and is kept by its library id; anything that is not
 * one of the person's own pictures is refused.
 */
export async function saveOwnedProjectSettings(
  userId: string,
  projectId: string,
  settings: {
    name: string
    style: string | null
    lookPictureUrl: string | null
    spendLimitCents: number | null
  },
  database: CustomShellDb = db
): Promise<ProjectItem> {
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
      spendLimitCents: settings.spendLimitCents,
      updatedAt: now(),
    })
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .returning()
  if (!row) {
    throw new Error(PROJECT_NOT_FOUND_MESSAGE)
  }
  return serializeOneProject(row, database)
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
  database: CustomShellDb = db,
  /** "Sam via Project" for a guest sent from Project; null for the owner. */
  editedBy: string | null = null
): Promise<ProjectItem> {
  const canonical = requireCanonicalTimeline(timeline)
  const owned = and(
    eq(videoProjects.id, projectId),
    eq(videoProjects.userId, userId),
    eq(videoProjects.version, expectedVersion)
  )

  const saved = await database.transaction(async (tx) => {
    // The row stays locked until the save lands, so two saves cannot both
    // decide a version is due (see workspace/docs/project-history.md).
    const [current] = await tx
      .select({
        id: videoProjects.id,
        userId: videoProjects.userId,
        createdAt: videoProjects.createdAt,
        updatedAt: videoProjects.updatedAt,
        lastEditedBy: videoProjects.lastEditedBy,
        // Written out in full for the same reason as the picture below.
        lastKeptAt: sql`(select max(v.created_at) from video_project_versions v where v.project_id = video_projects.id)`.mapWith(
          videoProjectVersions.createdAt
        ),
      })
      .from(videoProjects)
      .where(owned)
      .for("update")
    if (!current) return undefined
    const at = now()
    const reason = versionDue(current, current.lastKeptAt, at)
    if (reason) await keepVersionBeforeSave(tx, current, reason, at)

    const [row] = await tx
      .update(videoProjects)
      .set({
        timeline: canonical,
        // Kept in step with the timeline by this one statement, so the column
        // and the document can never disagree.
        aspect: canonical.aspect,
        version: expectedVersion + 1,
        updatedAt: at,
        lastEditedBy: editedBy,
      })
      .where(owned)
      .returning({
        ...getTableColumns(videoProjects),
        // The picture is read by this same statement. Written out in full
        // because Drizzle leaves columns unqualified inside an UPDATE.
        thumbnailPath: sql<string | null>`(select t.storage_path from video_project_thumbnails t where t.project_id = video_projects.id)`,
      })
    return row
  })

  if (saved) {
    const { thumbnailPath, ...row } = saved
    return serializeProject(row, {
      ...(await extrasFor([row], database, false))(row),
      thumbnail: {
        url: await pictureUrl(thumbnailPath),
        // Saved this instant, so the worker has not looked at it yet.
        pending: true,
      },
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

/** One version, with its timeline pointed at today's addresses for its media. */
export async function getOwnedProjectVersion(
  userId: string,
  projectId: string,
  versionId: string,
  database: CustomShellDb = db
): Promise<ProjectVersionItem & { timeline: ProjectTimeline }> {
  const { row, timeline } = await readOwnedProjectVersion(
    userId,
    projectId,
    versionId,
    database
  )
  return {
    ...serializeVersion(row),
    timeline: await resolveTimelineMediaUrls(userId, timeline, database),
  }
}

/**
 * The first half of a restore. Keeps what the project holds now as a
 * "Before restoring" version and hands back the chosen version's timeline.
 * The editor then puts it on screen as one edit, and its own save writes it,
 * so `writeProjectTimeline` stays the one place a timeline is written.
 */
export async function restoreOwnedProjectVersion(
  userId: string,
  projectId: string,
  versionId: string,
  database: CustomShellDb = db
): Promise<ProjectTimeline> {
  const timeline = await database.transaction(async (tx) => {
    const project = await getOwnedProject(userId, projectId, tx)
    // Read before anything is kept, because keeping one can push the oldest
    // out, and the oldest may be the one being restored.
    const { timeline } = await readOwnedProjectVersion(
      userId,
      projectId,
      versionId,
      tx
    )
    await keepVersionBeforeRestore(tx, project, now())
    return timeline
  })
  return resolveTimelineMediaUrls(userId, timeline, database)
}

/** What deleting these projects takes with it, counted for the delete window. */
export type ProjectDeleteSummary = {
  first_frames: number
  ai_clips: number
  exports: number
  /** Carousels that belong to the projects; the window asks what to do. */
  carousels: number
}

export async function summarizeProjectDelete(
  userId: string,
  projectIds: string[],
  database: CustomShellDb = db
): Promise<ProjectDeleteSummary> {
  const ids = [...new Set(projectIds)]
  if (!ids.length) {
    return { first_frames: 0, ai_clips: 0, exports: 0, carousels: 0 }
  }
  const owned = and(
    eq(videoProjects.userId, userId),
    inArray(videoProjects.id, ids)
  )
  const [[frames], [clips], [exports], [carousels]] = await Promise.all([
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
 * Deleting projects. The library files a project merely used are left alone
 * on purpose: they are the person's own library, shared with every other
 * project, and a delete here must never take footage away from somewhere else.
 *
 * What was made for the project does go. Its first frames and AI clips go with
 * the row, and their pictures and clips leave storage afterwards unless
 * another project, an actor or a carousel still uses them. A picture that will
 * not come out is logged and left in the library, where it can be deleted by
 * hand; the project is gone either way.
 *
 * The project's exports and its picture do go, because their rows go with it.
 * Their files are removed from storage first, the same way deleting an export
 * does it, and a project whose files would not come out is kept and comes back
 * in `failed_ids`, so no file is ever left with nothing pointing at it.
 */
export async function deleteOwnedProjects(
  userId: string,
  projectIds: string[],
  database: CustomShellDb = db,
  /**
   * The delete window asks each time (workspace/docs/carousel-projects.md):
   * true deletes the projects' carousels too, false keeps them with no
   * project.
   */
  deleteCarousels = false
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
      // From the joined project, so it is never empty: a carousel export
      // has no project and never matches the join.
      projectId: videoProjects.id,
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
