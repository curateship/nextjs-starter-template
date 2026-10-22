import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isAwake } from "@/lib/social/waking"
import { X_SEARCH_EVERY_HOURS, X_WATCH_EVERY_MINUTES } from "@/lib/social/x/options"

import { accountTimeZone, profileTimeZone, readBehaviour } from "../behaviour"
import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { queueInboxRead } from "../phone-apps/inbox"
import { promoAccounts, promoJobs } from "../schema"
import { tidyOldXFinds } from "./finds"
import { queueXReachLooks } from "./reach"
import { queueMentionReads, queueXChecks } from "./replies"
import { promoXKeywords, promoXSearchers, promoXTrends } from "./schema"
import { queueDueXWarmUps } from "./warm-up"

/**
 * X's quick, regular jobs on the shell's ticker. Each only writes jobs or
 * deletes old rows; the browser program does the reading and visiting, and
 * every read goes through a search account, which stops for the day at its
 * views (part 5), so a busy queue can never run an account past X's limit.
 *
 * - Every five minutes, while the search accounts are awake: a watched
 *   account is read again 15 minutes after its last read (part 11, Tyler:
 *   "Every 15 minutes"), and search words and hashtags 2 hours after (part
 *   10); a time is picked for each warming account's daily visit (part 28).
 * - Every ten minutes: sent replies and posts whose last reading is a day
 *   old are read again (part 37), each account's mentions (part 39) and its
 *   daily look from outside (parts 42 and 43) are asked for, the trends are
 *   read once a day (part 15), an X account in a browser has its messages
 *   read every three hours in its waking hours (part 41), and posts nobody
 *   answered are tidied away (part 18).
 */

const SEARCH_GAP_MS = 5 * 60_000
const CHECK_GAP_MS = 10 * 60_000
const DAY_MS = 86_400_000

/** How often an X account in a browser has its direct messages read, having no notifications to say so. */
const INBOX_EVERY_MS = 3 * 3_600_000

/** Searches queued in one pass are spread this many minutes apart, plus a random part of it. */
const SPREAD_MINUTES = 2

let lastSearchAt = 0
let lastCheckAt = 0

/** The people with at least one X search account, the only ones whose X can be read. */
async function peopleWithSearchers(db: CustomShellDb): Promise<string[]> {
  const rows = await db.selectDistinct({ userId: promoXSearchers.userId }).from(promoXSearchers)
  return rows.map((row) => row.userId)
}

/** True while the person's first search account is awake, by its browser's clock and the waking hours. */
async function searchersAwake(userId: string, db: CustomShellDb, now: Date): Promise<boolean> {
  const [first] = await db
    .select({ profileId: promoXSearchers.profileId })
    .from(promoXSearchers)
    .where(eq(promoXSearchers.userId, userId))
    .orderBy(promoXSearchers.createdAt)
    .limit(1)
  if (!first) return false
  const settings = await readBehaviour(userId, db)
  return isAwake(now, await profileTimeZone(first.profileId, db), settings.wakeFromMinute, settings.wakeUntilMinute)
}

/** Searches every switched-on X keyword again once it is due. Returns how many were queued. */
export async function queueDueXSearches(
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  random: () => number = Math.random
): Promise<number> {
  let queued = 0
  for (const userId of await peopleWithSearchers(db)) {
    if (!(await searchersAwake(userId, db, now))) continue
    const keywords = await db
      .select({ id: promoXKeywords.id, kind: promoXKeywords.kind, lastRunAt: promoXKeywords.lastRunAt })
      .from(promoXKeywords)
      .where(and(eq(promoXKeywords.userId, userId), eq(promoXKeywords.enabled, true)))
    const waiting = await db
      .select({ keywordId: sql<string>`${promoJobs.payload}->>'keywordId'` })
      .from(promoJobs)
      .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "x_search"), inArray(promoJobs.status, ["queued", "running"])))
    const busy = new Set(waiting.map((row) => row.keywordId))
    const due = keywords.filter((keyword) => {
      if (busy.has(keyword.id)) return false
      if (!keyword.lastRunAt) return true
      const gap = keyword.kind === "account" ? X_WATCH_EVERY_MINUTES * 60_000 : X_SEARCH_EVERY_HOURS * 3_600_000
      return now.getTime() - keyword.lastRunAt.getTime() >= gap
    })
    for (const [index, keyword] of due.entries()) {
      const minutes = keyword.kind === "account" ? 0 : index * SPREAD_MINUTES + random() * SPREAD_MINUTES
      try {
        await queueJob(userId, "x_search", { keywordId: keyword.id }, db, new Date(now.getTime() + minutes * 60_000))
        queued += 1
      } catch (error) {
        // Every search account is resting today; the next pass asks again.
        if (error instanceof Refusal) break
        throw error
      }
    }
  }
  return queued
}

/** Reads the trends once a day for a person with X keywords (part 15). */
async function queueTrendsRead(userId: string, db: CustomShellDb, now: Date): Promise<boolean> {
  const [last] = await db.select({ readAt: promoXTrends.readAt }).from(promoXTrends).where(eq(promoXTrends.userId, userId)).limit(1)
  if (last && now.getTime() - last.readAt.getTime() < DAY_MS) return false
  const [waiting] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "x_trends"),
        or(inArray(promoJobs.status, ["queued", "running"]), gte(promoJobs.createdAt, new Date(now.getTime() - DAY_MS)))
      )
    )
    .limit(1)
  if (waiting) return false
  await queueJob(userId, "x_trends", {}, db)
  return true
}

/** Reads the direct messages of every X account in a browser that is awake and was not read in three hours (part 41). */
export async function queueXBrowserInboxReads(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const accounts = await db
    .select()
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.platform, "x"),
        isNull(promoAccounts.phoneId),
        isNotNull(promoAccounts.profileId),
        isNull(promoAccounts.retiredAt),
        isNull(promoAccounts.banScreenAt),
        ne(promoAccounts.handle, "")
      )
    )
  let queued = 0
  for (const account of accounts) {
    if (await pausedBy(account.userId, account, db)) continue
    const settings = await readBehaviour(account.userId, db)
    if (!isAwake(now, await accountTimeZone(account, db), settings.wakeFromMinute, settings.wakeUntilMinute)) continue
    const [last] = await db
      .select({ createdAt: promoJobs.createdAt })
      .from(promoJobs)
      .where(and(eq(promoJobs.userId, account.userId), eq(promoJobs.kind, "inbox_read"), sql`${promoJobs.payload}->>'accountId' = ${account.id}`))
      .orderBy(desc(promoJobs.createdAt))
      .limit(1)
    if (last && now.getTime() - last.createdAt.getTime() < INBOX_EVERY_MS) continue
    if (await queueInboxRead(account.userId, account.id, "message", "inbox", db)) queued += 1
  }
  return queued
}

/** One tick of X's upkeep. Each part keeps its own gap, so most ticks do nothing. */
export async function xUpkeep(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  if (now.getTime() - lastSearchAt >= SEARCH_GAP_MS) {
    lastSearchAt = now.getTime()
    const searches = await queueDueXSearches(db, now)
    if (searches) console.log(`Queued ${searches} timed X search(es)`)
    const warmUps = await queueDueXWarmUps(db, now)
    if (warmUps) console.log(`Picked a time for ${warmUps} X warm-up visit(s)`)
  }
  if (now.getTime() - lastCheckAt >= CHECK_GAP_MS) {
    lastCheckAt = now.getTime()
    let reads = 0
    for (const userId of await peopleWithSearchers(db)) {
      try {
        reads += await queueXChecks(userId, null, db, now)
        reads += await queueMentionReads(userId, db, now)
        reads += await queueXReachLooks(userId, db, now)
        const [anyKeyword] = await db.select({ id: promoXKeywords.id }).from(promoXKeywords).where(eq(promoXKeywords.userId, userId)).limit(1)
        if (anyKeyword && (await queueTrendsRead(userId, db, now))) reads += 1
      } catch (error) {
        // Every search account is resting today; the next pass asks again.
        if (!(error instanceof Refusal)) throw error
      }
    }
    if (reads) console.log(`Asked for ${reads} X reading(s)`)
    const inboxes = await queueXBrowserInboxReads(db, now)
    if (inboxes) console.log(`Asked to read ${inboxes} X inbox(es) in a browser`)
    const tidied = await tidyOldXFinds(db, now)
    if (tidied) console.log(`Tidied ${tidied} old X posts nobody answered`)
  }
}

