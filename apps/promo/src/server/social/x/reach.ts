import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { handleWords } from "@/lib/social/networks"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { X_REACH_WORDS, type XReach } from "@/lib/social/x/options"

import { queueJob } from "../jobs"
import { noticeRung, ringBell } from "../notices"
import { promoAccounts, promoJobs } from "../schema"
import { xLookup, xReach } from "./calls"
import { promoXPosts, promoXReadings, promoXReplies } from "./schema"
import type { XReader } from "./search"
import { spendViews, utcDay } from "./searchers"

/**
 * Each X account's daily look from outside (parts 42 and 43), through a
 * search account, so it is how a stranger sees it:
 *
 * - **Followers and views.** Its followers off its page, and the views on
 *   its replies and posts as their last checks read them, kept one row a day
 *   and drawn week by week. When X says it joined is written too, for an
 *   account on a phone, whose app does not show it.
 * - **Whether X hides it.** Its latest reply looked for in X's search and
 *   under its post. Not found in search is "Hidden from search"; folded
 *   behind "Show more replies" is "Replies folded". X never says so, so the
 *   words call it Promo's best guess, and the bell rings when the look first
 *   finds it hidden.
 */

const DAY_MS = 86_400_000

/** Fewer words of its own than this, and a reply can't be searched for by them. */
const SEARCHABLE_WORDS = 4

/** Queues today's look for every signed-in X account that has none today. */
export async function queueXReachLooks(userId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const accounts = await db
    .select({ id: promoAccounts.id, readAt: promoAccounts.xReachAt })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "x"), ne(promoAccounts.handle, ""), isNull(promoAccounts.retiredAt)))
  // Any look asked for in the last day counts, finished, failed or waiting,
  // so a look that keeps failing is not asked for again every ten minutes.
  const waiting = await db
    .select({ payload: promoJobs.payload })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "x_reach"),
        or(inArray(promoJobs.status, ["queued", "running"]), gte(promoJobs.createdAt, new Date(now.getTime() - DAY_MS)))
      )
    )
  const already = new Set(waiting.map((job) => String(job.payload?.accountId ?? "")))
  let queued = 0
  for (const account of accounts) {
    if (already.has(account.id)) continue
    if (account.readAt && now.getTime() - account.readAt.getTime() < DAY_MS) continue
    await queueJob(userId, "x_reach", { accountId: account.id }, db)
    queued += 1
  }
  return queued
}

/** Asks for one account's look now, from Check now on the Accounts dashboard. */
export async function queueXReachLook(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<string> {
  const [waiting] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "x_reach"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
    .limit(1)
  if (waiting) return waiting.id
  return queueJob(userId, "x_reach", { accountId }, db)
}

/** The views on an account's replies and posts as their last checks read them, or null before any. */
async function viewsNow(accountId: string, db: CustomShellDb): Promise<number | null> {
  const [replies] = await db
    .select({ n: sql<number | null>`sum(${promoXReplies.views})::int`, read: sql<number>`count(${promoXReplies.views})::int` })
    .from(promoXReplies)
    .where(and(eq(promoXReplies.accountId, accountId), eq(promoXReplies.status, "posted"), isNull(promoXReplies.deletedAt)))
  const [posts] = await db
    .select({ n: sql<number | null>`sum(${promoXPosts.views})::int`, read: sql<number>`count(${promoXPosts.views})::int` })
    .from(promoXPosts)
    .where(and(eq(promoXPosts.accountId, accountId), eq(promoXPosts.status, "posted"), isNull(promoXPosts.deletedAt)))
  if (!replies?.read && !posts?.read) return null
  return (replies?.n ?? 0) + (posts?.n ?? 0)
}

/** Takes one account's daily look and writes what it found. */
export async function recordXReach(
  userId: string,
  accountId: string,
  reader: XReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "x")))
    .limit(1)
  if (!account?.handle) throw new Refusal("That X account has no name yet, so it can't be looked at.")

  const lookup = await xLookup(reader.target, { handles: [account.handle] })
  await spendViews(reader.searcher.id, lookup, db, now)
  const found = lookup.accounts.find((item) => item.handle.toLowerCase() === account.handle.toLowerCase())
  const followers = found?.exists ? found.followers : null

  // The latest reply with words enough to search X for; "Agreed!" can't be found by its words.
  const recent = await db
    .select({ postId: promoXReplies.postId, text: promoXReplies.text, targetId: promoXReplies.targetId })
    .from(promoXReplies)
    .where(
      and(
        eq(promoXReplies.accountId, accountId),
        eq(promoXReplies.status, "posted"),
        ne(promoXReplies.postId, ""),
        isNull(promoXReplies.deletedAt),
        gte(promoXReplies.postedAt, new Date(now.getTime() - 14 * DAY_MS))
      )
    )
    .orderBy(desc(promoXReplies.postedAt))
    .limit(20)
  const latest = recent.find((row) => (row.text.match(/[\p{L}\p{N}]{3,}/gu) ?? []).length >= SEARCHABLE_WORDS)
  let reach: XReach | "" = account.xReach
  if (latest) {
    const look = await xReach(reader.target, { handle: account.handle, postId: latest.postId, text: latest.text, parentId: latest.targetId })
    await spendViews(reader.searcher.id, look, db, now)
    reach = !look.inSearch ? "hidden" : look.underPost === "shown" ? "seen" : "folded"
  }

  await db
    .update(promoAccounts)
    .set({
      xReach: reach,
      xReachAt: now,
      ...(followers !== null ? { followers } : {}),
      ...(found?.exists && found.joinedSeconds && !account.xJoinedAt ? { xJoinedAt: new Date(found.joinedSeconds * 1000) } : {}),
    })
    .where(eq(promoAccounts.id, account.id))
  const views = await viewsNow(account.id, db)
  await db
    .insert(promoXReadings)
    .values({ accountId: account.id, readOn: utcDay(now), followers, views })
    .onConflictDoUpdate({ target: [promoXReadings.accountId, promoXReadings.readOn], set: { followers, views } })

  // Rung once each time the look turns from seen to hidden or folded.
  if ((reach === "hidden" || reach === "folded") && account.xReach !== reach) {
    const target = `${account.id}:${utcDay(now)}`
    if (!(await noticeRung("x_hidden", target, db))) {
      await ringBell(
        userId,
        {
          kind: "x_hidden",
          targetId: target,
          message: `${NOTICE_HEADINGS.x_hidden} ${handleWords("x", account.handle)}`,
          detail: `${X_REACH_WORDS[reach]}: its latest reply ${reach === "hidden" ? "did not show in X's search" : "was folded behind \"Show more replies\""} for a stranger. Promo's best guess, because X never says. Slow it down for a few days.`,
          href: `/admin/accounts?platform=x`,
        },
        db,
        now
      )
    }
  }
}

export type XReadingView = { readOn: string; followers: number | null; views: number | null }

/** An account's readings, oldest first, for its chart (part 43). */
export async function listXReadings(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<XReadingView[]> {
  const [account] = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Error("That account does not exist.")
  return db
    .select({ readOn: promoXReadings.readOn, followers: promoXReadings.followers, views: promoXReadings.views })
    .from(promoXReadings)
    .where(eq(promoXReadings.accountId, accountId))
    .orderBy(asc(promoXReadings.readOn))
    .limit(400)
}

/**
 * Looks up accounts the AI suggested (part 14), and writes which exist onto
 * the job itself, where the keyword ideas read them back.
 */
export async function recordXLookup(
  userId: string,
  jobId: string,
  handles: string[],
  reader: XReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (!handles.length) return
  const read = await xLookup(reader.target, { handles: handles.slice(0, 8) })
  await spendViews(reader.searcher.id, read, db, now)
  const found = read.accounts
    .filter((item) => item.exists)
    .map((item) => ({ handle: item.handle, name: item.name, followers: item.followers }))
  await db
    .update(promoJobs)
    .set({ payload: sql`${promoJobs.payload} || ${JSON.stringify({ found })}::jsonb` })
    .where(and(eq(promoJobs.id, jobId), eq(promoJobs.userId, userId)))
}
