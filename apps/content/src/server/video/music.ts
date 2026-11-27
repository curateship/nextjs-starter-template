import { and, desc, eq } from "drizzle-orm"

import {
  MUSIC_FILE_NOT_FOUND_MESSAGE,
  MUSIC_NOT_SOUND_MESSAGE,
} from "@/lib/video/background-music"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia, type MediaItem } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { videoMediaBeats, videoMusicTracks } from "@/server/video/schema"

/**
 * The music shelf: the sound files a person has marked as music. The files
 * themselves are ordinary uploads in the media library; the mark is all this
 * app adds. Every write proves the file is the caller's own sound file first,
 * so a borrowed id cannot mark or unmark somebody else's.
 */

export type MusicShelfFile = MediaItem

/** One person's music, newest mark first. */
export async function listMusicShelf(
  userId: string,
  database: CustomShellDb = db
): Promise<MusicShelfFile[]> {
  const rows = await database
    .select({ media: customShellMedia })
    .from(videoMusicTracks)
    .innerJoin(customShellMedia, eq(customShellMedia.id, videoMusicTracks.mediaId))
    .where(
      and(
        eq(customShellMedia.userId, userId),
        eq(customShellMedia.fileType, "audio")
      )
    )
    .orderBy(desc(videoMusicTracks.createdAt), desc(customShellMedia.id))

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
  // Its beats are queued now rather than at the worker's next look round,
  // so an editor asking straight away hears "being found", not "none"
  // (beat-snapping.md). Marking it again is how beats that failed get
  // another go.
  const at = now()
  await database
    .insert(videoMediaBeats)
    .values({ mediaId, status: "queued", createdAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: videoMediaBeats.mediaId,
      set: {
        status: "queued",
        attempts: 0,
        error: null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: at,
      },
      setWhere: eq(videoMediaBeats.status, "error"),
    })
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
