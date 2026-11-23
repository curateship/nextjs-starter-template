import { asc, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { deleteFromR2 } from "@/server/media/storage"
import { pomodoroBucketDeletions } from "@/server/pomodoro/schema"

/**
 * Removes the bucket files the database has noted for removal: a clip's
 * still, once its upload is gone or its still replaced (migration 0137). See
 * "A clip shows a picture" in `workspace/docs/my-uploads.md`.
 *
 * A trigger does the noting, so every way an upload goes is covered, including
 * the shell's account purge and Media page, which know nothing about stills.
 * This runs on the media worker's pass, a few at a time. A file the bucket
 * will not remove stays noted and is tried again on the next pass.
 */
export async function drainBucketDeletions(limit = 20) {
  const rows = await db
    .select({ path: pomodoroBucketDeletions.path })
    .from(pomodoroBucketDeletions)
    .orderBy(asc(pomodoroBucketDeletions.queuedAt))
    .limit(limit)
  let removed = 0
  for (const row of rows) {
    try {
      await deleteFromR2(row.path)
      await db
        .delete(pomodoroBucketDeletions)
        .where(eq(pomodoroBucketDeletions.path, row.path))
      removed += 1
    } catch (error) {
      console.error("a noted bucket file could not be removed", error)
    }
  }
  return removed
}
