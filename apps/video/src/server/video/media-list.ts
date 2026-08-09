import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia, type MediaItem } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { collectionIdsByMedia } from "@/server/video/media-collections"
import { videoPlaybackUrl } from "@/server/video/media-urls"
import {
  videoMediaFilmstrips,
  videoMediaProxies,
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

export async function listVideoMedia({
  userId,
  page = 1,
  pageSize = 24,
  search = "",
  fileType,
  collectionId,
  database = db,
}: {
  userId: string
  page?: number
  pageSize?: number
  search?: string
  fileType?: "image" | "video" | "audio"
  collectionId?: CollectionFilter
  database?: CustomShellDb
}): Promise<VideoMediaListResponse> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))

  // Collected rather than nested, the way the shell's own list query does it.
  const filters: SQL[] = [eq(customShellMedia.userId, userId)]
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
