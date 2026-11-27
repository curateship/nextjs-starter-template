import { and, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isAwake } from "@/lib/social/waking"

import { profileTimeZone, readBehaviour } from "../behaviour"
import { queueJob } from "../jobs"
import { promoBehaviourSettings, promoJobs } from "../schema"
import { queueArticleChecks } from "./articles"
import { tidyOldMediumFinds } from "./finds"
import { queueResponseChecks } from "./responses"
import { promoMediumArticles, promoMediumKeywords, promoMediumResponses } from "./schema"
import { queueDueMediumWarmUps } from "./warm-up"

/**
 * Medium's quick, regular jobs on the shell's ticker. Each only writes jobs
 * or deletes old rows; the browser program does the reading and visiting.
 *
 * - Every five minutes: each switched-on Medium keyword is searched again
 *   once its last search is the hours set in Settings → Behaviour old, while
 *   the reader is awake (part 7), and a time is picked for each warming
 *   account's daily visit (part 3).
 * - Every ten minutes: sent responses and published articles whose last
 *   reading is a day old are read again (parts 35 and 40), and stories
 *   nobody answered are tidied away (part 12).
 */

const SEARCH_GAP_MS = 5 * 60_000
const CHECK_GAP_MS = 10 * 60_000

/** Searches queued in one pass are spread this many minutes apart, plus a random part of it. */
const SPREAD_MINUTES = 3

let lastSearchAt = 0
let lastCheckAt = 0

/** Searches every switched-on Medium keyword again once it is due. Returns how many were queued. */
export async function queueDueMediumSearches(
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  random: () => number = Math.random
): Promise<number> {
  const people = await db
    .selectDistinct({ userId: promoMediumKeywords.userId })
    .from(promoMediumKeywords)
    .innerJoin(promoBehaviourSettings, eq(promoBehaviourSettings.userId, promoMediumKeywords.userId))
    .where(and(eq(promoMediumKeywords.enabled, true), isNotNull(promoBehaviourSettings.readerProfileId)))
  let queued = 0
  for (const { userId } of people) {
    const settings = await readBehaviour(userId, db)
    if (!settings.searchEveryHours || !settings.readerProfileId) continue
    const zone = await profileTimeZone(settings.readerProfileId, db)
    if (!isAwake(now, zone, settings.wakeFromMinute, settings.wakeUntilMinute)) continue
    const since = new Date(now.getTime() - settings.searchEveryHours * 3_600_000)
    const recent = await db
      .select({ keywordId: sql<string>`${promoJobs.payload}->>'keywordId'` })
      .from(promoJobs)
      .where(
        and(
          eq(promoJobs.userId, userId),
          eq(promoJobs.kind, "medium_search"),
          or(gte(promoJobs.createdAt, since), inArray(promoJobs.status, ["queued", "running"]))
        )
      )
    const searchedLately = new Set(recent.map((row) => row.keywordId))
    const keywords = await db
      .select({ id: promoMediumKeywords.id })
      .from(promoMediumKeywords)
      .where(and(eq(promoMediumKeywords.userId, userId), eq(promoMediumKeywords.enabled, true)))
    const due = keywords.filter((keyword) => !searchedLately.has(keyword.id))
    for (const [index, keyword] of due.entries()) {
      const minutes = index * SPREAD_MINUTES + random() * SPREAD_MINUTES
      await queueJob(userId, "medium_search", { keywordId: keyword.id }, db, new Date(now.getTime() + minutes * 60_000))
      queued += 1
    }
  }
  return queued
}

/** One tick of Medium's upkeep. Each part keeps its own gap, so most ticks do nothing. */
export async function mediumUpkeep(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  if (now.getTime() - lastSearchAt >= SEARCH_GAP_MS) {
    lastSearchAt = now.getTime()
    const searches = await queueDueMediumSearches(db, now)
    if (searches) console.log(`Queued ${searches} timed Medium search(es)`)
    const warmUps = await queueDueMediumWarmUps(db, now)
    if (warmUps) console.log(`Picked a time for ${warmUps} Medium warm-up visit(s)`)
  }
  if (now.getTime() - lastCheckAt >= CHECK_GAP_MS) {
    lastCheckAt = now.getTime()
    const people = await db
      .selectDistinct({ userId: promoMediumResponses.userId })
      .from(promoMediumResponses)
      .where(eq(promoMediumResponses.status, "posted"))
    const writers = await db
      .selectDistinct({ userId: promoMediumArticles.userId })
      .from(promoMediumArticles)
      .where(eq(promoMediumArticles.status, "published"))
    let checks = 0
    for (const userId of new Set([...people, ...writers].map((row) => row.userId))) {
      // A check without a reader is refused, so it waits for one to be picked.
      if (!(await readBehaviour(userId, db)).readerProfileId) continue
      checks += await queueResponseChecks(userId, null, db, now)
      checks += await queueArticleChecks(userId, null, db, now)
    }
    if (checks) console.log(`Asked for ${checks} Medium reading(s) of sent responses and articles`)
    const tidied = await tidyOldMediumFinds(db, now)
    if (tidied) console.log(`Tidied ${tidied} old Medium stories nobody answered`)
  }
}
