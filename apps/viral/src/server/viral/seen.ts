import { and, eq, inArray } from "drizzle-orm"

import { isCreatorPlatform } from "@/lib/viral/creators"
import { viralSays } from "@/lib/viral/viral"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { viralSeenVideos } from "@/server/viral/schema"

/**
 * Who has opened which video (`workspace/docs/finding-content.md`). Tyler,
 * 4 Nov 2026: "Opening that video". Opening a video on the right panel clears
 * its New mark for that person alone, and an opened video looks dimmer in the
 * list. The row belongs to the person, not the project, so a video opened in
 * one project is opened in all of them.
 */

export async function markVideoSeen(
  userId: string,
  video: { platform: string; platformVideoId: string },
  database: CustomShellDb = db
) {
  if (!isCreatorPlatform(video.platform)) throw viralSays("That video's social isn't one Viral reads.")
  await database
    .insert(viralSeenVideos)
    .values({ userId, platform: video.platform, platformVideoId: video.platformVideoId, seenAt: now() })
    .onConflictDoNothing()
}

/** Which of these videos the person has opened, by `platform:platformVideoId`. */
export async function seenKeys(
  userId: string,
  videos: { platform: string; platformVideoId: string }[],
  database: CustomShellDb = db
): Promise<Set<string>> {
  if (!videos.length) return new Set()
  const ids = [...new Set(videos.map((video) => video.platformVideoId))]
  const rows = await database
    .select({ platform: viralSeenVideos.platform, platformVideoId: viralSeenVideos.platformVideoId })
    .from(viralSeenVideos)
    .where(and(eq(viralSeenVideos.userId, userId), inArray(viralSeenVideos.platformVideoId, ids)))
  return new Set(rows.map((row) => `${row.platform}:${row.platformVideoId}`))
}
