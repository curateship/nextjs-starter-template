import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
  type SQL,
} from "drizzle-orm"

import { PROJECT_NOT_FOUND_MESSAGE, REFUSED_COPY_SUFFIX } from "@/lib/video/projects"
import {
  newVideoName,
  VIDEO_NAME_MAX,
  VIDEO_NAME_REQUIRED_MESSAGE,
  VIDEO_NOT_FOUND_MESSAGE,
  type VideoSort,
  type VideoStatus,
} from "@/lib/video/project-videos"
import {
  createEmptyTimeline,
  parseTimelineForReset,
  PROJECT_CONFLICT_MESSAGE,
  requireCanonicalTimeline,
  summarizeTimeline,
  type AspectRatio,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { languageCopyName, type TranslateLanguage } from "@/lib/video/translate"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia } from "@/server/media/library"
import { deleteFromR2, getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { removeExportFiles } from "@/server/video/export-files"
import { videoPlaybackUrl } from "@/server/video/media-urls"
import {
  keepVersionBeforeRestore,
  keepVersionBeforeSave,
  readOwnedVideoVersion,
  serializeVersion,
  versionDue,
  type ProjectVersionItem,
} from "@/server/video/project-versions"
import {
  videoBriefs,
  videoEditorWindows,
  videoMediaProxies,
  videoProjectLastVideos,
  videoProjects,
  videoProjectThumbnails,
  videoProjectVersions,
  videoProjectVideos,
  videoRenderJobs,
  videoThumbnails,
  videoViralVideos,
  type VideoProjectVideoRow,
} from "@/server/video/schema"

/**
 * The videos in a project (`workspace/docs/project-videos.md`), and the one
 * write path for a timeline.
 *
 * Two rules hold this together. Every read re-derives a clip's address from
 * its media id rather than trusting the address stored months ago, so a moved
 * file or a newly built proxy is picked up on open. And every write is a
 * compare-and-swap on `version`, so the second of two open tabs is told it
 * lost instead of quietly overwriting the first.
 */

export type VideoSource = {
  id: string
  title: string | null
  cover_url: string | null
}

/** A row of the Videos tab. It never carries the timeline, which can be megabytes. */
export type VideoItem = {
  id: string
  project_id: string
  name: string
  aspect: AspectRatio
  clip_count: number
  duration_ms: number
  /** Send this back with the next save; see writeVideoTimeline. */
  version: number
  status: VideoStatus
  pinned: boolean
  archived: boolean
  /** The most AI spending allowed on this video, in cents; null is no limit. */
  spend_limit_cents: number | null
  /** The first clip's picture, once the background worker has made one. */
  thumbnail_url: string | null
  /** A picture is waiting to be made, so the list looks again shortly. */
  thumbnail_pending: boolean
  /** The viral video this video copies, from Make this a template. */
  source: VideoSource | null
  /** The title of the copied video once that saved video was deleted. */
  source_title_kept: string | null
  /** The Viral project Make this a template was pressed in. */
  source_viral_project_id: string | null
  /** The language a language copy speaks, null on every other video. */
  language: string | null
  /** The video this one is a language copy of. */
  language_of: string | null
  created_at: string
  updated_at: string
}

/** What the editor opens with: the row plus the timeline to draw. */
export type VideoDetail = VideoItem & {
  timeline: ProjectTimeline
  /** Set when the stored timeline no longer validates; the editor says so. */
  timeline_error: string | null
}

export function cleanVideoName(value: string) {
  const name = value.trim().replace(/\s+/g, " ")
  if (!name) throw new Error(VIDEO_NAME_REQUIRED_MESSAGE)
  return name.slice(0, VIDEO_NAME_MAX)
}

/** One of this person's videos. Somebody else's is "not found", never "forbidden". */
export async function getOwnedVideo(
  userId: string,
  videoId: string,
  database: CustomShellDb = db
): Promise<VideoProjectVideoRow> {
  const [row] = await database
    .select()
    .from(videoProjectVideos)
    .where(and(eq(videoProjectVideos.id, videoId), eq(videoProjectVideos.userId, userId)))
    .limit(1)
  if (!row) throw new Error(VIDEO_NOT_FOUND_MESSAGE)
  return row
}

/**
 * Refuses a project that is not this person's. Kept here rather than calling
 * `getOwnedProject`, because `projects.ts` imports this file.
 */
async function requireOwnedProjectId(
  userId: string,
  projectId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select({ id: videoProjects.id })
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  if (!row) throw new Error(PROJECT_NOT_FOUND_MESSAGE)
}

/**
 * Point every media-backed clip at the address to play it from today: the
 * smooth proxy when one is ready, the original file otherwise. A stored address
 * is never handed back as-is. It was written whenever the clip was added, and
 * anything could have changed since.
 *
 * A clip whose media the person no longer owns keeps its own stored address:
 * the clip stays visible with a broken picture rather than vanishing, which is
 * a state somebody can see and fix.
 */
export async function resolveTimelineMediaUrls(
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
    .leftJoin(videoMediaProxies, eq(videoMediaProxies.mediaId, customShellMedia.id))
    .where(and(eq(customShellMedia.userId, userId), inArray(customShellMedia.id, mediaIds)))

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

export type VideoThumbnail = { url: string | null; pending: boolean }

// A video the worker has not looked at yet, such as one made seconds ago, has
// no row. It gets one on the next tick, so it counts as waiting.
export const NOT_LOOKED_AT_YET: VideoThumbnail = { url: null, pending: true }

async function pictureUrl(storagePath: string | null) {
  return storagePath ? getPublicMediaUrl(storagePath) : null
}

/**
 * The main wide thumbnails of some videos, as picture addresses (part 7 of
 * the Thumbnail task, thumbnails.md). A video with none keeps its first
 * clip's frame.
 */
async function mainThumbnailUrls(videoIds: string[], database: CustomShellDb) {
  const urls = new Map<string, string>()
  if (!videoIds.length) return urls
  const rows = await database
    .select({ videoId: videoThumbnails.videoId, storagePath: customShellMedia.storagePath })
    .from(videoThumbnails)
    .innerJoin(customShellMedia, eq(customShellMedia.id, videoThumbnails.mediaId))
    .where(
      and(
        inArray(videoThumbnails.videoId, videoIds),
        eq(videoThumbnails.isMain, true),
        eq(videoThumbnails.shape, "wide")
      )
    )
  for (const row of rows) urls.set(row.videoId, await getPublicMediaUrl(row.storagePath))
  return urls
}

/** The pictures for a list of videos, in one query rather than one each. */
export async function thumbnailsForVideos(
  rows: Pick<VideoProjectVideoRow, "id" | "updatedAt">[],
  database: CustomShellDb
) {
  const thumbnails = new Map<string, VideoThumbnail>()
  if (!rows.length) return thumbnails
  const stored = await database
    .select()
    .from(videoProjectThumbnails)
    .where(inArray(videoProjectThumbnails.videoId, rows.map((row) => row.id)))
  const savedAt = new Map(rows.map((row) => [row.id, row.updatedAt.getTime()]))
  // A main thumbnail from the Thumbnail section wins over the first clip's
  // frame (thumbnails.md).
  const mains = await mainThumbnailUrls(rows.map((row) => row.id), database)
  for (const [videoId, url] of mains) thumbnails.set(videoId, { url, pending: false })
  for (const row of stored) {
    if (mains.has(row.videoId)) continue
    thumbnails.set(row.videoId, {
      url: await pictureUrl(row.storagePath),
      // Saved since the worker last looked, so its first clip may have
      // changed: the list keeps asking until the worker has seen the save.
      pending:
        row.status === "queued" ||
        row.status === "generating" ||
        (savedAt.get(row.videoId) ?? 0) > row.checkedAt.getTime(),
    })
  }
  return thumbnails
}

/**
 * The viral videos a list of videos copies, in one query. Only ever the
 * video owner's own saved video.
 */
export async function sourcesForVideos(
  rows: Pick<VideoProjectVideoRow, "userId" | "sourceViralVideoId">[],
  database: CustomShellDb
) {
  const sources = new Map<string, VideoSource>()
  const ids = [...new Set(rows.flatMap((row) => row.sourceViralVideoId ?? []))]
  if (!ids.length) return sources
  const found = await database
    .select({
      id: videoViralVideos.id,
      title: videoViralVideos.title,
      cover: videoViralVideos.thumbnailStoragePath,
    })
    .from(videoViralVideos)
    .where(
      and(
        inArray(videoViralVideos.id, ids),
        inArray(videoViralVideos.ownerId, [...new Set(rows.map((row) => row.userId))])
      )
    )
  for (const row of found) {
    sources.set(row.id, { id: row.id, title: row.title, cover_url: await pictureUrl(row.cover) })
  }
  return sources
}

// Every column but the timeline, which a list never needs.
const { timeline: _timeline, ...videoListColumns } = getTableColumns(videoProjectVideos)
type VideoListRow = Omit<VideoProjectVideoRow, "timeline">

function serializeVideo(
  row: VideoListRow,
  thumbnail: VideoThumbnail,
  source: VideoSource | null
): VideoItem {
  return {
    id: row.id,
    project_id: row.projectId,
    name: row.name,
    aspect: row.aspect as AspectRatio,
    clip_count: row.clipCount,
    duration_ms: row.durationMs,
    version: row.version,
    status: row.status,
    pinned: row.pinnedAt !== null,
    archived: row.archivedAt !== null,
    spend_limit_cents: row.spendLimitCents,
    thumbnail_url: thumbnail.url,
    thumbnail_pending: thumbnail.pending,
    source,
    source_title_kept: row.sourceViralVideoTitle,
    source_viral_project_id: row.sourceViralProjectId,
    language: row.language,
    language_of: row.languageOf,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

/** Rows to items, pictures and copied videos included, in two queries. */
export async function serializeVideos(
  rows: VideoListRow[],
  database: CustomShellDb
): Promise<VideoItem[]> {
  const [thumbnails, sources] = await Promise.all([
    thumbnailsForVideos(rows, database),
    sourcesForVideos(rows, database),
  ])
  return rows.map((row) =>
    serializeVideo(
      row,
      thumbnails.get(row.id) ?? NOT_LOOKED_AT_YET,
      row.sourceViralVideoId ? (sources.get(row.sourceViralVideoId) ?? null) : null
    )
  )
}

async function serializeOneVideo(row: VideoListRow, database: CustomShellDb) {
  const [item] = await serializeVideos([row], database)
  return item
}

function orderFor(sort: VideoSort): SQL[] {
  // Pinned first whatever the sort, earliest pin on top, as on the projects list.
  const pinned = [sql`${videoProjectVideos.pinnedAt} is null`, asc(videoProjectVideos.pinnedAt)]
  if (sort === "name") {
    return [...pinned, sql`lower(${videoProjectVideos.name})`, asc(videoProjectVideos.id)]
  }
  if (sort === "newest") {
    return [...pinned, desc(videoProjectVideos.createdAt), desc(videoProjectVideos.id)]
  }
  return [...pinned, desc(videoProjectVideos.updatedAt), desc(videoProjectVideos.id)]
}

/** The most rows one Videos tab answer holds. A project of more scrolls in pages. */
export const VIDEO_PAGE_MAX = 200

export type VideoListResponse = {
  videos: VideoItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/**
 * A project's videos for the Videos tab. Search matches the name, with the
 * wildcards escaped so "100%" finds "100%" rather than everything. Archived
 * videos are listed only when asked for.
 */
export async function listProjectVideos({
  userId,
  projectId,
  search = "",
  sort = "edited",
  status,
  archived = false,
  page = 1,
  pageSize = VIDEO_PAGE_MAX,
  database = db,
}: {
  userId: string
  projectId: string
  search?: string
  sort?: VideoSort
  status?: VideoStatus
  archived?: boolean
  page?: number
  pageSize?: number
  database?: CustomShellDb
}): Promise<VideoListResponse> {
  await requireOwnedProjectId(userId, projectId, database)
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(VIDEO_PAGE_MAX, Math.max(1, Math.floor(pageSize)))
  const filters: SQL[] = [
    eq(videoProjectVideos.projectId, projectId),
    eq(videoProjectVideos.userId, userId),
    archived ? isNotNull(videoProjectVideos.archivedAt) : isNull(videoProjectVideos.archivedAt),
  ]
  if (status) filters.push(eq(videoProjectVideos.status, status))
  const cleaned = search.trim()
  if (cleaned) {
    filters.push(ilike(videoProjectVideos.name, `%${cleaned.replace(/([\\%_])/g, "\\$1")}%`))
  }
  const where = and(...filters)
  const [rows, [totals]] = await Promise.all([
    database
      .select(videoListColumns)
      .from(videoProjectVideos)
      .where(where)
      .orderBy(...orderFor(sort))
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    database.select({ total: sql<number>`count(*)::int` }).from(videoProjectVideos).where(where),
  ])
  const total = totals?.total ?? 0
  return {
    videos: await serializeVideos(rows, database),
    total,
    page: safePage,
    page_size: safePageSize,
    total_pages: Math.max(1, Math.ceil(total / safePageSize)),
  }
}

/** One video with its timeline pointed at today's addresses for its media. */
export async function getOwnedVideoDetail(
  userId: string,
  videoId: string,
  database: CustomShellDb = db
): Promise<VideoDetail> {
  const row = await getOwnedVideo(userId, videoId, database)
  return detailOf(row, database)
}

async function detailOf(row: VideoProjectVideoRow, database: CustomShellDb): Promise<VideoDetail> {
  const { timeline, error } = parseTimelineForReset(row.timeline)
  return {
    ...(await serializeOneVideo(row, database)),
    timeline: await resolveTimelineMediaUrls(row.userId, timeline, database),
    timeline_error: error,
  }
}

/**
 * The video the editor opens in a project, for one person: the one asked
 * for, else the one they last had open, else the first in the Videos tab's
 * own order (Tyler, 1 Nov 2026: "If its the first time the project open then
 * it would select the first video, after that it remembers the last video").
 * Archived videos are opened only when asked for by name, or when every
 * video is archived. A project with no video at all answers null, and the
 * editor offers New video. Nothing is written here: this runs on a page
 * load, which a link can start just by being pointed at.
 */
export async function openProjectVideo({
  userId,
  projectId,
  videoId,
  person,
  database = db,
}: {
  userId: string
  projectId: string
  videoId?: string
  /** Whose last video this is: `personKey` below. */
  person: string
  database?: CustomShellDb
}): Promise<VideoDetail | null> {
  await requireOwnedProjectId(userId, projectId, database)
  const inProject = and(
    eq(videoProjectVideos.projectId, projectId),
    eq(videoProjectVideos.userId, userId)
  )
  if (videoId) {
    const [row] = await database
      .select()
      .from(videoProjectVideos)
      .where(and(inProject, eq(videoProjectVideos.id, videoId)))
      .limit(1)
    if (!row) throw new Error(VIDEO_NOT_FOUND_MESSAGE)
    return detailOf(row, database)
  }
  const [remembered] = await database
    .select({ video: videoProjectVideos })
    .from(videoProjectLastVideos)
    .innerJoin(videoProjectVideos, eq(videoProjectVideos.id, videoProjectLastVideos.videoId))
    .where(
      and(
        eq(videoProjectLastVideos.projectId, projectId),
        eq(videoProjectLastVideos.person, person),
        inProject,
        isNull(videoProjectVideos.archivedAt)
      )
    )
    .limit(1)
  if (remembered) return detailOf(remembered.video, database)
  const [first] = await database
    .select()
    .from(videoProjectVideos)
    .where(inProject)
    // Not archived first, then the Videos tab's own order.
    .orderBy(sql`${videoProjectVideos.archivedAt} is not null`, ...orderFor("edited"))
    .limit(1)
  return first ? detailOf(first, database) : null
}

/** How `video_project_last_videos.person` names a signed-in person or a guest. */
export function personKey(actor: { userId: string; guestId: string | null }) {
  return actor.guestId ? `guest:${actor.guestId}` : actor.userId
}

/** Remembers the video a person has open, so the project opens on it next time. */
export async function rememberOpenVideo(
  userId: string,
  videoId: string,
  person: string,
  database: CustomShellDb = db
) {
  const video = await getOwnedVideo(userId, videoId, database)
  const at = now()
  await database
    .insert(videoProjectLastVideos)
    .values({ projectId: video.projectId, person, videoId: video.id, updatedAt: at })
    .onConflictDoUpdate({
      target: [videoProjectLastVideos.projectId, videoProjectLastVideos.person],
      set: { videoId: video.id, updatedAt: at },
    })
}

type NewVideo = {
  name?: string
  /** The shape of an empty video. Left out, the project's last edited one's. */
  aspect?: AspectRatio
  status?: VideoStatus
  /** A timeline the schema has already checked; empty when left out. */
  timeline?: ProjectTimeline
  sourceViralVideoId?: string | null
  sourceViralVideoTitle?: string | null
  sourceViralProjectId?: string | null
  spendLimitCents?: number | null
  languageOf?: string | null
  language?: string | null
  /**
   * When it counts as last edited. A duplicate takes a moment before its
   * original's, so under "Last edited" it sits right under it.
   */
  editedAt?: Date
}

/**
 * Adds a video to one of this person's projects. A blank one starts in the
 * shape of the project's last edited video (Tyler, 1 Nov 2026), or upright
 * in a project with none, and is named "Video 4" in a project of three.
 */
export async function createVideo(
  userId: string,
  projectId: string,
  video: NewVideo,
  database: CustomShellDb = db
): Promise<VideoItem> {
  await requireOwnedProjectId(userId, projectId, database)
  const row = await insertVideo(userId, projectId, video, database)
  return serializeOneVideo(row, database)
}

/** The insert behind every new video. The caller has checked the project. */
export async function insertVideo(
  userId: string,
  projectId: string,
  video: NewVideo,
  database: CustomShellDb
): Promise<VideoProjectVideoRow> {
  let timeline = video.timeline
  if (!timeline && video.aspect) {
    timeline = { ...createEmptyTimeline(), aspect: video.aspect }
  }
  if (!timeline) {
    const [last] = await database
      .select({ aspect: videoProjectVideos.aspect })
      .from(videoProjectVideos)
      .where(eq(videoProjectVideos.projectId, projectId))
      .orderBy(desc(videoProjectVideos.updatedAt))
      .limit(1)
    timeline = { ...createEmptyTimeline(), ...(last ? { aspect: last.aspect as AspectRatio } : {}) }
  }
  let name = video.name
  if (!name) {
    const [counted] = await database
      .select({ total: sql<number>`count(*)::int` })
      .from(videoProjectVideos)
      .where(eq(videoProjectVideos.projectId, projectId))
    name = newVideoName(counted?.total ?? 0)
  }
  const stats = summarizeTimeline(timeline)
  const at = now()
  const [row] = await database
    .insert(videoProjectVideos)
    .values({
      id: uuid(),
      projectId,
      userId,
      name: cleanVideoName(name),
      aspect: timeline.aspect,
      ...(video.status ? { status: video.status } : {}),
      timeline,
      clipCount: stats.clipCount,
      durationMs: Math.round(stats.durationMs),
      spendLimitCents: video.spendLimitCents ?? null,
      sourceViralVideoId: video.sourceViralVideoId ?? null,
      sourceViralVideoTitle: video.sourceViralVideoTitle ?? null,
      sourceViralProjectId: video.sourceViralProjectId ?? null,
      languageOf: video.languageOf ?? null,
      language: video.language ?? null,
      createdAt: at,
      updatedAt: video.editedAt ?? at,
    })
    .returning()
  await touchProject(projectId, at, database)
  return row
}

/** A project's "last edited" moves whenever one of its videos changes. */
async function touchProject(projectId: string, at: Date, database: CustomShellDb) {
  await database.update(videoProjects).set({ updatedAt: at }).where(eq(videoProjects.id, projectId))
}

/** What a copy of a video takes from its original besides the timeline. */
function carriedFrom(source: VideoProjectVideoRow): NewVideo {
  return {
    sourceViralVideoId: source.sourceViralVideoId,
    sourceViralVideoTitle: source.sourceViralVideoTitle,
    sourceViralProjectId: source.sourceViralProjectId,
    spendLimitCents: source.spendLimitCents,
  }
}

/**
 * Duplicate: the copy goes in the same project, named "copy", and sits under
 * the original in the Videos tab (Tyler, 1 Nov 2026). The stored timeline is
 * passed over as it is, even one that no longer parses.
 */
export async function duplicateVideo(
  userId: string,
  videoId: string,
  database: CustomShellDb = db
): Promise<VideoItem> {
  const source = await getOwnedVideo(userId, videoId, database)
  const parsed = parseTimelineForReset(source.timeline)
  const row = await insertVideo(
    userId,
    source.projectId,
    {
      ...carriedFrom(source),
      name: `${source.name} copy`,
      timeline: parsed.error ? undefined : parsed.timeline,
      editedAt: new Date(source.updatedAt.getTime() - 1),
    },
    database
  )
  if (parsed.error) {
    // Copied byte for byte, so a broken timeline stays broken rather than
    // turning into an empty one without saying so.
    await database
      .update(videoProjectVideos)
      .set({ timeline: source.timeline, aspect: source.aspect })
      .where(eq(videoProjectVideos.id, row.id))
  }
  return getOwnedVideoDetail(userId, row.id, database)
}

/**
 * Keeps the work of a window whose save was refused because the video changed
 * in another window. It becomes a new video beside the original in the same
 * project, holding exactly what that window had on screen.
 */
export async function keepRefusedVideoTimeline(
  userId: string,
  videoId: string,
  timeline: ProjectTimeline,
  database: CustomShellDb = db
): Promise<VideoItem> {
  const canonical = requireCanonicalTimeline(timeline)
  const source = await getOwnedVideo(userId, videoId, database)
  const row = await insertVideo(
    userId,
    source.projectId,
    { ...carriedFrom(source), name: `${source.name} ${REFUSED_COPY_SUFFIX}`, timeline: canonical },
    database
  )
  return serializeOneVideo(row, database)
}

/**
 * A copy of one of the caller's own videos in another language, in the same
 * project, holding a timeline already laid with the new voice and its
 * captions. It is named "My Short (Spanish)" and remembers the video it came
 * from. The original is only read.
 */
export async function insertLanguageCopy(
  source: VideoProjectVideoRow,
  language: TranslateLanguage,
  timeline: ProjectTimeline,
  database: CustomShellDb = db
): Promise<VideoItem> {
  const canonical = requireCanonicalTimeline(timeline)
  const row = await insertVideo(
    source.userId,
    source.projectId,
    {
      ...carriedFrom(source),
      name: languageCopyName(source.name, language),
      timeline: canonical,
      // A copy made from a copy belongs with the first original.
      languageOf: source.languageOf ?? source.id,
      language,
    },
    database
  )
  return serializeOneVideo(row, database)
}

async function updateOwnedVideo(
  userId: string,
  videoId: string,
  values: Partial<VideoProjectVideoRow>,
  database: CustomShellDb
): Promise<VideoItem> {
  const [row] = await database
    .update(videoProjectVideos)
    .set(values)
    .where(and(eq(videoProjectVideos.id, videoId), eq(videoProjectVideos.userId, userId)))
    .returning(videoListColumns)
  if (!row) throw new Error(VIDEO_NOT_FOUND_MESSAGE)
  return serializeOneVideo(row, database)
}

export async function renameVideo(
  userId: string,
  videoId: string,
  name: string,
  database: CustomShellDb = db
): Promise<VideoItem> {
  // The name is not part of the timeline, so `version` stays where it is and
  // an editor open on the video carries on saving.
  return updateOwnedVideo(userId, videoId, { name: cleanVideoName(name) }, database)
}

export async function setVideoStatus(
  userId: string,
  videoId: string,
  status: VideoStatus,
  database: CustomShellDb = db
): Promise<VideoItem> {
  return updateOwnedVideo(userId, videoId, { status }, database)
}

export async function setVideoPinned(
  userId: string,
  videoId: string,
  pinned: boolean,
  database: CustomShellDb = db
): Promise<VideoItem> {
  return updateOwnedVideo(userId, videoId, { pinnedAt: pinned ? now() : null }, database)
}

/** The most AI spending one video may reach, from the editor's settings. */
export async function saveVideoSpendLimit(
  userId: string,
  videoId: string,
  spendLimitCents: number | null,
  database: CustomShellDb = db
): Promise<VideoItem> {
  return updateOwnedVideo(userId, videoId, { spendLimitCents }, database)
}

export type VideoBatchResult = { done_ids: string[]; skipped_ids: string[] }

/**
 * Archives videos, or brings them back. Archiving takes the pin off, as it
 * does for projects. A video that is not the caller's, or is already where it
 * was asked to go, comes back in `skipped_ids`.
 */
export async function setVideosArchived(
  userId: string,
  videoIds: string[],
  archived: boolean,
  database: CustomShellDb = db
): Promise<VideoBatchResult> {
  const ids = [...new Set(videoIds)]
  if (!ids.length) return { done_ids: [], skipped_ids: [] }
  const rows = await database
    .update(videoProjectVideos)
    .set(archived ? { archivedAt: now(), pinnedAt: null } : { archivedAt: null })
    .where(
      and(
        eq(videoProjectVideos.userId, userId),
        inArray(videoProjectVideos.id, ids),
        archived ? isNull(videoProjectVideos.archivedAt) : isNotNull(videoProjectVideos.archivedAt)
      )
    )
    .returning({ id: videoProjectVideos.id })
  const done = rows.map((row) => row.id)
  return { done_ids: done, skipped_ids: ids.filter((id) => !done.includes(id)) }
}

/**
 * Moves videos into another of this person's projects, from a video's menu
 * (Tyler, 1 Nov 2026). Their history, exports, briefs and open windows go
 * with them. The first frames and AI shots stay with the old project, which
 * they belong to; clips already on the timeline keep playing, because a clip
 * points at its library file, not at the shot.
 */
export async function moveVideos(
  userId: string,
  videoIds: string[],
  targetProjectId: string,
  database: CustomShellDb = db
): Promise<VideoBatchResult> {
  const ids = [...new Set(videoIds)]
  if (!ids.length) return { done_ids: [], skipped_ids: [] }
  await requireOwnedProjectId(userId, targetProjectId, database)
  const moved = await database.transaction(async (tx) => {
    const rows = await tx
      .select({ id: videoProjectVideos.id, projectId: videoProjectVideos.projectId })
      .from(videoProjectVideos)
      .where(
        and(
          eq(videoProjectVideos.userId, userId),
          inArray(videoProjectVideos.id, ids),
          ne(videoProjectVideos.projectId, targetProjectId)
        )
      )
      .for("update")
    const movable = rows.map((row) => row.id)
    if (!movable.length) return []
    const at = now()
    await tx
      .update(videoProjectVideos)
      .set({ projectId: targetProjectId, updatedAt: at })
      .where(inArray(videoProjectVideos.id, movable))
    await tx
      .update(videoProjectVersions)
      .set({ projectId: targetProjectId })
      .where(inArray(videoProjectVersions.videoId, movable))
    await tx
      .update(videoRenderJobs)
      .set({ projectId: targetProjectId })
      .where(inArray(videoRenderJobs.videoId, movable))
    await tx
      .update(videoBriefs)
      .set({ projectId: targetProjectId })
      .where(inArray(videoBriefs.videoId, movable))
    await tx.delete(videoEditorWindows).where(inArray(videoEditorWindows.videoId, movable))
    await tx.delete(videoProjectLastVideos).where(inArray(videoProjectLastVideos.videoId, movable))
    for (const projectId of new Set([targetProjectId, ...rows.map((row) => row.projectId)])) {
      await touchProject(projectId, at, tx)
    }
    return movable
  })
  return { done_ids: moved, skipped_ids: ids.filter((id) => !moved.includes(id)) }
}

/** What deleting these videos takes with it, counted for the delete window. */
export type VideoDeleteSummary = { videos: number; exports: number }

export async function summarizeVideoDelete(
  userId: string,
  videoIds: string[],
  database: CustomShellDb = db
): Promise<VideoDeleteSummary> {
  const ids = [...new Set(videoIds)]
  if (!ids.length) return { videos: 0, exports: 0 }
  const owned = and(eq(videoProjectVideos.userId, userId), inArray(videoProjectVideos.id, ids))
  const [[videos], [exports]] = await Promise.all([
    database.select({ total: sql<number>`count(*)::int` }).from(videoProjectVideos).where(owned),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(videoRenderJobs)
      .innerJoin(videoProjectVideos, eq(videoProjectVideos.id, videoRenderJobs.videoId))
      .where(owned),
  ])
  return { videos: videos?.total ?? 0, exports: exports?.total ?? 0 }
}

/**
 * Removes the export files and pictures of these videos from storage. A
 * video whose files would not come out is left out of the returned set, so
 * no file is ever left with nothing pointing at it.
 */
export async function removeVideoFiles(
  videoIds: string[],
  database: CustomShellDb
): Promise<Set<string>> {
  const clean = new Set(videoIds)
  if (!videoIds.length) return clean
  const exportRows = await database
    .select({
      id: videoRenderJobs.id,
      videoId: videoRenderJobs.videoId,
      storagePath: videoRenderJobs.storagePath,
      thumbnailStoragePath: videoRenderJobs.thumbnailStoragePath,
    })
    .from(videoRenderJobs)
    .where(inArray(videoRenderJobs.videoId, videoIds))
  const removed = await removeExportFiles(exportRows)
  for (const row of exportRows) {
    if (!removed.has(row.id) && row.videoId) clean.delete(row.videoId)
  }
  const pictures = await database
    .select({ videoId: videoProjectThumbnails.videoId, storagePath: videoProjectThumbnails.storagePath })
    .from(videoProjectThumbnails)
    .where(
      and(inArray(videoProjectThumbnails.videoId, videoIds), isNotNull(videoProjectThumbnails.storagePath))
    )
  for (const picture of pictures) {
    if (!clean.has(picture.videoId) || !picture.storagePath) continue
    try {
      await deleteFromR2(picture.storagePath)
    } catch (error) {
      console.error("Video picture removal failed", picture.videoId, error)
      clean.delete(picture.videoId)
    }
  }
  return clean
}

/**
 * Deletes videos and their history, exports and picture. The library files
 * they used are left alone, as a project delete leaves them, and the first
 * frames and AI shots stay with the project. A video whose files would not
 * come out of storage is kept and comes back in `failed_ids`.
 */
export async function deleteVideos(
  userId: string,
  videoIds: string[],
  database: CustomShellDb = db
): Promise<{ deleted_ids: string[]; failed_ids: string[] }> {
  const ids = [...new Set(videoIds)]
  if (!ids.length) return { deleted_ids: [], failed_ids: [] }
  const owned = await database
    .select({ id: videoProjectVideos.id, projectId: videoProjectVideos.projectId })
    .from(videoProjectVideos)
    .where(and(eq(videoProjectVideos.userId, userId), inArray(videoProjectVideos.id, ids)))
  const clean = await removeVideoFiles(owned.map((row) => row.id), database)
  const deletable = [...clean]
  if (!deletable.length) {
    return { deleted_ids: [], failed_ids: owned.map((row) => row.id) }
  }
  const rows = await database
    .delete(videoProjectVideos)
    .where(and(eq(videoProjectVideos.userId, userId), inArray(videoProjectVideos.id, deletable)))
    .returning({ id: videoProjectVideos.id, projectId: videoProjectVideos.projectId })
  const at = now()
  for (const projectId of new Set(rows.map((row) => row.projectId))) {
    await touchProject(projectId, at, database)
  }
  return {
    deleted_ids: rows.map((row) => row.id),
    failed_ids: owned.map((row) => row.id).filter((id) => !clean.has(id)),
  }
}

/**
 * The one timeline write path. The update lands only while the video is
 * still at `expectedVersion`, so a save built on a copy someone else has since
 * moved past is refused rather than applied over the top. Nothing else in this
 * app writes a timeline.
 */
export async function writeVideoTimeline(
  userId: string,
  videoId: string,
  timeline: ProjectTimeline,
  expectedVersion: number,
  database: CustomShellDb = db,
  /** "Sam via Project" for a guest sent from Project; null for the owner. */
  editedBy: string | null = null
): Promise<VideoItem> {
  const canonical = requireCanonicalTimeline(timeline)
  const stats = summarizeTimeline(canonical)
  const owned = and(
    eq(videoProjectVideos.id, videoId),
    eq(videoProjectVideos.userId, userId),
    eq(videoProjectVideos.version, expectedVersion)
  )

  const saved = await database.transaction(async (tx) => {
    // The row stays locked until the save lands, so two saves cannot both
    // decide a version is due (see workspace/docs/project-history.md).
    const [current] = await tx
      .select({
        id: videoProjectVideos.id,
        projectId: videoProjectVideos.projectId,
        userId: videoProjectVideos.userId,
        createdAt: videoProjectVideos.createdAt,
        updatedAt: videoProjectVideos.updatedAt,
        lastEditedBy: videoProjectVideos.lastEditedBy,
        // Written out in full for the same reason as the picture below.
        lastKeptAt: sql`(select max(v.created_at) from video_project_versions v where v.video_id = video_project_videos.id)`.mapWith(
          videoProjectVersions.createdAt
        ),
      })
      .from(videoProjectVideos)
      .where(owned)
      .for("update")
    if (!current) return undefined
    const at = now()
    const reason = versionDue(current, current.lastKeptAt, at)
    if (reason) await keepVersionBeforeSave(tx, current, reason, at)

    const [row] = await tx
      .update(videoProjectVideos)
      .set({
        timeline: canonical,
        // Kept in step with the timeline by this one statement, so the
        // columns and the document can never disagree.
        aspect: canonical.aspect,
        clipCount: stats.clipCount,
        durationMs: Math.round(stats.durationMs),
        version: expectedVersion + 1,
        updatedAt: at,
        lastEditedBy: editedBy,
      })
      .where(owned)
      .returning({
        ...videoListColumns,
        // The picture is read by this same statement. Written out in full
        // because Drizzle leaves columns unqualified inside an UPDATE.
        thumbnailPath: sql<string | null>`(select t.storage_path from video_video_thumbnails t where t.video_id = video_project_videos.id)`,
      })
    if (row) await touchProject(row.projectId, at, tx)
    return row
  })

  if (saved) {
    const { thumbnailPath, ...row } = saved
    const sources = await sourcesForVideos([row], database)
    return serializeVideo(
      row,
      // Saved this instant, so the worker has not looked at it yet.
      { url: await pictureUrl(thumbnailPath), pending: true },
      row.sourceViralVideoId ? (sources.get(row.sourceViralVideoId) ?? null) : null
    )
  }

  // Nothing was updated: either the video is gone (or never ours), or it has
  // moved past the version this save was built on. Only the second is a clash.
  const [existing] = await database
    .select({ id: videoProjectVideos.id })
    .from(videoProjectVideos)
    .where(and(eq(videoProjectVideos.id, videoId), eq(videoProjectVideos.userId, userId)))
    .limit(1)
  throw new Error(existing ? PROJECT_CONFLICT_MESSAGE : VIDEO_NOT_FOUND_MESSAGE)
}

/** One version, with its timeline pointed at today's addresses for its media. */
export async function getOwnedVideoVersion(
  userId: string,
  videoId: string,
  versionId: string,
  database: CustomShellDb = db
): Promise<ProjectVersionItem & { timeline: ProjectTimeline }> {
  const { row, timeline } = await readOwnedVideoVersion(userId, videoId, versionId, database)
  return {
    ...serializeVersion(row),
    timeline: await resolveTimelineMediaUrls(userId, timeline, database),
  }
}

/**
 * The first half of a restore. Keeps what the video holds now as a "Before
 * restoring" version and hands back the chosen version's timeline. The editor
 * then puts it on screen as one edit, and its own save writes it, so
 * `writeVideoTimeline` stays the one place a timeline is written.
 */
export async function restoreOwnedVideoVersion(
  userId: string,
  videoId: string,
  versionId: string,
  database: CustomShellDb = db
): Promise<ProjectTimeline> {
  const timeline = await database.transaction(async (tx) => {
    const video = await getOwnedVideo(userId, videoId, tx)
    // Read before anything is kept, because keeping one can push the oldest
    // out, and the oldest may be the one being restored.
    const { timeline } = await readOwnedVideoVersion(userId, videoId, versionId, tx)
    await keepVersionBeforeRestore(tx, video, now())
    return timeline
  })
  return resolveTimelineMediaUrls(userId, timeline, database)
}
