import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm"

import { db } from "@/server/db"
import {
  clearUploadChoices,
  deletePomodoroUpload,
} from "@/server/pomodoro/media-uploads"
import { checkStorageWarning } from "@/server/pomodoro/storage-warning"
import { pomodoroMediaUploads } from "@/server/pomodoro/schema"
import { BIN_DAYS } from "@/lib/pomodoro/upload-labels"

/**
 * The 30-day bin on My uploads (uploads-and-sharing task 02, part 5). See
 * "The bin" in `workspace/docs/my-uploads.md`.
 *
 * Deleting a file moves it here: `deleted_at` is set, and every place that
 * picks, plays or edits a file stops seeing it, so a room using it falls back
 * the way it always did. The files and rows stay, and still count toward the
 * member's space (Tyler, 10 Oct 2026). Bring back clears `deleted_at`. Empty
 * the bin, and the worker after 30 days, remove them for good through the
 * same final delete as always. An admin's delete never comes here.
 */

export type BinResult = { done: string[]; skipped: string[] }

/** Moves these files to the bin, in one request. Another member's id is skipped. */
export async function moveUploadsToBin(
  userId: string,
  mediaIds: string[]
): Promise<BinResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ mediaId: pomodoroMediaUploads.mediaId })
      .from(pomodoroMediaUploads)
      .where(
        and(
          eq(pomodoroMediaUploads.userId, userId),
          inArray(pomodoroMediaUploads.mediaId, mediaIds),
          isNull(pomodoroMediaUploads.deletedAt)
        )
      )
      .for("update")
    const done = rows.map((row) => row.mediaId)
    if (done.length) {
      // A room, a sound or a banner using it falls back now, not in 30 days.
      await clearUploadChoices(tx, done)
      await tx
        .update(pomodoroMediaUploads)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(inArray(pomodoroMediaUploads.mediaId, done))
    }
    return { done, skipped: mediaIds.filter((id) => !done.includes(id)) }
  })
}

/** Brings these files back from the bin. Nothing they were used for comes back with them. */
export async function restoreUploads(
  userId: string,
  mediaIds: string[]
): Promise<BinResult> {
  const rows = await db
    .update(pomodoroMediaUploads)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(pomodoroMediaUploads.userId, userId),
        inArray(pomodoroMediaUploads.mediaId, mediaIds),
        isNotNull(pomodoroMediaUploads.deletedAt)
      )
    )
    .returning({ mediaId: pomodoroMediaUploads.mediaId })
  const done = rows.map((row) => row.mediaId)
  return { done, skipped: mediaIds.filter((id) => !done.includes(id)) }
}

/** Not found: brought back, or already removed, since the list was read. */
function isGone(error: unknown) {
  return error instanceof Error && error.message === "UPLOAD_NOT_FOUND"
}

/**
 * Empty the bin: every file in it goes for good now. Returns how many went.
 * A file brought back meanwhile is left alone and not counted; one that
 * cannot be removed stays in the bin and is counted as kept.
 */
export async function emptyBin(userId: string) {
  const rows = await db
    .select({ mediaId: pomodoroMediaUploads.mediaId })
    .from(pomodoroMediaUploads)
    .where(
      and(
        eq(pomodoroMediaUploads.userId, userId),
        isNotNull(pomodoroMediaUploads.deletedAt)
      )
    )
  let deleted = 0
  let kept = 0
  for (const row of rows) {
    try {
      await deletePomodoroUpload(userId, row.mediaId, { fromBin: true })
      deleted += 1
    } catch (error) {
      if (isGone(error)) continue
      kept += 1
      console.error("a file in the bin could not be removed", error)
    }
  }
  if (deleted) await checkStorageWarning(userId)
  return { deleted, kept }
}

/**
 * The worker's pass: files that have sat in the bin for 30 days go for good,
 * a few at a time so one pass never holds the loop for long.
 */
export async function purgeExpiredBin(now = new Date(), limit = 10) {
  const before = new Date(now.getTime() - BIN_DAYS * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      mediaId: pomodoroMediaUploads.mediaId,
      userId: pomodoroMediaUploads.userId,
    })
    .from(pomodoroMediaUploads)
    .where(lt(pomodoroMediaUploads.deletedAt, before))
    .limit(limit)
  const owners = new Set<string>()
  for (const row of rows) {
    try {
      await deletePomodoroUpload(row.userId, row.mediaId, { fromBin: true })
      owners.add(row.userId)
    } catch (error) {
      if (isGone(error)) continue
      console.error("an expired file in the bin could not be removed", error)
    }
  }
  for (const userId of owners) await checkStorageWarning(userId)
  return rows.length
}
