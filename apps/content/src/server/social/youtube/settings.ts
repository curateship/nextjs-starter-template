import { eq } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { UPLOADS_PER_DAY } from "@/lib/social/youtube/options"

import { promoYoutubeSettings } from "./schema"

/**
 * YouTube's own number in Settings → Behaviour: how many videos one channel
 * may upload in a day, Shorts included. Tyler, 26 Nov 2026: "Start at 3 a
 * day", his to change. No row means where it begins.
 */

export type YoutubeSettings = { uploadsPerDay: number }

export async function readYoutubeSettings(userId: string, db: CustomShellDb = defaultDb): Promise<YoutubeSettings> {
  const [row] = await db
    .select({ uploadsPerDay: promoYoutubeSettings.uploadsPerDay })
    .from(promoYoutubeSettings)
    .where(eq(promoYoutubeSettings.userId, userId))
    .limit(1)
  return { uploadsPerDay: row?.uploadsPerDay ?? UPLOADS_PER_DAY.start }
}

export async function saveYoutubeSettings(
  userId: string,
  input: YoutubeSettings,
  db: CustomShellDb = defaultDb
): Promise<YoutubeSettings> {
  const uploadsPerDay = Math.round(input.uploadsPerDay)
  if (!Number.isFinite(uploadsPerDay) || uploadsPerDay < UPLOADS_PER_DAY.min || uploadsPerDay > UPLOADS_PER_DAY.max) {
    throw new Error(`Uploads a day must be a whole number from ${UPLOADS_PER_DAY.min} to ${UPLOADS_PER_DAY.max}.`)
  }
  const now = new Date()
  await db
    .insert(promoYoutubeSettings)
    .values({ userId, uploadsPerDay, updatedAt: now })
    .onConflictDoUpdate({ target: promoYoutubeSettings.userId, set: { uploadsPerDay, updatedAt: now } })
  return { uploadsPerDay }
}
