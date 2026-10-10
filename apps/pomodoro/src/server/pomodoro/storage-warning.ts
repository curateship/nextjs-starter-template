import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { loadAccountStorage } from "@/server/media/library"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import { writeNotices } from "@/server/pomodoro/notices"
import { pomodoroStorageWarnings } from "@/server/pomodoro/schema"
import { formatBytes } from "@/lib/pomodoro/media-limits"
import {
  MY_UPLOADS_PAGE,
  STORAGE_LOW_MESSAGE,
  storageLowDetail,
} from "@/lib/pomodoro/notices"
import { STORAGE_WARNING_SHARE } from "@/lib/pomodoro/upload-labels"

/**
 * The bell's warning that a member's space is nearly full (uploads-and-sharing
 * task 02, part 3). See "Space nearly full" in `workspace/docs/my-uploads.md`.
 *
 * Checked after every upload and every AI file lands, and after files go for
 * good. At 90% of the plan's limit (1.8 GB of 2 GB) the bell says so once; a
 * row in `pomodoro_storage_warnings` remembers that it did. Dropping back
 * under 90% removes the row, so the next climb warns again.
 *
 * Never throws: a warning that cannot be worked out must not undo the upload
 * that prompted it.
 */
export async function checkStorageWarning(userId: string) {
  try {
    const [storage, entitlements] = await Promise.all([
      loadAccountStorage(userId),
      loadPomodoroEntitlements(userId),
    ])
    const limit = entitlements.storageLimitBytes
    if (limit <= 0) return
    if (storage.bytes < limit * STORAGE_WARNING_SHARE) {
      await db
        .delete(pomodoroStorageWarnings)
        .where(eq(pomodoroStorageWarnings.userId, userId))
      return
    }
    await db.transaction(async (tx) => {
      // The insert is the "only once": a second climb past 90% before
      // dropping back finds the row already there and adds nothing.
      const [fresh] = await tx
        .insert(pomodoroStorageWarnings)
        .values({ userId })
        .onConflictDoNothing()
        .returning({ userId: pomodoroStorageWarnings.userId })
      if (!fresh) return
      await writeNotices(tx, [
        {
          recipientUserId: userId,
          kind: "storage_low",
          message: STORAGE_LOW_MESSAGE,
          detail: storageLowDetail(formatBytes(storage.bytes), formatBytes(limit)),
          href: MY_UPLOADS_PAGE,
        },
      ])
    })
  } catch (error) {
    console.error("the space warning could not be checked", error)
  }
}
