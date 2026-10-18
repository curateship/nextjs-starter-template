import { and, count, desc, eq, sql } from "drizzle-orm"

import {
  cleanFolderName,
  FOLDER_NAME_REQUIRED_MESSAGE,
} from "@/lib/video/project-folders"
import { isCreatorPlatform, type CreatorPlatform } from "@/lib/video/creators"
import { viralSays, type ViralVideo } from "@/lib/video/viral"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  videoCreatorPosts,
  videoViralCollectionItems,
  videoViralCollections,
  videoViralProjects,
} from "@/server/video/schema"
import { isUniqueViolation } from "@/server/video/unique-violation"
import { parseVideoLink } from "@/server/video/viral/download"
import { coverUrl } from "@/server/video/creators/covers"
import { scoreVideos } from "@/server/video/viral/project-view"

/**
 * Favourites: named collections of starred videos, one person's own and
 * shared across every project. Starring only bookmarks. It is free, downloads
 * nothing and runs no breakdown.
 *
 * Each item keeps its own copy of the video's details, so deleting a
 * collection never deletes a video or a result, and a re-run that replaces a
 * keyword's results, or deleting the project, never empties a collection.
 * The same rules as media collections (`media-collections.ts`).
 */

export type ViralCollectionSummary = {
  id: string
  name: string
  item_count: number
}

/** The details a star copies. Checked here, because the browser sent them. */
export type StarredVideo = {
  platform: CreatorPlatform
  platformVideoId: string
  url: string
  title: string
  channelId: string
  channelName: string
  subscribers: number | null
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: string | null
  durationSeconds: number | null
  thumbnailUrl: string | null
}

export async function listCollections(
  ownerId: string
): Promise<ViralCollectionSummary[]> {
  const rows = await db
    .select({
      id: videoViralCollections.id,
      name: videoViralCollections.name,
      items: count(videoViralCollectionItems.platformVideoId),
    })
    .from(videoViralCollections)
    .leftJoin(
      videoViralCollectionItems,
      eq(videoViralCollectionItems.collectionId, videoViralCollections.id)
    )
    .where(eq(videoViralCollections.ownerId, ownerId))
    .groupBy(videoViralCollections.id)
    .orderBy(sql`lower(${videoViralCollections.name})`)
  return rows.map((row) => ({ id: row.id, name: row.name, item_count: row.items }))
}

/** Which collections each video is in, keyed `platform:platformVideoId`. */
export async function starredIn(ownerId: string): Promise<Record<string, string[]>> {
  const rows = await db
    .select({
      collectionId: videoViralCollectionItems.collectionId,
      platform: videoViralCollectionItems.platform,
      platformVideoId: videoViralCollectionItems.platformVideoId,
    })
    .from(videoViralCollectionItems)
    .innerJoin(
      videoViralCollections,
      eq(videoViralCollections.id, videoViralCollectionItems.collectionId)
    )
    .where(eq(videoViralCollections.ownerId, ownerId))
  const map: Record<string, string[]> = {}
  for (const row of rows) {
    const key = `${row.platform}:${row.platformVideoId}`
    map[key] = [...(map[key] ?? []), row.collectionId]
  }
  return map
}

async function named<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw viralSays("A collection with that name already exists.")
    }
    throw error
  }
}

function cleanName(value: string) {
  try {
    return cleanFolderName(value)
  } catch (error) {
    if (error instanceof Error && error.message === FOLDER_NAME_REQUIRED_MESSAGE) {
      throw viralSays("A collection needs a name.")
    }
    throw error
  }
}

export async function createCollection(
  ownerId: string,
  value: string
): Promise<ViralCollectionSummary> {
  const name = cleanName(value)
  const at = now()
  const id = uuid()
  await named(() =>
    db
      .insert(videoViralCollections)
      .values({ id, ownerId, name, createdAt: at, updatedAt: at })
  )
  return { id, name, item_count: 0 }
}

export async function renameCollection(
  ownerId: string,
  collectionId: string,
  value: string
) {
  const name = cleanName(value)
  const renamed = await named(() =>
    db
      .update(videoViralCollections)
      .set({ name, updatedAt: now() })
      .where(
        and(
          eq(videoViralCollections.id, collectionId),
          eq(videoViralCollections.ownerId, ownerId)
        )
      )
      .returning({ id: videoViralCollections.id })
  )
  if (!renamed.length) throw viralSays("That collection is gone.")
}

/** Deletes the collection and its stars. No video and no result goes. */
export async function deleteCollection(ownerId: string, collectionId: string) {
  const deleted = await db
    .delete(videoViralCollections)
    .where(
      and(
        eq(videoViralCollections.id, collectionId),
        eq(videoViralCollections.ownerId, ownerId)
      )
    )
    .returning({ id: videoViralCollections.id })
  if (!deleted.length) throw viralSays("That collection is gone.")
}

export async function requireOwnedCollection(ownerId: string, collectionId: string) {
  const [row] = await db
    .select()
    .from(videoViralCollections)
    .where(
      and(
        eq(videoViralCollections.id, collectionId),
        eq(videoViralCollections.ownerId, ownerId)
      )
    )
  if (!row) throw viralSays("That collection is gone.")
  return row
}

/**
 * Stars videos into a collection, or takes them out. One request for any
 * number of videos. A starred video is starred again without a second row.
 */
export async function setStarred(
  ownerId: string,
  collectionId: string,
  videos: StarredVideo[],
  starred: boolean,
  sourceProjectId: string | null
): Promise<number> {
  await requireOwnedCollection(ownerId, collectionId)
  if (!videos.length) return 0
  if (!starred) {
    let removed = 0
    for (const video of videos) {
      const gone = await db
        .delete(videoViralCollectionItems)
        .where(
          and(
            eq(videoViralCollectionItems.collectionId, collectionId),
            eq(videoViralCollectionItems.platform, video.platform),
            eq(videoViralCollectionItems.platformVideoId, video.platformVideoId)
          )
        )
        .returning({ id: videoViralCollectionItems.platformVideoId })
      removed += gone.length
    }
    return removed
  }

  let source: string | null = null
  if (sourceProjectId) {
    const [project] = await db
      .select({ id: videoViralProjects.id })
      .from(videoViralProjects)
      .where(
        and(
          eq(videoViralProjects.id, sourceProjectId),
          eq(videoViralProjects.ownerId, ownerId)
        )
      )
    source = project?.id ?? null
  }
  const at = now()
  const rows = videos.map((video) => checkedVideo(video))
  await db
    .insert(videoViralCollectionItems)
    .values(rows.map((row) => ({ ...row, collectionId, sourceProjectId: source, createdAt: at })))
    .onConflictDoNothing()
  await db
    .update(videoViralCollections)
    .set({ updatedAt: at })
    .where(eq(videoViralCollections.id, collectionId))
  return rows.length
}

/**
 * The browser sends the details it shows, so the address must really be the
 * video it names, on a platform the app knows, and the picture must be https.
 */
function checkedVideo(video: StarredVideo) {
  if (!isCreatorPlatform(video.platform)) throw viralSays("That video cannot be starred.")
  let link: ReturnType<typeof parseVideoLink>
  try {
    link = parseVideoLink(video.url)
  } catch {
    throw viralSays("That video cannot be starred.")
  }
  if (link.platform !== video.platform || link.platformVideoId !== video.platformVideoId) {
    throw viralSays("That video cannot be starred.")
  }
  return {
    platform: video.platform,
    platformVideoId: video.platformVideoId,
    url: video.url,
    title: video.title.slice(0, 500),
    channelId: video.channelId.slice(0, 100),
    channelName: video.channelName.slice(0, 200),
    subscribers: video.subscribers,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    postedAt: readDate(video.postedAt),
    durationSeconds: video.durationSeconds,
    thumbnailUrl: video.thumbnailUrl?.startsWith("https://") ? video.thumbnailUrl : null,
  }
}

/** One collection's videos, newest star first, scored on this read. */
export async function loadCollection(
  ownerId: string,
  collectionId: string
): Promise<{ collection: ViralCollectionSummary; videos: ViralVideo[] }> {
  const collection = await requireOwnedCollection(ownerId, collectionId)
  const rows = await db
    .select({
      item: videoViralCollectionItems,
      coverPath: videoCreatorPosts.thumbnailStoragePath,
    })
    .from(videoViralCollectionItems)
    // A starred TikTok or Instagram video copied a cover address that
    // expires; the followed creator's saved copy of the cover stands in.
    .leftJoin(
      videoCreatorPosts,
      and(
        eq(videoCreatorPosts.ownerId, ownerId),
        eq(videoCreatorPosts.platform, videoViralCollectionItems.platform),
        eq(videoCreatorPosts.platformVideoId, videoViralCollectionItems.platformVideoId)
      )
    )
    .where(eq(videoViralCollectionItems.collectionId, collectionId))
    .orderBy(desc(videoViralCollectionItems.createdAt))
  const covers = await Promise.all(
    rows.map((row) =>
      coverUrl({ thumbnailStoragePath: row.coverPath, thumbnailUrl: row.item.thumbnailUrl })
    )
  )
  const items = rows.map((row, index) => ({ ...row.item, thumbnailUrl: covers[index] }))
  const videos = await scoreVideos(
    ownerId,
    items.flatMap((item) =>
      isCreatorPlatform(item.platform)
        ? [
            {
              platform: item.platform,
              platformVideoId: item.platformVideoId,
              url: item.url,
              title: item.title,
              channelId: item.channelId,
              channelName: item.channelName,
              subscribers: item.subscribers,
              views: item.views,
              likes: item.likes,
              comments: item.comments,
              postedAt: item.postedAt?.toISOString() ?? null,
              durationSeconds: item.durationSeconds,
              thumbnailUrl: item.thumbnailUrl,
              keywords: [],
              isNew: false,
              topicMatch: null,
              source: "search" as const,
              sample: false,
            },
          ]
        : []
    )
  )
  return {
    collection: { id: collection.id, name: collection.name, item_count: items.length },
    videos,
  }
}

/** A date the browser sent, or null when it is not one. */
function readDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
