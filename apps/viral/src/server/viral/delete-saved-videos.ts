import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import { deleteFromR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { discardGeneratedAsset } from "@/server/viral/media-assets"
import { mediaStillInUse } from "@/server/viral/media-in-use"
import { viralVaultItems, viralVideos } from "@/server/viral/schema"

/**
 * Deleting saved Viral videos.
 *
 * A delete removes the row, which holds the breakdown and its analyses, then
 * the cover, then the downloaded file. The file stays when a vault item still
 * keeps it, so an idea saved to the vault plays on after its saved video goes.
 */

export type SavedVideoDeleteSummary = {
  /** How many of the asked-for videos are this person's and will go. */
  videos: number
  /** How many of them a vault item keeps a copy of. Those files stay. */
  inVault: number
}

export type SavedVideoDeleteResult = {
  deleted: string[]
  /** Downloaded files left in storage because a vault item keeps them. */
  filesKept: number
}

/** What the delete window says, counted from the database when it opens. */
export async function savedVideoDeleteSummary(ownerId: string, ids: string[]): Promise<SavedVideoDeleteSummary> {
  const rows = await ownedRows(ownerId, ids)
  if (!rows.length) return { videos: 0, inVault: 0 }
  const kept = await db
    .select({ id: viralVaultItems.savedVideoId })
    .from(viralVaultItems)
    .where(and(eq(viralVaultItems.ownerId, ownerId), inArray(viralVaultItems.savedVideoId, rows.map((row) => row.id))))
  return { videos: rows.length, inVault: new Set(kept.map((row) => row.id)).size }
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
    await tx.delete(viralVideos).where(
      and(
        eq(viralVideos.ownerId, ownerId),
        inArray(
          viralVideos.id,
          rows.map((row) => row.id)
        )
      )
    )
  })

  for (const row of rows) {
    if (!row.thumbnailStoragePath) continue
    // A vault item keeps showing this cover, so it stays.
    const [kept] = await db
      .select({ id: viralVaultItems.id })
      .from(viralVaultItems)
      .where(eq(viralVaultItems.thumbnailStoragePath, row.thumbnailStoragePath))
      .limit(1)
    if (kept) continue
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
      id: viralVideos.id,
      title: viralVideos.title,
      sourceUrl: viralVideos.sourceUrl,
      mediaId: viralVideos.mediaId,
      thumbnailStoragePath: viralVideos.thumbnailStoragePath,
    })
    .from(viralVideos)
    .where(
      and(
        eq(viralVideos.ownerId, ownerId),
        inArray(viralVideos.id, unique)
      )
    )
}

/**
 * Takes the downloaded file out of the media library and the bucket. A file
 * the library will not let go of (something outside Viral points at it) is
 * logged and kept, and answers false.
 */
export async function discardOwnedMedia(ownerId: string, mediaId: string) {
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
