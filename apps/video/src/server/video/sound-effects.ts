import { and, desc, eq } from "drizzle-orm"

import {
  SOUND_FILE_NOT_FOUND_MESSAGE,
  SOUND_NOT_SOUND_MESSAGE,
} from "@/lib/video/stock-sounds"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia, type MediaItem } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { videoSoundEffects } from "@/server/video/schema"

/**
 * A person's own sound effects: sound files they uploaded and marked for the
 * Sounds panel, beside the starter pack that ships with Video. The files are
 * ordinary uploads in the media library; the mark is all this app adds, the
 * same as the music shelf. Every write proves the file is the caller's own
 * sound file first.
 */

const SHELF_LIMIT = 200

export async function listSoundEffects(
  userId: string,
  database: CustomShellDb = db
): Promise<MediaItem[]> {
  const rows = await database
    .select({ media: customShellMedia })
    .from(videoSoundEffects)
    .innerJoin(customShellMedia, eq(customShellMedia.id, videoSoundEffects.mediaId))
    .where(eq(customShellMedia.userId, userId))
    .orderBy(desc(videoSoundEffects.createdAt), desc(customShellMedia.id))
    .limit(SHELF_LIMIT)
  return Promise.all(rows.map((row) => serializeMedia(row.media)))
}

async function requireOwnedSound(
  userId: string,
  mediaId: string,
  database: CustomShellDb
) {
  const [media] = await database
    .select({ fileType: customShellMedia.fileType })
    .from(customShellMedia)
    .where(and(eq(customShellMedia.id, mediaId), eq(customShellMedia.userId, userId)))
    .limit(1)
  if (!media) throw new Error(SOUND_FILE_NOT_FOUND_MESSAGE)
  if (media.fileType !== "audio") throw new Error(SOUND_NOT_SOUND_MESSAGE)
}

export async function markAsSoundEffect(
  userId: string,
  mediaId: string,
  database: CustomShellDb = db
) {
  await requireOwnedSound(userId, mediaId, database)
  await database
    .insert(videoSoundEffects)
    .values({ mediaId, createdAt: now() })
    .onConflictDoNothing()
}

/** Takes the mark off. The file stays in the media library. */
export async function unmarkSoundEffect(
  userId: string,
  mediaId: string,
  database: CustomShellDb = db
) {
  await requireOwnedSound(userId, mediaId, database)
  await database
    .delete(videoSoundEffects)
    .where(eq(videoSoundEffects.mediaId, mediaId))
}
