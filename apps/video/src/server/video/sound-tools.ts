import { and, eq, inArray, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import {
  videoMediaBeats,
  videoMediaCleanSounds,
  videoMusicTracks,
} from "@/server/video/schema"
import {
  cleanSoundKey,
  type VoiceCleanStrength,
} from "@/lib/video/voice-clean"

/**
 * The two sound tools the background worker makes something for: the cleaned
 * copy of a file's sound that the preview plays (voice-clean.ts), and the
 * beats of a music file that clip edges snap to (beats.ts). Both answer for a
 * person's own files only; the caller works out whose files those are.
 */

export type CleanSoundState =
  | { status: "preparing" }
  | { status: "ready"; url: string }
  | { status: "failed"; error: string }

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
  if (!media) throw new Error("Media not found")
  if (media.fileType !== "audio" && media.fileType !== "video") {
    throw new Error("Only sound and video files have a voice to clean")
  }
}

/**
 * Where one file's cleaned copy at one strength stands, asking for it to be
 * made if it never was. `retry` puts a copy that failed back in the queue
 * with a fresh three tries; it never restarts one still being made.
 */
export async function requestOwnedCleanSound(
  userId: string,
  mediaId: string,
  strength: VoiceCleanStrength,
  { retry = false }: { retry?: boolean } = {},
  database: CustomShellDb = db
): Promise<CleanSoundState> {
  await requireOwnedSound(userId, mediaId, database)
  const id = cleanSoundKey(mediaId, strength)
  await database
    .insert(videoMediaCleanSounds)
    .values({
      id,
      mediaId,
      strength,
      status: "queued",
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .onConflictDoNothing()
  if (retry) {
    await database
      .update(videoMediaCleanSounds)
      .set({
        status: "queued",
        attempts: 0,
        error: null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: sql`now()`,
      })
      .where(and(eq(videoMediaCleanSounds.id, id), eq(videoMediaCleanSounds.status, "error")))
  }
  const [row] = await database
    .select({
      status: videoMediaCleanSounds.status,
      storagePath: videoMediaCleanSounds.storagePath,
      error: videoMediaCleanSounds.error,
    })
    .from(videoMediaCleanSounds)
    .where(eq(videoMediaCleanSounds.id, id))
    .limit(1)
  if (row?.status === "ready" && row.storagePath) {
    return { status: "ready", url: await getPublicMediaUrl(row.storagePath) }
  }
  if (row?.status === "error") {
    return { status: "failed", error: row.error ?? "Cleaning the sound failed" }
  }
  return { status: "preparing" }
}

export type BeatsState =
  | { status: "preparing" }
  | { status: "ready"; beats: number[]; tempo: number | null }

/**
 * The beats of whichever of these files are marked as music and found so far.
 * A music file the worker has not reached yet reads as being found. A file
 * that is not music, or whose beats could not be found, is left out: there is
 * nothing for its clip to snap to.
 */
export async function readOwnedBeats(
  userId: string,
  mediaIds: string[],
  database: CustomShellDb = db
): Promise<Record<string, BeatsState>> {
  if (!mediaIds.length) return {}
  const rows = await database
    .select({
      mediaId: videoMusicTracks.mediaId,
      status: videoMediaBeats.status,
      beats: videoMediaBeats.beats,
      tempo: videoMediaBeats.tempo,
    })
    .from(videoMusicTracks)
    .innerJoin(customShellMedia, eq(customShellMedia.id, videoMusicTracks.mediaId))
    .leftJoin(videoMediaBeats, eq(videoMediaBeats.mediaId, videoMusicTracks.mediaId))
    .where(
      and(
        eq(customShellMedia.userId, userId),
        inArray(videoMusicTracks.mediaId, mediaIds)
      )
    )
  const states: Record<string, BeatsState> = {}
  for (const row of rows) {
    if (row.status === null) {
      states[row.mediaId] = { status: "preparing" }
    } else if (row.status === "ready") {
      states[row.mediaId] = {
        status: "ready",
        beats: row.beats ?? [],
        tempo: row.tempo,
      }
    } else if (row.status !== "error") {
      states[row.mediaId] = { status: "preparing" }
    }
  }
  return states
}
