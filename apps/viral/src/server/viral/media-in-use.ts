import { and, eq, inArray } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { viralVaultItems, viralVideos } from "@/server/viral/schema"

/**
 * Which of these files something in Viral still uses: a saved video, or a
 * vault item's copy. Asked before a file is taken out of storage, so a video
 * kept in the vault still plays after its saved video is deleted, and the
 * other way round (`workspace/docs/vault.md`).
 */
export async function mediaStillInUse(
  userId: string,
  mediaIds: string[],
  database: CustomShellDb = db
): Promise<Set<string>> {
  const ids = [...new Set(mediaIds)]
  if (!ids.length) return new Set()
  const [saved, vault] = await Promise.all([
    database
      .select({ id: viralVideos.mediaId })
      .from(viralVideos)
      .where(and(eq(viralVideos.ownerId, userId), inArray(viralVideos.mediaId, ids))),
    database
      .select({ id: viralVaultItems.mediaId })
      .from(viralVaultItems)
      .where(and(eq(viralVaultItems.ownerId, userId), inArray(viralVaultItems.mediaId, ids))),
  ])
  return new Set([...saved, ...vault].flatMap((row) => (row.id ? [row.id] : [])))
}
