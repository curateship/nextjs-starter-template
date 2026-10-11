import { and, asc, eq, isNull } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { pomodoroMediaUploads } from "@/server/pomodoro/schema"
import { customShellMedia } from "@/server/schema"

/**
 * The member's own pictures an AI background can start from (task 06, part
 * 3): theirs, a picture rather than a clip, finished, and not in the bin. The
 * same rule is read when the list is drawn, when the request is accepted and
 * again by the worker, because a picture can be deleted while the request
 * waits.
 */
const ownReadyPicture = (userId: string) =>
  and(
    eq(pomodoroMediaUploads.userId, userId),
    eq(pomodoroMediaUploads.kind, "image"),
    eq(pomodoroMediaUploads.status, "ready"),
    isNull(pomodoroMediaUploads.deletedAt)
  )

export type StartingPictureOption = { mediaId: string; name: string; url: string }

/** Every picture the member could start from, oldest first like My uploads. */
export async function listStartingPictures(
  userId: string
): Promise<StartingPictureOption[]> {
  const rows = await db
    .select({
      mediaId: pomodoroMediaUploads.mediaId,
      name: pomodoroMediaUploads.name,
      originalName: customShellMedia.originalName,
      storagePath: customShellMedia.storagePath,
    })
    .from(pomodoroMediaUploads)
    .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
    .where(ownReadyPicture(userId))
    .orderBy(asc(pomodoroMediaUploads.createdAt))
  return Promise.all(
    rows.map(async (row) => ({
      mediaId: row.mediaId,
      name: row.name ?? row.originalName,
      url: await getPublicMediaUrl(row.storagePath),
    }))
  )
}

/** One of the member's pictures, or null when it is not theirs to use. */
export async function loadOwnPicture(userId: string, mediaId: string) {
  const [row] = await db
    .select({ storagePath: customShellMedia.storagePath })
    .from(pomodoroMediaUploads)
    .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
    .where(and(ownReadyPicture(userId), eq(pomodoroMediaUploads.mediaId, mediaId)))
    .limit(1)
  return row ?? null
}
