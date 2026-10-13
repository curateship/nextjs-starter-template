import { and, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isAwake } from "@/lib/social/waking"

import { profileTimeZone, readBehaviour } from "../behaviour"
import { queueJob } from "../jobs"
import { promoBehaviourSettings, promoJobs, promoKeywords } from "../schema"

/**
 * Keywords searching again by themselves.
 *
 * Tyler picked this on 12 Oct 2026 and set the gap: "4h is fine". The best
 * post to answer is a fresh one with few replies, and a keyword pressed once
 * in the morning misses everything posted after it. So every switched-on
 * keyword is searched again once its last search is the set number of hours
 * old, in the reader browser and only while the reader is awake.
 *
 * Only ever writes `search` jobs. Searching changes nothing on Reddit and runs
 * signed in to nobody, so the rule that nothing posts without a press is
 * untouched. A pressed search and a timed one are the same job.
 */

/**
 * The searches one pass queues for a person are spread out, each this many
 * minutes after the one before plus a random part of it, so Reddit never sees
 * every keyword in the same minute. The reader runs them one at a time anyway.
 */
const SPREAD_MINUTES = 3

/**
 * Queues a search for every switched-on keyword whose last search job is at
 * least the person's set number of hours old. Counted from when the last
 * search job was made, failed or not, so a keyword that keeps failing is
 * tried once a gap and not on every pass. A keyword with a search waiting or
 * running is left alone.
 *
 * Nothing is queued for a person with the setting at 0, with no reader
 * picked, or whose reader is asleep. Returns how many were queued.
 */
export async function queueDueSearches(
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  random: () => number = Math.random
): Promise<number> {
  const people = await db
    .selectDistinct({ userId: promoKeywords.userId })
    .from(promoKeywords)
    .innerJoin(promoBehaviourSettings, eq(promoBehaviourSettings.userId, promoKeywords.userId))
    .where(
      and(
        eq(promoKeywords.enabled, true),
        isNotNull(promoBehaviourSettings.readerProfileId)
      )
    )

  let queued = 0
  for (const { userId } of people) {
    const settings = await readBehaviour(userId, db)
    if (!settings.searchEveryHours || !settings.readerProfileId) continue
    const zone = await profileTimeZone(settings.readerProfileId, db)
    if (!isAwake(now, zone, settings.wakeFromMinute, settings.wakeUntilMinute)) continue

    const since = new Date(now.getTime() - settings.searchEveryHours * 3_600_000)
    const keywordId = sql<string>`${promoJobs.payload}->>'keywordId'`
    const recent = await db
      .select({ keywordId })
      .from(promoJobs)
      .where(
        and(
          eq(promoJobs.userId, userId),
          eq(promoJobs.kind, "search"),
          or(gte(promoJobs.createdAt, since), inArray(promoJobs.status, ["queued", "running"]))
        )
      )
    const searchedLately = new Set(recent.map((row) => row.keywordId))

    const keywords = await db
      .select({ id: promoKeywords.id })
      .from(promoKeywords)
      .where(and(eq(promoKeywords.userId, userId), eq(promoKeywords.enabled, true)))
    const due = keywords.filter((keyword) => !searchedLately.has(keyword.id))

    for (const [index, keyword] of due.entries()) {
      const minutes = index * SPREAD_MINUTES + random() * SPREAD_MINUTES
      const runAfter = new Date(now.getTime() + minutes * 60_000)
      await queueJob(userId, "search", { keywordId: keyword.id }, db, runAfter)
      queued += 1
    }
  }
  return queued
}
