import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { redditSearch, type CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { queueJob } from "../jobs"
import { cleanSubreddit } from "../keywords"
import { ownedProject } from "../projects"
import { promoFinds, promoJobs, promoKeywords } from "../schema"

import { blockedNames } from "./blocked"
import { rankFind } from "./rank"

/**
 * Each subreddit's own self-promotion thread.
 *
 * Plenty of subreddits ban self-promotion everywhere except one weekly or
 * monthly thread, often called something like "Share your startup". That
 * thread is the one place mentioning what you make is welcome instead of
 * bannable, so Promo looks for it in the subreddits a project's posts come
 * from, and lists when the last one went up and when the next is due.
 *
 * A thread is stored as a found post belonging to the project rather than to
 * a keyword, so it opens in the same comment box and goes through every rule
 * Post has. Reading happens in the reader browser, signed in to nobody.
 */

/** At most this many subreddits are looked through for one press. */
const MAX_SUBREDDITS = 8

/**
 * What Reddit is asked for: titles with the words these threads use. Every
 * subreddit names its thread differently, so some will be missed.
 */
const SEARCH_WORDS =
  'title:(promotion OR promote OR "self promo" OR "self-promo" OR "share your" OR showcase OR "show off" OR "weekly thread" OR "monthly thread" OR plug)'

/** A title that is one of these threads, rather than somebody's own post about promotion. */
const THREAD_TITLE =
  /(weekly|monthly|daily|megathread|mega thread|thread\b).*(promot|self[- ]?promo|share|showcase|show off|plug|feedback)|(promot|self[- ]?promo|share your|showcase|show off|plug).*(weekly|monthly|daily|megathread|thread\b)/i

export function isPromotionThread(title: string): boolean {
  return THREAD_TITLE.test(title)
}

/**
 * The subreddits a project's posts most often come from, most first, leaving
 * out blocked ones. These are where its people are, so where its threads are.
 */
async function projectSubreddits(userId: string, projectId: string, db: CustomShellDb): Promise<string[]> {
  const rows = await db
    .select({ name: promoFinds.subreddit, posts: sql<number>`count(*)::int` })
    .from(promoFinds)
    .innerJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .where(and(eq(promoFinds.userId, userId), eq(promoKeywords.projectId, projectId), ne(promoFinds.subreddit, "")))
    .groupBy(promoFinds.subreddit)
    .orderBy(sql`count(*) desc`)
    .limit(40)
  const blocked = await blockedNames(userId, db)
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    const name = cleanSubreddit(row.name)
    if (!name || blocked.has(name.toLowerCase()) || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name)
  }
  return out.slice(0, MAX_SUBREDDITS)
}

/**
 * Queues a look for each of the project's subreddits, one job each, skipping
 * one already on its way. Returns how many were queued.
 */
export async function queuePromoThreadReads(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<number> {
  await ownedProject(userId, projectId, db)
  const subreddits = await projectSubreddits(userId, projectId, db)
  if (!subreddits.length) {
    throw new Error("This project has found no posts yet, so there are no subreddits to look in. Run a keyword first.")
  }
  const pending = await db
    .select({ subreddit: sql<string>`lower(${promoJobs.payload}->>'subreddit')` })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "promo_threads"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'projectId' = ${projectId}`
      )
    )
  const waiting = new Set(pending.map((row) => row.subreddit))
  let queued = 0
  for (const subreddit of subreddits) {
    if (waiting.has(subreddit.toLowerCase())) continue
    await queueJob(userId, "promo_threads", { projectId, subreddit }, db)
    queued += 1
  }
  return queued
}

/** One look, for a `promo_threads` job: searches the subreddit and keeps the threads. */
export async function readPromoThreads(
  userId: string,
  payload: Record<string, unknown>,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  const projectId = String(payload.projectId ?? "")
  const subreddit = cleanSubreddit(String(payload.subreddit ?? ""))
  if (!projectId || !subreddit) throw new Error("That look for promotion threads names no project or subreddit.")
  await ownedProject(userId, projectId, db)

  const answer = await redditSearch(target, { query: SEARCH_WORDS, subreddit, sort: "new", window: "year" })
  const threads = answer.posts.filter(
    (post) => post.subreddit.toLowerCase() === subreddit.toLowerCase() && isPromotionThread(post.title)
  )
  for (const post of threads) {
    const postedAt = post.postedAtSeconds ? new Date(post.postedAtSeconds * 1000) : null
    await db
      .insert(promoFinds)
      .values({
        id: uuid(),
        userId,
        keywordId: null,
        threadProjectId: projectId,
        redditId: post.redditId,
        permalink: post.permalink,
        subreddit: post.subreddit,
        title: post.title,
        body: post.body,
        author: post.author,
        score: post.score,
        commentCount: post.commentCount,
        postedAt,
        redditPosition: post.position,
        rank: rankFind({ position: post.position, commentCount: post.commentCount, postedAt }, now),
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [promoFinds.threadProjectId, promoFinds.redditId],
        targetWhere: sql`${promoFinds.threadProjectId} IS NOT NULL`,
        set: {
          score: sql`excluded.score`,
          commentCount: sql`excluded.comment_count`,
          title: sql`excluded.title`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      })
  }
  return threads.length
}

export type PromoThreadRow = {
  subreddit: string
  /** The newest thread found, which is the one to answer. */
  newest: { findId: string; title: string; url: string; postedAt: Date | null; commentCount: number; commented: boolean }
  /** How many of its threads were found, which is how the gap is worked out. */
  found: number
  /** The typical number of days between its threads, or null with only one found. */
  everyDays: number | null
  /** When the next one is due, from the newest and the typical gap. Null when it cannot be told. */
  nextDue: Date | null
}

/** The project's subreddits with a promotion thread found, newest thread first. */
export async function listPromoThreads(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<{ threads: PromoThreadRow[]; looking: number }> {
  const rows = await db
    .select()
    .from(promoFinds)
    .where(
      and(eq(promoFinds.userId, userId), eq(promoFinds.threadProjectId, projectId), isNotNull(promoFinds.postedAt))
    )
    .orderBy(desc(promoFinds.postedAt))
  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "promo_threads"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'projectId' = ${projectId}`
      )
    )

  const bySubreddit = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = row.subreddit.toLowerCase()
    bySubreddit.set(key, [...(bySubreddit.get(key) ?? []), row])
  }
  const threads = [...bySubreddit.values()].map((list) => {
    const newest = list[0]
    const gaps = list
      .slice(0, -1)
      .map((row, index) => (row.postedAt!.getTime() - list[index + 1].postedAt!.getTime()) / 86_400_000)
      .filter((days) => days > 0.5)
      .sort((a, b) => a - b)
    const everyDays = gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null
    return {
      subreddit: newest.subreddit,
      newest: {
        findId: newest.id,
        title: newest.title,
        url: `https://www.reddit.com${newest.permalink}`,
        postedAt: newest.postedAt,
        commentCount: newest.commentCount,
        commented: newest.status === "commented",
      },
      found: list.length,
      everyDays,
      nextDue:
        everyDays && newest.postedAt ? new Date(newest.postedAt.getTime() + everyDays * 86_400_000) : null,
    }
  })
  threads.sort((a, b) => (b.newest.postedAt?.getTime() ?? 0) - (a.newest.postedAt?.getTime() ?? 0))
  return { threads, looking: pending?.count ?? 0 }
}
