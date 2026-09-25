import { and, desc, eq, sql } from "drizzle-orm"

import {
  MUSIC_FILE_NOT_FOUND_MESSAGE,
  MUSIC_NOT_SOUND_MESSAGE,
} from "@/lib/video/background-music"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia, type MediaItem } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { videoMusicTracks } from "@/server/video/schema"

/**
 * The music shelf: the sound files a person has marked as music. The files
 * themselves are ordinary uploads in the media library; the mark is all this
 * app adds. Every write proves the file is the caller's own sound file first,
 * so a borrowed id cannot mark or unmark somebody else's.
 */

export type MusicShelfFile = MediaItem & { is_music: boolean }

/**
 * Enough for one person's sound files, newest first. Voiceovers pile up over
 * time, so the list is capped rather than paged: the music is what matters,
 * and it is sorted to the top.
 */
const SHELF_LIMIT = 200

export async function listMusicShelf(
  userId: string,
  database: CustomShellDb = db
): Promise<MusicShelfFile[]> {
  const rows = await database
    .select({ media: customShellMedia, markedAt: videoMusicTracks.createdAt })
    .from(customShellMedia)
    .leftJoin(videoMusicTracks, eq(videoMusicTracks.mediaId, customShellMedia.id))
    .where(
      and(
        eq(customShellMedia.userId, userId),
        eq(customShellMedia.fileType, "audio")
      )
    )
    .orderBy(
      // Postgres puts empty values first when sorting newest first, which
      // would bury the music under every unmarked file.
      sql`${videoMusicTracks.createdAt} desc nulls last`,
      desc(customShellMedia.createdAt),
      desc(customShellMedia.id)
    )
    .limit(SHELF_LIMIT)

  return Promise.all(
    rows.map(async (row) => ({
      ...(await serializeMedia(row.media)),
      is_music: row.markedAt !== null,
    }))
  )
}

async function requireOwnedSound(
  userId: string,
  mediaId: string,
  database: CustomShellDb
) {
  const [media] = await database
    .select({ fileType: customShellMedia.fileType })
    .from(customShellMedia)
    .where(
      and(eq(customShellMedia.id, mediaId), eq(customShellMedia.userId, userId))
    )
    .limit(1)
  if (!media) throw new Error(MUSIC_FILE_NOT_FOUND_MESSAGE)
  if (media.fileType !== "audio") throw new Error(MUSIC_NOT_SOUND_MESSAGE)
}

export async function markAsMusic(
  userId: string,
  mediaId: string,
  database: CustomShellDb = db
) {
  await requireOwnedSound(userId, mediaId, database)
  await database
    .insert(videoMusicTracks)
    .values({ mediaId, createdAt: now() })
    .onConflictDoNothing()
}

/** Takes the mark off. The file stays in the media library. */
export async function unmarkMusic(
  userId: string,
  mediaId: string,
  database: CustomShellDb = db
) {
  await requireOwnedSound(userId, mediaId, database)
  await database
    .delete(videoMusicTracks)
    .where(eq(videoMusicTracks.mediaId, mediaId))
}
