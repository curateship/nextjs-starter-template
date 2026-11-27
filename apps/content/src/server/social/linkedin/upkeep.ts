import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { localDateKey } from "@/lib/social/waking"
import { LINKEDIN_SEARCH_EVERY_HOURS, LINKEDIN_WATCH_EVERY_MINUTES, isWatchKind } from "@/lib/social/linkedin/options"
import { isWorkday } from "@/lib/social/linkedin/workday"

import { accountTimeZone, profileTimeZone } from "../behaviour"
import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { queueInboxRead } from "../phone-apps/inbox"
import { promoAccounts, promoJobs } from "../schema"
import { queueLinkedinChecks } from "./comments"
import { tidyOldLinkedinFinds } from "./finds"
import { linkedinAccountsInUse } from "./people"
import { queueLinkedinNumbers, queueLinkedinSeenLooks } from "./reach"
import { promoLinkedinKeywords, promoLinkedinSearchers } from "./schema"
import { queueDueLinkedinWarmUps } from "./warm-up"

/**
 * LinkedIn's quick, regular jobs on the shell's ticker. Each only writes jobs
 * or deletes old rows; the browser program does the reading and visiting.
 * Reads of LinkedIn go through a search account, which stops for the day at
 * its views (part 3), so a busy queue can never run an account past
 * LinkedIn's limit; reads of the account's own pages happen in its own
 * browser inside its workday (part 7).
 *
 * - Every five minutes, inside the search accounts' workday: a watched person
 *   or page is read again 30 minutes after its last read (part 12, Tyler:
 *   "Every 30 minutes"), and search words and hashtags 3 hours after (part
 *   11); a time is picked for each warming account's daily visit (part 27).
 * - Every ten minutes: sent comments and posts whose last reading is a day
 *   old are read again (part 43), each account's weekly comments look (part
 *   46) and numbers (part 47) are asked for, and posts nobody answered are
 *   tidied away (part 19).
 * - Once a workday per account, in its own browser or phone: its waiting
 *   connection requests and profile viewers (parts 40 and 41), its own feed
 *   (part 13), and its messages every three hours (part 42).
 */

const SEARCH_GAP_MS = 5 * 60_000
const CHECK_GAP_MS = 10 * 60_000

/** How often a LinkedIn account in a browser has its messages read, having no notifications to say so. */
const INBOX_EVERY_MS = 3 * 3_600_000

/** How often an account's own feed is read in its workday. */
const FEED_EVERY_MS = 4 * 3_600_000

/** Searches queued in one pass are spread this many minutes apart, plus a random part of it. */
const SPREAD_MINUTES = 2

let lastSearchAt = 0
let lastCheckAt = 0

/** The people with at least one LinkedIn search account, the only ones whose LinkedIn can be read. */
async function peopleWithSearchers(db: CustomShellDb): Promise<string[]> {
  const rows = await db.selectDistinct({ userId: promoLinkedinSearchers.userId }).from(promoLinkedinSearchers)
  return rows.map((row) => row.userId)
}

/** True while the person's first search account is inside its workday, by its browser's clock. */
async function searchersWorking(userId: string, db: CustomShellDb, now: Date): Promise<boolean> {
  const [first] = await db
    .select({ profileId: promoLinkedinSearchers.profileId })
    .from(promoLinkedinSearchers)
    .where(eq(promoLinkedinSearchers.userId, userId))
    .orderBy(promoLinkedinSearchers.createdAt)
    .limit(1)
  if (!first) return false
  return isWorkday(now, await profileTimeZone(first.profileId, db))
}

/** Searches every switched-on LinkedIn keyword again once it is due. Returns how many were queued. */
export async function queueDueLinkedinSearches(db: CustomShellDb = defaultDb, now: Date = new Date(), random: () => number = Math.random): Promise<number> {
  let queued = 0
  for (const userId of await peopleWithSearchers(db)) {
    if (!(await searchersWorking(userId, db, now))) continue
    const keywords = await db
      .select({ id: promoLinkedinKeywords.id, kind: promoLinkedinKeywords.kind, lastRunAt: promoLinkedinKeywords.lastRunAt })
      .from(promoLinkedinKeywords)
      .where(and(eq(promoLinkedinKeywords.userId, userId), eq(promoLinkedinKeywords.enabled, true)))
    const waiting = await db
      .select({ keywordId: sql<string>`${promoJobs.payload}->>'keywordId'` })
      .from(promoJobs)
      .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "linkedin_search"), inArray(promoJobs.status, ["queued", "running"])))
    const busy = new Set(waiting.map((row) => row.keywordId))
    const due = keywords.filter((keyword) => {
      if (busy.has(keyword.id)) return false
      if (!keyword.lastRunAt) return true
      const gap = isWatchKind(keyword.kind) ? LINKEDIN_WATCH_EVERY_MINUTES * 60_000 : LINKEDIN_SEARCH_EVERY_HOURS * 3_600_000
      return now.getTime() - keyword.lastRunAt.getTime() >= gap
    })
    for (const [index, keyword] of due.entries()) {
      const minutes = isWatchKind(keyword.kind) ? 0 : index * SPREAD_MINUTES + random() * SPREAD_MINUTES
      try {
        await queueJob(userId, "linkedin_search", { keywordId: keyword.id }, db, new Date(now.getTime() + minutes * 60_000))
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

/** The newest job of a kind for an account, to space the account's own reads. */
async function lastJob(userId: string, kind: "linkedin_invites" | "linkedin_viewers" | "linkedin_feed" | "inbox_read", accountId: string, db: CustomShellDb) {
  const [row] = await db
    .select({ status: promoJobs.status, createdAt: promoJobs.createdAt })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, kind), sql`${promoJobs.payload}->>'accountId' = ${accountId}`))
    .orderBy(desc(promoJobs.createdAt))
    .limit(1)
  return row ?? null
}

/**
 * The account's own reads, inside its workday: its waiting requests and
 * viewers once a workday, its feed every four hours, and, in a browser, its
 * messages every three hours. A phone's messages come in on its
 * notifications instead.
 */
export async function queueLinkedinAccountReads(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  let queued = 0
  for (const account of await linkedinAccountsInUse(db)) {
    if (!account.profileId && !account.phoneId) continue
    if (await pausedBy(account.userId, account, db)) continue
    const zone = await accountTimeZone(account, db)
    if (!isWorkday(now, zone)) continue
    const today = localDateKey(now, zone)
    const daily: Array<"linkedin_invites" | "linkedin_viewers"> = account.phoneId ? ["linkedin_invites"] : ["linkedin_invites", "linkedin_viewers"]
    for (const kind of daily) {
      const last = await lastJob(account.userId, kind, account.id, db)
      if (last && (last.status === "queued" || last.status === "running" || localDateKey(last.createdAt, zone) === today)) continue
      await queueJob(account.userId, kind, { accountId: account.id }, db)
      queued += 1
    }
    if (account.profileId && !account.phoneId) {
      const feed = await lastJob(account.userId, "linkedin_feed", account.id, db)
      if (!feed || (feed.status !== "queued" && feed.status !== "running" && now.getTime() - feed.createdAt.getTime() >= FEED_EVERY_MS)) {
        await queueJob(account.userId, "linkedin_feed", { accountId: account.id }, db)
        queued += 1
      }
      const inbox = await lastJob(account.userId, "inbox_read", account.id, db)
      if ((!inbox || now.getTime() - inbox.createdAt.getTime() >= INBOX_EVERY_MS) && (await queueInboxRead(account.userId, account.id, "message", "inbox", db))) {
        queued += 1
      }
    }
  }
  return queued
}

/** The people with LinkedIn accounts in a browser, whose numbers are read in the account's own browser. */
async function peopleWithBrowserAccounts(db: CustomShellDb): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: promoAccounts.userId })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.platform, "linkedin"), isNotNull(promoAccounts.profileId), isNull(promoAccounts.retiredAt), ne(promoAccounts.handle, "")))
  return rows.map((row) => row.userId)
}

/** One tick of LinkedIn's upkeep. Each part keeps its own gap, so most ticks do nothing. */
export async function linkedinUpkeep(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  if (now.getTime() - lastSearchAt >= SEARCH_GAP_MS) {
    lastSearchAt = now.getTime()
    const searches = await queueDueLinkedinSearches(db, now)
    if (searches) console.log(`Queued ${searches} timed LinkedIn search(es)`)
    const warmUps = await queueDueLinkedinWarmUps(db, now)
    if (warmUps) console.log(`Picked a time for ${warmUps} LinkedIn warm-up visit(s)`)
  }
  if (now.getTime() - lastCheckAt >= CHECK_GAP_MS) {
    lastCheckAt = now.getTime()
    let reads = 0
    for (const userId of await peopleWithSearchers(db)) {
      try {
        reads += await queueLinkedinChecks(userId, null, db, now)
        reads += await queueLinkedinSeenLooks(userId, db, now)
      } catch (error) {
        // Every search account is resting today; the next pass asks again.
        if (!(error instanceof Refusal)) throw error
      }
    }
    for (const userId of await peopleWithBrowserAccounts(db)) reads += await queueLinkedinNumbers(userId, db, now)
    reads += await queueLinkedinAccountReads(db, now)
    if (reads) console.log(`Asked for ${reads} LinkedIn reading(s)`)
    const tidied = await tidyOldLinkedinFinds(db, now)
    if (tidied) console.log(`Tidied ${tidied} old LinkedIn posts nobody answered`)
  }
}
