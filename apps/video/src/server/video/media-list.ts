import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm"

import { CAROUSEL_NOT_FOUND_MESSAGE, requireCanonicalCarouselSlides } from "@/lib/video/carousel-schema"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { parseTimelineForReset } from "@/lib/video/timeline-schema"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  deleteMediaAsAdmin,
  serializeMedia,
  type MediaItem,
} from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { collectionIdsByMedia } from "@/server/video/media-collections"
import { videoPlaybackUrl } from "@/server/video/media-urls"
import {
  videoMediaFilmstrips,
  videoMediaProxies,
  videoCarouselMedia,
  videoCarousels,
  videoProjectMedia,
  videoProjects,
} from "@/server/video/schema"

/**
 * The studio's own view of the media library: the shell's rows plus what this
 * app knows about each one — playback proxy, filmstrip, collections. A
 * separate query rather than a change to the shell's `listOwnedMedia`, because
 * that function is a shell file and this app may not edit it.
 */

export type VideoMediaItem = MediaItem & {
  /** The address to play — the smooth proxy when ready, the original file otherwise. */
  playback_url: string
  proxy_status: string | null
  filmstrip_status: string | null
  collection_ids: string[]
}

export type VideoMediaListResponse = {
  media: VideoMediaItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/** `undefined` = no filter, `null` = in no collection, a string = members of that one. */
export type CollectionFilter = string | null | undefined

export type MediaScope =
  | { type: "project"; id: string }
  | { type: "carousel"; id: string }

export async function listVideoMedia({
  userId,
  page = 1,
  pageSize = 24,
  search = "",
  fileType,
  collectionId,
  scope,
  database = db,
}: {
  userId: string
  page?: number
  pageSize?: number
  search?: string
  fileType?: "image" | "video" | "audio"
  collectionId?: CollectionFilter
  scope?: MediaScope
  database?: CustomShellDb
}): Promise<VideoMediaListResponse> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))

  // Collected rather than nested, the way the shell's own list query does it.
  const filters: SQL[] = [eq(customShellMedia.userId, userId)]
  if (scope) {
    const mediaIds = await mediaIdsForScope(userId, scope, database)
    if (!mediaIds.length) {
      return {
        media: [],
        total: 0,
        page: safePage,
        page_size: safePageSize,
        total_pages: 1,
      }
    }
    filters.push(inArray(customShellMedia.id, mediaIds))
  }
  if (fileType) {
    filters.push(eq(customShellMedia.fileType, fileType))
  }
  const cleanedSearch = search.trim()
  if (cleanedSearch) {
    const pattern = `%${cleanedSearch.replace(/([\\%_])/g, "\\$1")}%`
    const matches = or(
      ilike(customShellMedia.originalName, pattern),
      ilike(customShellMedia.filename, pattern),
      ilike(customShellMedia.altText, pattern)
    )
    if (matches) filters.push(matches)
  }
  if (collectionId !== undefined) {
    filters.push(
      collectionId === null
        ? sql`not exists (select 1 from video_media_collection_items i where i.media_id = ${customShellMedia.id})`
        : sql`exists (select 1 from video_media_collection_items i where i.media_id = ${customShellMedia.id} and i.collection_id = ${collectionId})`
    )
  }

  const where = and(...filters)
  const [rows, [totals]] = await Promise.all([
    database
      .select()
      .from(customShellMedia)
      .where(where)
      .orderBy(desc(customShellMedia.createdAt), desc(customShellMedia.id))
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    database.select({ total: count() }).from(customShellMedia).where(where),
  ])

  const mediaIds = rows.map((row) => row.id)
  const [collections, proxies, filmstrips] = await Promise.all([
    collectionIdsByMedia(mediaIds, database),
    videoStateByMedia(videoMediaProxies, mediaIds, database),
    videoStateByMedia(videoMediaFilmstrips, mediaIds, database),
  ])

  const media = rows.map((row) => {
    const base = serializeMedia(row)
    const proxy = proxies.get(row.id)
    return {
      ...base,
      playback_url: videoPlaybackUrl(base.url, proxy ?? null),
      proxy_status: proxy?.status ?? null,
      filmstrip_status: filmstrips.get(row.id)?.status ?? null,
      collection_ids: collections.get(row.id) ?? [],
    }
  })

  const total = totals?.total ?? 0
  return {
    media,
    total,
    page: safePage,
    page_size: safePageSize,
    total_pages: Math.max(1, Math.ceil(total / safePageSize)),
  }
}

/**
 * A document sees files uploaded on its own shelf plus files already present
 * in its saved timeline/slides. Reading the saved document keeps older work
 * visible without a one-off data backfill.
 */
async function mediaIdsForScope(
  userId: string,
  scope: MediaScope,
  database: CustomShellDb
) {
  if (scope.type === "project") {
    const [project] = await database
      .select({ timeline: videoProjects.timeline })
      .from(videoProjects)
      .where(and(eq(videoProjects.id, scope.id), eq(videoProjects.userId, userId)))
      .limit(1)
    if (!project) throw new Error(PROJECT_NOT_FOUND_MESSAGE)

    const attached = await database
      .select({ mediaId: videoProjectMedia.mediaId })
      .from(videoProjectMedia)
      .where(eq(videoProjectMedia.projectId, scope.id))
    const timeline = parseTimelineForReset(project.timeline).timeline
    return Array.from(
      new Set([
        ...attached.map((row) => row.mediaId),
        ...timeline.tracks.flatMap((track) =>
          track.clips.flatMap((clip) => (clip.mediaId ? [clip.mediaId] : []))
        ),
      ])
    )
  }

  const [carousel] = await database
    .select({ slides: videoCarousels.slides })
    .from(videoCarousels)
    .where(and(eq(videoCarousels.id, scope.id), eq(videoCarousels.userId, userId)))
    .limit(1)
  if (!carousel) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)

  const attached = await database
    .select({ mediaId: videoCarouselMedia.mediaId })
    .from(videoCarouselMedia)
    .where(eq(videoCarouselMedia.carouselId, scope.id))
  const slides = requireCanonicalCarouselSlides(carousel.slides)
  return Array.from(
    new Set([
      ...attached.map((row) => row.mediaId),
      ...slides.flatMap((slide) =>
        slide.items.flatMap((item) =>
          item.type === "image" || item.type === "video" ? [item.mediaId] : []
        )
      ),
    ])
  )
}

/** Attach a newly uploaded, owned media row to one owned editor document. */
export async function attachMediaToScope(
  userId: string,
  scope: MediaScope,
  mediaId: string,
  database: CustomShellDb = db
) {
  const [media] = await database
    .select({ id: customShellMedia.id })
    .from(customShellMedia)
    .where(and(eq(customShellMedia.id, mediaId), eq(customShellMedia.userId, userId)))
    .limit(1)
  if (!media) throw new Error("Media not found")

  if (scope.type === "project") {
    const [project] = await database
      .select({ id: videoProjects.id })
      .from(videoProjects)
      .where(and(eq(videoProjects.id, scope.id), eq(videoProjects.userId, userId)))
      .limit(1)
    if (!project) throw new Error(PROJECT_NOT_FOUND_MESSAGE)
    await database
      .insert(videoProjectMedia)
      .values({ projectId: scope.id, mediaId, createdAt: now() })
      .onConflictDoNothing()
    return
  }

  const [carousel] = await database
    .select({ id: videoCarousels.id })
    .from(videoCarousels)
    .where(and(eq(videoCarousels.id, scope.id), eq(videoCarousels.userId, userId)))
    .limit(1)
  if (!carousel) throw new Error(CAROUSEL_NOT_FOUND_MESSAGE)
  await database
    .insert(videoCarouselMedia)
    .values({ carouselId: scope.id, mediaId, createdAt: now() })
    .onConflictDoNothing()
}

/** Delete one owned file that is visible on the requested editor shelf. */
export async function deleteMediaFromScope(
  userId: string,
  scope: MediaScope,
  mediaId: string,
  database: CustomShellDb = db,
  deleteMedia: typeof deleteMediaAsAdmin = deleteMediaAsAdmin
) {
  const visibleMediaIds = await mediaIdsForScope(userId, scope, database)
  if (!visibleMediaIds.includes(mediaId)) throw new Error("Media not found")

  const [media] = await database
    .select({ id: customShellMedia.id })
    .from(customShellMedia)
    .where(and(eq(customShellMedia.id, mediaId), eq(customShellMedia.userId, userId)))
    .limit(1)
  if (!media) throw new Error("Media not found")

  const result = await deleteMedia([mediaId], database)
  if (result.deletedCount !== 1) throw new Error("Media not found")
}

async function videoStateByMedia(
  table: typeof videoMediaProxies | typeof videoMediaFilmstrips,
  mediaIds: string[],
  database: CustomShellDb
) {
  const byMedia = new Map<string, { status: string; storagePath: string | null }>()
  if (!mediaIds.length) return byMedia
  const rows = await database
    .select({
      mediaId: table.mediaId,
      status: table.status,
      storagePath: table.storagePath,
    })
    .from(table)
    .where(inArray(table.mediaId, mediaIds))
  for (const row of rows) {
    byMedia.set(row.mediaId, {
      status: row.status,
      storagePath: row.storagePath,
    })
  }
  return byMedia
}
