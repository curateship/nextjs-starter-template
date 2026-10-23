import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { handleWords } from "@/lib/social/networks"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"

import { nextWorkdayAt } from "@/lib/social/linkedin/workday"

import { accountTimeZone } from "../behaviour"
import { queueJob } from "../jobs"
import { noticeRung, ringBell } from "../notices"
import { promoAccounts, promoJobs } from "../schema"
import { utcDay } from "../x/searchers"
import { linkedinLookup, linkedinNumbers, linkedinSeen } from "./calls"
import { promoLinkedinComments, promoLinkedinReadings } from "./schema"
import type { LinkedinReader } from "./search"
import { spendLinkedinViews } from "./searchers"

/**
 * Each LinkedIn account's weekly looks (parts 46 and 47):
 *
 * - **Its numbers.** Followers, connections, profile views and post
 *   impressions, read off its own dashboard in its own browser, since only
 *   the account sees its views and impressions. Kept one row a week and
 *   drawn week by week. A number LinkedIn shows only to Premium is left
 *   blank on a free account, never written as 0.
 * - **Whether its comments still show.** Through a search account, so it is
 *   how a stranger sees them: its latest comments opened under their posts.
 *   When none of them shows, the account is marked "Comments hidden?" and
 *   the bell rings once. LinkedIn never says so, so the words call it
 *   Promo's best guess.
 */

const WEEK_MS = 7 * 86_400_000

/** How many of the account's latest comments the weekly look opens. */
const SEEN_COMMENTS = 5

/** Asks for this week's numbers of every LinkedIn account in a browser that has none this week. */
export async function queueLinkedinNumbers(userId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const accounts = await db
    .select()
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        eq(promoAccounts.platform, "linkedin"),
        ne(promoAccounts.handle, ""),
        isNull(promoAccounts.retiredAt),
        isNull(promoAccounts.banScreenAt),
        isNull(promoAccounts.phoneId)
      )
    )
  let queued = 0
  for (const account of accounts) {
    const [last] = await db
      .select({ readOn: promoLinkedinReadings.readOn })
      .from(promoLinkedinReadings)
      .where(eq(promoLinkedinReadings.accountId, account.id))
      .orderBy(desc(promoLinkedinReadings.readOn))
      .limit(1)
    if (last && now.getTime() - new Date(`${last.readOn}T00:00:00Z`).getTime() < WEEK_MS) continue
    if (await askedLately(userId, "linkedin_numbers", account.id, db, now)) continue
    // Its own browser visits LinkedIn only in its workday (part 7).
    await queueJob(userId, "linkedin_numbers", { accountId: account.id }, db, nextWorkdayAt(now, await accountTimeZone(account, db)))
    queued += 1
  }
  return queued
}

/** True when a job of this kind for the account was asked for in the last week, finished, failed or waiting, so a failing one is not asked for every pass. */
async function askedLately(userId: string, kind: "linkedin_numbers" | "linkedin_seen", accountId: string, db: CustomShellDb, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, kind),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`,
        or(inArray(promoJobs.status, ["queued", "running"]), gte(promoJobs.createdAt, new Date(now.getTime() - WEEK_MS)))
      )
    )
    .limit(1)
  return Boolean(row)
}

/** Reads one account's numbers in its own browser and keeps them as this week's reading. */
export async function runLinkedinNumbers(
  account: Pick<typeof promoAccounts.$inferSelect, "id" | "followers">,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const read = await linkedinNumbers(target)
  const values = { followers: read.followers, connections: read.connections, profileViews: read.profileViews, impressions: read.impressions }
  await db
    .insert(promoLinkedinReadings)
    .values({ accountId: account.id, readOn: utcDay(now), ...values })
    .onConflictDoUpdate({ target: [promoLinkedinReadings.accountId, promoLinkedinReadings.readOn], set: values })
  if (read.followers !== null) await db.update(promoAccounts).set({ followers: read.followers }).where(eq(promoAccounts.id, account.id))
}

export type LinkedinReadingView = { readOn: string; followers: number | null; connections: number | null; profileViews: number | null; impressions: number | null }

/** An account's readings, oldest first, for its chart (part 47). */
export async function listLinkedinReadings(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<LinkedinReadingView[]> {
  const [account] = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Error("That account does not exist.")
  return db
    .select({
      readOn: promoLinkedinReadings.readOn,
      followers: promoLinkedinReadings.followers,
      connections: promoLinkedinReadings.connections,
      profileViews: promoLinkedinReadings.profileViews,
      impressions: promoLinkedinReadings.impressions,
    })
    .from(promoLinkedinReadings)
    .where(eq(promoLinkedinReadings.accountId, accountId))
    .orderBy(asc(promoLinkedinReadings.readOn))
    .limit(200)
}

/** Asks for this week's look at whether each LinkedIn account's comments still show, for every account with comments to look at. */
export async function queueLinkedinSeenLooks(userId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const accounts = await db
    .select({ id: promoAccounts.id, seenAt: promoAccounts.linkedinSeenAt })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "linkedin"), ne(promoAccounts.handle, ""), isNull(promoAccounts.retiredAt)))
  let queued = 0
  for (const account of accounts) {
    if (account.seenAt && now.getTime() - account.seenAt.getTime() < WEEK_MS) continue
    if (await askedLately(userId, "linkedin_seen", account.id, db, now)) continue
    const [any] = await db
      .select({ id: promoLinkedinComments.id })
      .from(promoLinkedinComments)
      .where(and(eq(promoLinkedinComments.accountId, account.id), eq(promoLinkedinComments.status, "posted"), ne(promoLinkedinComments.commentId, "")))
      .limit(1)
    if (!any) continue
    await queueJob(userId, "linkedin_seen", { accountId: account.id }, db)
    queued += 1
  }
  return queued
}

/** Asks for one account's look now, from Check now on the Accounts dashboard. */
export async function queueLinkedinSeenLook(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<string> {
  const [waiting] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "linkedin_seen"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
    .limit(1)
  if (waiting) return waiting.id
  return queueJob(userId, "linkedin_seen", { accountId }, db)
}

/**
 * The weekly look (part 46): the account's latest comments, each opened
 * under its post by a search account. None of them showing marks the
 * account "hidden" and rings the bell once; any one showing marks it "seen".
 * A look that could not tell for any of them changes nothing.
 */
export async function recordLinkedinSeen(
  userId: string,
  accountId: string,
  reader: LinkedinReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "linkedin")))
    .limit(1)
  if (!account?.handle) throw new Refusal("That LinkedIn account has no name yet, so its comments can't be looked for.")
  const latest = await db
    .select({ postId: promoLinkedinComments.targetId, commentId: promoLinkedinComments.commentId, text: promoLinkedinComments.text })
    .from(promoLinkedinComments)
    .where(
      and(
        eq(promoLinkedinComments.accountId, accountId),
        eq(promoLinkedinComments.status, "posted"),
        ne(promoLinkedinComments.commentId, ""),
        isNull(promoLinkedinComments.deletedAt)
      )
    )
    .orderBy(desc(promoLinkedinComments.postedAt))
    .limit(SEEN_COMMENTS)
  if (!latest.length) return
  const look = await linkedinSeen(reader.target, { slug: account.handle, comments: latest })
  await spendLinkedinViews(reader.searcher.id, look, db, now)
  const told = look.results.filter((result) => result.shown !== null)
  if (!told.length) return
  const seen = told.some((result) => result.shown) ? "seen" : "hidden"
  await db.update(promoAccounts).set({ linkedinSeen: seen, linkedinSeenAt: now }).where(eq(promoAccounts.id, account.id))
  if (seen !== "hidden" || account.linkedinSeen === "hidden") return
  const target = `${account.id}:${utcDay(now)}`
  if (await noticeRung("linkedin_hidden", target, db)) return
  await ringBell(
    userId,
    {
      kind: "linkedin_hidden",
      targetId: target,
      message: `${NOTICE_HEADINGS.linkedin_hidden} ${handleWords("linkedin", account.handle)}'s comments`,
      detail: `None of its ${told.length} latest comments showed to a stranger. Promo's best guess, because LinkedIn never says. Slow it down for a few days.`,
      href: "/admin/accounts?platform=linkedin",
    },
    db,
    now
  )
}

/**
 * Looks up people and pages the AI suggested (part 16), and writes which
 * exist onto the job itself, where the keyword ideas read them back.
 */
export async function recordLinkedinLookup(
  userId: string,
  jobId: string,
  input: { people: string[]; companies: string[] },
  reader: LinkedinReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (!input.people.length && !input.companies.length) return
  const read = await linkedinLookup(reader.target, { people: input.people.slice(0, 6), companies: input.companies.slice(0, 4) })
  await spendLinkedinViews(reader.searcher.id, read, db, now)
  const found = read.found.filter((item) => item.exists).map((item) => ({ kind: item.kind, slug: item.slug, name: item.name, headline: item.headline, followers: item.followers }))
  await db
    .update(promoJobs)
    .set({ payload: sql`${promoJobs.payload} || ${JSON.stringify({ found })}::jsonb` })
    .where(and(eq(promoJobs.id, jobId), eq(promoJobs.userId, userId)))
}
