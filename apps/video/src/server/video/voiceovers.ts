import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm"

import type { CaptionLine } from "@/lib/video/captions"
import {
  readSavedCaptions,
  VOICEOVER_SHELF_LIMIT,
  voiceoverName,
  type SavedVoiceover,
} from "@/lib/video/saved-voiceovers"
import { db, type CustomShellDb } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { videoVoiceovers } from "@/server/video/schema"

/**
 * The voiceover shelf: every voiceover read aloud, kept with what it said.
 *
 * The file is an ordinary row in the media library. The shelf row beside it
 * is written in the same transaction, so there is never a voiceover file the
 * shelf does not know about, nor a shelf row with no file.
 */

export async function storeVoiceover(
  media: typeof customShellMedia.$inferInsert,
  voiceover: {
    script: string
    voiceId: string
    voiceName: string
    durationMs: number
    captions: CaptionLine[]
  },
  database: CustomShellDb = db
) {
  await database.transaction(async (tx) => {
    await tx.insert(customShellMedia).values(media)
    await tx.insert(videoVoiceovers).values({
      mediaId: media.id,
      ...voiceover,
      createdAt: media.createdAt,
    })
  })
}

/** One person's voiceovers, newest first, narrowed to the words searched for. */
export async function listVoiceovers(
  userId: string,
  search = "",
  database: CustomShellDb = db
): Promise<SavedVoiceover[]> {
  const filters: SQL[] = [eq(customShellMedia.userId, userId)]
  const cleaned = search.trim()
  if (cleaned) {
    const pattern = `%${cleaned.replace(/([\\%_])/g, "\\$1")}%`
    const matches = or(
      ilike(videoVoiceovers.script, pattern),
      ilike(videoVoiceovers.voiceName, pattern)
    )
    if (matches) filters.push(matches)
  }

  const rows = await database
    .select({
      mediaId: videoVoiceovers.mediaId,
      storagePath: customShellMedia.storagePath,
      script: videoVoiceovers.script,
      voiceName: videoVoiceovers.voiceName,
      durationMs: videoVoiceovers.durationMs,
      captions: videoVoiceovers.captions,
    })
    .from(videoVoiceovers)
    .innerJoin(customShellMedia, eq(customShellMedia.id, videoVoiceovers.mediaId))
    .where(and(...filters))
    .orderBy(desc(videoVoiceovers.createdAt), desc(videoVoiceovers.mediaId))
    .limit(VOICEOVER_SHELF_LIMIT)

  return Promise.all(
    rows.map(async ({ storagePath, captions, ...row }) => ({
      ...row,
      name: voiceoverName(row.script),
      url: await getPublicMediaUrl(storagePath),
      captions: readSavedCaptions(captions),
    }))
  )
}
