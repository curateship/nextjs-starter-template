import { and, asc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { blockedUserIdsFor } from "@/server/pomodoro/blocks"
import {
  pomodoroMediaUploads,
  pomodoroProfiles,
  pomodoroSavedMedia,
} from "@/server/pomodoro/schema"
import { creditHandle, sharedWithOthers } from "@/server/pomodoro/shared-media"
import { customShellMedia } from "@/server/schema"
import type { OwnPoolFile, OwnPoolMedia } from "@/lib/pomodoro/media-pool"

/**
 * The member's own files that a tags group in their personal room may play
 * (uploads-and-sharing task 08, Part 1; `workspace/docs/shuffle-and-tags.md`):
 * their uploads and AI files, and shared files they saved with the heart.
 *
 * Only files with a finished file to play, out of the bin, and carrying at
 * least one tag, because a file joins a group through its tags alone. A saved
 * file must still pass the one sharing rule (`sharedWithOthers`), and its
 * owner must not be on either side of a block with the member, so one that
 * stops being shared drops out on the next load. The address is resolved
 * here, the same way the personal room's own pick is, so the browser never
 * builds one.
 */
export async function loadOwnPoolMedia(userId: string): Promise<OwnPoolMedia> {
  const [uploaded, saved, blocked] = await Promise.all([
    loadUploaded(userId),
    loadSaved(userId),
    blockedUserIdsFor(userId),
  ])
  const seen = new Set<string>()
  const rows = [...uploaded, ...saved.filter((row) => !blocked.has(row.ownerId))].filter(
    (row) => !seen.has(row.mediaId) && Boolean(seen.add(row.mediaId))
  )
  const files = await Promise.all(
    rows.map(async (row) => ({
      purpose: row.purpose,
      file: {
        mediaId: row.mediaId,
        name: row.name,
        tags: row.tags,
        url: await getPublicMediaUrl(row.storagePath),
        kind: row.kind as OwnPoolFile["kind"],
        // A saved file names its owner, the way a picked one does.
        credit: row.ownerId === userId ? null : { handle: row.handle },
      } satisfies OwnPoolFile,
    }))
  )
  return {
    sounds: files.filter((entry) => entry.purpose === "sound").map((entry) => entry.file),
    backgrounds: files
      .filter((entry) => entry.purpose === "background")
      .map((entry) => entry.file),
  }
}

const poolColumns = {
  mediaId: pomodoroMediaUploads.mediaId,
  ownerId: pomodoroMediaUploads.userId,
  purpose: pomodoroMediaUploads.purpose,
  kind: pomodoroMediaUploads.kind,
  name: sql<string>`coalesce(${pomodoroMediaUploads.name}, ${customShellMedia.originalName})`,
  tags: pomodoroMediaUploads.tags,
  storagePath: customShellMedia.storagePath,
  handle: creditHandle,
}

const tagged = sql`jsonb_array_length(${pomodoroMediaUploads.tags}) > 0`

/** The member's own uploads and AI files with a finished file, out of the bin. */
function loadUploaded(userId: string) {
  return db
    .select(poolColumns)
    .from(pomodoroMediaUploads)
    .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroMediaUploads.userId))
    .where(
      and(
        eq(pomodoroMediaUploads.userId, userId),
        isNull(pomodoroMediaUploads.deletedAt),
        // A first prepare is done, or an older cut plays while a new one is
        // made (`uploadIsShowable`).
        or(
          eq(pomodoroMediaUploads.status, "ready"),
          isNotNull(pomodoroMediaUploads.sourceMediaId)
        ),
        tagged
      )
    )
    .orderBy(asc(pomodoroMediaUploads.createdAt))
}

/** Somebody else's files the member saved, while they are still shared. */
function loadSaved(userId: string) {
  return db
    .select(poolColumns)
    .from(pomodoroSavedMedia)
    .innerJoin(pomodoroMediaUploads, eq(pomodoroMediaUploads.mediaId, pomodoroSavedMedia.mediaId))
    .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroMediaUploads.userId))
    .where(
      and(
        eq(pomodoroSavedMedia.userId, userId),
        ne(pomodoroMediaUploads.userId, userId),
        sharedWithOthers,
        tagged
      )
    )
    .orderBy(asc(pomodoroSavedMedia.createdAt))
    // Bounded, because this runs on every page load and saving is not.
    .limit(SAVED_POOL_LIMIT)
}

const SAVED_POOL_LIMIT = 200
