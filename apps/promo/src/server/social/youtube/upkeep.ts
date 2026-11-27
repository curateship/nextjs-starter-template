import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isAwake } from "@/lib/social/waking"

import { accountTimeZone, readBehaviour } from "../behaviour"
import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { promoAccounts, promoJobs } from "../schema"
import { READABLE_CHANNEL } from "./run"

/**
 * YouTube's regular job on the shell's ticker (YouTube task, parts 8 and 9):
 * once a day per channel, inside its waking hours, the reading of its
 * subscribers, its videos' numbers and the newest comments under them.
 * Only writes the job; the browser program does the reading.
 */

const GAP_MS = 10 * 60_000
const DAY_MS = 86_400_000

let lastAt = 0

/** Queues each awake channel's daily reading once a day. Answers how many were queued. */
export async function queueYoutubeReadings(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const channels = await db.select().from(promoAccounts).where(READABLE_CHANNEL)
  if (!channels.length) return 0
  const since = new Date(now.getTime() - DAY_MS)
  const recent = await db
    .select({ accountId: sql<string>`${promoJobs.payload}->>'accountId'` })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.kind, "youtube_health"),
        inArray(
          sql`${promoJobs.payload}->>'accountId'`,
          channels.map((channel) => channel.id)
        ),
        or(inArray(promoJobs.status, ["queued", "running"]), gte(promoJobs.createdAt, since))
      )
    )
    .orderBy(desc(promoJobs.createdAt))
  const done = new Set(recent.map((row) => row.accountId))
  let queued = 0
  for (const channel of channels) {
    if (done.has(channel.id)) continue
    if (await pausedBy(channel.userId, channel, db)) continue
    const settings = await readBehaviour(channel.userId, db)
    if (!isAwake(now, await accountTimeZone(channel, db), settings.wakeFromMinute, settings.wakeUntilMinute)) continue
    await queueJob(channel.userId, "youtube_health", { accountId: channel.id }, db)
    queued += 1
  }
  return queued
}

/** One tick of YouTube's upkeep. Most ticks do nothing. */
export async function youtubeUpkeep(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  if (now.getTime() - lastAt < GAP_MS) return
  lastAt = now.getTime()
  const readings = await queueYoutubeReadings(db, now)
  if (readings) console.log(`Asked for ${readings} YouTube channel reading(s)`)
}
