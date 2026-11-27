import { and, eq } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoYoutubePosts } from "./schema"

/**
 * Writes a failure onto the upload a failed `youtube_upload` job carried,
 * when the job failed before its own code could: refused at the door
 * (retired, paused, a browser that would not open), dropped by a ban
 * screen, or abandoned when its browser or phone stopped part-way. An upload
 * already marked by its own code is left as it is. Without this the row would
 * stay "waiting" and keep counting against the channel's uploads a day.
 */
export async function settleFailedYoutubeJob(
  job: { id: string; kind: string },
  message: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (job.kind !== "youtube_upload") return
  await db
    .update(promoYoutubePosts)
    .set({ status: "failed", lastError: message.slice(0, 2_000) })
    .where(and(eq(promoYoutubePosts.jobId, job.id), eq(promoYoutubePosts.status, "waiting")))
}
