import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { deleteFromR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { discardGeneratedAsset } from "@/server/video/asset-factories/media"
import { mediaStillInUse } from "@/server/video/media-in-use"
import { videoProjectVideos, videoViralVideos } from "@/server/video/schema"

/**
 * Deleting saved Viral videos.
 *
 * A delete removes the row, which holds the breakdown, then the cover, then
 * the downloaded file. The file stays when something else in Video still uses
 * it, most often an editor project that dragged it onto its timeline, and the
 * delete window says which projects those are before anything goes.
 *
 * Editor projects made from the video with Copy this stay. Their key to the
 * video blanks itself (`on delete set null`), so the video's title is written
 * onto each of them first, and their Copy panel names what was deleted.
 *
 * Favourites are untouched: a starred video keeps its own copy of its
 * details, so it keeps showing in every collection.
 */

/** A video in a project, as the delete window lists it and links to it. */
export type SavedVideoProjectLink = { project_id: string; video_id: string; name: string }

export type SavedVideoDeleteSummary = {
  /** How many of the asked-for videos are this person's and will go. */
  videos: number
  /** Videos Make this a template made from them. They stay. */
  copiedBy: SavedVideoProjectLink[]
  /** Videos whose timeline uses a downloaded file, which therefore stays. */
  timelinesUsingFile: SavedVideoProjectLink[]
}

export type SavedVideoDeleteResult = {
  deleted: string[]
  /** Downloaded files left in the media library because something uses them. */
  filesKept: number
}

/** What the delete window says, counted from the database when it opens. */
export async function savedVideoDeleteSummary(
  ownerId: string,
  ids: string[]
): Promise<SavedVideoDeleteSummary> {
  const rows = await ownedRows(ownerId, ids)
  if (!rows.length) return { videos: 0, copiedBy: [], timelinesUsingFile: [] }
  const [copiedBy, timelinesUsingFile] = await Promise.all([
    db
      .select({
        project_id: videoProjectVideos.projectId,
        video_id: videoProjectVideos.id,
        name: videoProjectVideos.name,
      })
      .from(videoProjectVideos)
      .where(
        and(
          eq(videoProjectVideos.userId, ownerId),
          inArray(
            videoProjectVideos.sourceViralVideoId,
            rows.map((row) => row.id)
          )
        )
      )
      .orderBy(videoProjectVideos.name),
    videosWhoseTimelineUses(
      ownerId,
      rows.flatMap((row) => row.mediaId ?? [])
    ),
  ])
  return { videos: rows.length, copiedBy, timelinesUsingFile }
}

/**
 * Deletes this person's saved videos among `ids`. Anybody else's ids find
 * nothing and are left out of `deleted`, which tells the asker less than a
 * refusal would.
 */
export async function deleteSavedVideos(
  ownerId: string,
  ids: string[]
): Promise<SavedVideoDeleteResult> {
  const rows = await ownedRows(ownerId, ids)
  if (!rows.length) return { deleted: [], filesKept: 0 }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      // Written before the delete, because the delete blanks the key these
      // videos are found by.
      await tx
        .update(videoProjectVideos)
        .set({ sourceViralVideoTitle: row.title?.trim() || row.sourceUrl })
        .where(
          and(
            eq(videoProjectVideos.userId, ownerId),
            eq(videoProjectVideos.sourceViralVideoId, row.id)
          )
        )
    }
    await tx.delete(videoViralVideos).where(
      and(
        eq(videoViralVideos.ownerId, ownerId),
        inArray(
          videoViralVideos.id,
          rows.map((row) => row.id)
        )
      )
    )
  })

  for (const row of rows) {
    if (!row.thumbnailStoragePath) continue
    await deleteFromR2(row.thumbnailStoragePath).catch((error) =>
      console.error("A deleted saved video's cover stayed in storage", row.id, error)
    )
  }

  // Asked after the rows are gone, so a saved video no longer counts as a use
  // of its own file.
  const mediaIds = [...new Set(rows.flatMap((row) => row.mediaId ?? []))]
  const inUse = await mediaStillInUse(ownerId, mediaIds)
  let filesKept = inUse.size
  for (const mediaId of mediaIds) {
    if (inUse.has(mediaId)) continue
    if (!(await discardOwnedMedia(ownerId, mediaId))) filesKept += 1
  }

  return { deleted: rows.map((row) => row.id), filesKept }
}

async function ownedRows(ownerId: string, ids: string[]) {
  const unique = [...new Set(ids)]
  if (!unique.length) return []
  return db
    .select({
      id: videoViralVideos.id,
      title: videoViralVideos.title,
      sourceUrl: videoViralVideos.sourceUrl,
      mediaId: videoViralVideos.mediaId,
      thumbnailStoragePath: videoViralVideos.thumbnailStoragePath,
    })
    .from(videoViralVideos)
    .where(
      and(
        eq(videoViralVideos.ownerId, ownerId),
        inArray(videoViralVideos.id, unique)
      )
    )
}

/**
 * The person's videos whose timeline holds one of these files. Read where
 * the clips sit, the same way `mediaStillInUse` reads them.
 */
async function videosWhoseTimelineUses(
  ownerId: string,
  mediaIds: string[]
): Promise<SavedVideoProjectLink[]> {
  if (!mediaIds.length) return []
  const listed = sql.join(
    mediaIds.map((id) => sql`${id}`),
    sql`, `
  )
  const found = await db.execute<SavedVideoProjectLink>(sql`
    select distinct video.project_id, video.id as video_id, video.name
    from ${videoProjectVideos} video
    cross join jsonb_array_elements(coalesce(video.timeline -> 'tracks', '[]'::jsonb)) track
    cross join jsonb_array_elements(coalesce(track -> 'clips', '[]'::jsonb)) clip
    where video.user_id = ${ownerId}
      and clip ->> 'mediaId' in (${listed})
    order by video.name
  `)
  return found.rows.map((row) => ({
    project_id: row.project_id,
    video_id: row.video_id,
    name: row.name,
  }))
}

/**
 * Takes the downloaded file out of the media library and the bucket. A file
 * the library will not let go of (something outside Video points at it) is
 * logged and kept, and answers false.
 */
async function discardOwnedMedia(ownerId: string, mediaId: string) {
  const [media] = await db
    .select({ id: customShellMedia.id, storagePath: customShellMedia.storagePath })
    .from(customShellMedia)
    .where(
      and(eq(customShellMedia.id, mediaId), eq(customShellMedia.userId, ownerId))
    )
  if (!media) return true
  try {
    await discardGeneratedAsset(media)
    return true
  } catch (error) {
    console.error("A deleted saved video's file stayed in the media library", mediaId, error)
    return false
  }
}
