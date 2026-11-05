import { and, eq, inArray, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { videoMediaSteadyCopies } from "@/server/video/schema"

/**
 * The steadied copy of a video (`workspace/docs/steady-shaky-footage.md`),
 * asked for when a clip's Steady switch is turned on and made by the media
 * worker. It answers for a person's own videos only; the caller works out
 * whose file it is.
 */

export type SteadyCopyState =
  | { status: "preparing" }
  | { status: "ready"; url: string }
  | { status: "failed"; error: string }

export const STEADY_NOT_VIDEO_MESSAGE = "Only a video can be steadied"
export const STEADY_NOT_READY_MESSAGE =
  "A steadied copy is still being made for a clip with Steady on. Export again once it is ready, or turn Steady off on that clip."
export const STEADY_FAILED_MESSAGE =
  "A clip with Steady on has no steadied copy, because making it failed. Press Try again on that clip, or turn Steady off."

/**
 * Where one video's steadied copy stands, asking for it to be made if it
 * never was. `retry` puts a copy that failed back in the queue with a fresh
 * three tries; it never restarts one still being made.
 */
export async function requestOwnedSteadyCopy(
  userId: string,
  mediaId: string,
  { retry = false }: { retry?: boolean } = {},
  database: CustomShellDb = db
): Promise<SteadyCopyState> {
  const [media] = await database
    .select({ fileType: customShellMedia.fileType })
    .from(customShellMedia)
    .where(and(eq(customShellMedia.id, mediaId), eq(customShellMedia.userId, userId)))
    .limit(1)
  if (!media) throw new Error("Media not found")
  if (media.fileType !== "video") throw new Error(STEADY_NOT_VIDEO_MESSAGE)
  await database
    .insert(videoMediaSteadyCopies)
    .values({ mediaId, status: "queued", createdAt: sql`now()`, updatedAt: sql`now()` })
    .onConflictDoNothing()
  if (retry) {
    await database
      .update(videoMediaSteadyCopies)
      .set({
        status: "queued",
        attempts: 0,
        error: null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: sql`now()`,
      })
      .where(and(eq(videoMediaSteadyCopies.mediaId, mediaId), eq(videoMediaSteadyCopies.status, "error")))
  }
  const [row] = await database
    .select()
    .from(videoMediaSteadyCopies)
    .where(eq(videoMediaSteadyCopies.mediaId, mediaId))
    .limit(1)
  if (row?.status === "ready" && row.storagePath) {
    return { status: "ready", url: await getPublicMediaUrl(row.storagePath) }
  }
  if (row?.status === "error") {
    return { status: "failed", error: row.error ?? "Steadying the video failed" }
  }
  return { status: "preparing" }
}

/**
 * The finished steadied copies of these videos, for an export. A video
 * without one stops the export with a sentence saying why, rather than
 * quietly drawing the shaky original.
 */
export async function steadyCopiesForRender(
  mediaIds: string[],
  database: CustomShellDb = db
): Promise<Map<string, { storagePath: string; fileSize: number }>> {
  const copies = new Map<string, { storagePath: string; fileSize: number }>()
  if (!mediaIds.length) return copies
  const rows = await database
    .select()
    .from(videoMediaSteadyCopies)
    .where(inArray(videoMediaSteadyCopies.mediaId, mediaIds))
  for (const mediaId of mediaIds) {
    const row = rows.find((candidate) => candidate.mediaId === mediaId)
    if (row?.status === "error") throw new Error(STEADY_FAILED_MESSAGE)
    if (row?.status !== "ready" || !row.storagePath) throw new Error(STEADY_NOT_READY_MESSAGE)
    copies.set(mediaId, { storagePath: row.storagePath, fileSize: row.fileSize ?? 0 })
  }
  return copies
}
