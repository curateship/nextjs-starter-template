import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"

import { STORAGE_UNOPENED_DAYS, type StorageSummary } from "@/lib/viral/storage"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { discardOwnedMedia } from "@/server/viral/delete-saved-videos"
import { mediaStillInUse } from "@/server/viral/media-in-use"
import { viralVaultItems, viralVideos } from "@/server/viral/schema"

/**
 * Storage clean-up on Settings → Storage (`workspace/docs/storage.md`, task
 * part 19). Tyler, 4 Nov 2026: "Button only". Every Analyse and Save keeps a
 * full copy of the video; the button deletes the copies nobody has opened
 * for 30 days. A file any vault idea points at is never touched, checked
 * through `media-in-use.ts`, and the saved video itself stays with its
 * breakdown and analyses, so it plays from the platform afterwards.
 */

/** A saved video counts as opened when it was made, then each time its right panel reads it. */
function unopenedSince(cutoff: Date) {
  return sql`coalesce(${viralVideos.lastOpenedAt}, ${viralVideos.createdAt}) < ${cutoff.toISOString()}::timestamptz`
}

function cutoffFrom(at: Date) {
  return new Date(at.getTime() - STORAGE_UNOPENED_DAYS * 24 * 60 * 60 * 1000)
}

async function downloadedCopies(ownerId: string) {
  return db
    .select({
      id: viralVideos.id,
      mediaId: viralVideos.mediaId,
      fileSize: customShellMedia.fileSize,
      stale: sql<boolean>`${unopenedSince(cutoffFrom(now()))}`,
    })
    .from(viralVideos)
    .innerJoin(customShellMedia, eq(customShellMedia.id, viralVideos.mediaId))
    .where(and(eq(viralVideos.ownerId, ownerId), isNotNull(viralVideos.mediaId)))
}

async function vaultMediaIds(ownerId: string, mediaIds: string[]): Promise<Set<string>> {
  if (!mediaIds.length) return new Set()
  const rows = await db
    .select({ mediaId: viralVaultItems.mediaId })
    .from(viralVaultItems)
    .where(and(eq(viralVaultItems.ownerId, ownerId), inArray(viralVaultItems.mediaId, mediaIds)))
  return new Set(rows.flatMap((row) => (row.mediaId ? [row.mediaId] : [])))
}

/** What the Storage page shows: the space the copies use, and what the button would free. */
export async function storageSummary(ownerId: string): Promise<StorageSummary> {
  const copies = await downloadedCopies(ownerId)
  const kept = await vaultMediaIds(
    ownerId,
    copies.flatMap((copy) => (copy.mediaId ? [copy.mediaId] : []))
  )
  const sum = (list: typeof copies) => list.reduce((total, copy) => total + copy.fileSize, 0)
  const inVault = copies.filter((copy) => copy.mediaId && kept.has(copy.mediaId))
  const freeable = copies.filter((copy) => copy.stale && copy.mediaId && !kept.has(copy.mediaId))
  return {
    copies: copies.length,
    bytes: sum(copies),
    vaultCopies: inVault.length,
    vaultBytes: sum(inVault),
    freeableCopies: freeable.length,
    freeableBytes: sum(freeable),
  }
}

/**
 * The button: takes the file off each saved video nobody has opened for 30
 * days, then deletes each file once nothing in Viral uses it. Answers what
 * went, counted from what was really deleted.
 */
export async function cleanUpStorage(ownerId: string): Promise<{ copies: number; bytes: number }> {
  const at = now()
  const copies = (await downloadedCopies(ownerId)).filter((copy) => copy.stale && copy.mediaId)
  const kept = await vaultMediaIds(
    ownerId,
    copies.flatMap((copy) => (copy.mediaId ? [copy.mediaId] : []))
  )
  const going = copies.filter((copy) => copy.mediaId && !kept.has(copy.mediaId))
  if (!going.length) return { copies: 0, bytes: 0 }

  // The file comes off only where it is still the same file and still
  // unopened, so a video opened a moment ago keeps its copy.
  const released = await db
    .update(viralVideos)
    .set({ mediaId: null, updatedAt: at })
    .where(
      and(
        eq(viralVideos.ownerId, ownerId),
        inArray(
          viralVideos.id,
          going.map((copy) => copy.id)
        ),
        unopenedSince(cutoffFrom(at))
      )
    )
    .returning({ id: viralVideos.id })
  const releasedIds = new Set(released.map((row) => row.id))
  const done = going.filter((copy) => releasedIds.has(copy.id))
  const mediaIds = [...new Set(done.flatMap((copy) => (copy.mediaId ? [copy.mediaId] : [])))]
  // Asked after the files came off, so these saved videos no longer count as uses.
  const inUse = await mediaStillInUse(ownerId, mediaIds)
  let bytes = 0
  let count = 0
  for (const copy of done) {
    if (!copy.mediaId || inUse.has(copy.mediaId)) continue
    if (await discardOwnedMedia(ownerId, copy.mediaId)) {
      bytes += copy.fileSize
      count += 1
    }
  }
  return { copies: count, bytes }
}

/** The right panel opened a saved video: Storage clean-up leaves its copy for another 30 days. */
export async function markSavedVideoOpened(ownerId: string, savedVideoId: string): Promise<void> {
  await db
    .update(viralVideos)
    .set({ lastOpenedAt: now() })
    .where(and(eq(viralVideos.id, savedVideoId), eq(viralVideos.ownerId, ownerId)))
}
