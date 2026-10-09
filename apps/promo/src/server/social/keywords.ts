import { and, desc, eq, inArray, notExists, or, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { fitBand, rankReason, type FitBand } from "./reddit/rank"
import {
  type FindStatus,
} from "@/lib/social/options"
import {
  REDDIT_SORTS,
  REDDIT_WINDOWS,
  type RedditSort,
  type RedditWindow,
} from "@/lib/social/reddit/options"

import {
  promoBlockedSubreddits,
  promoDrafts,
  promoFinds,
  promoKeywords,
  promoSearches,
} from "./schema"

/**
 * Saved keywords and the posts they found, as the screen needs them.
 *
 * Everything here is a read or a small write a person made directly. The slow
 * browser work is not here: it goes on the queue in `jobs.ts`.
 */

/**
 * The rule a stored post must pass to be listed: not from a subreddit on the
 * blocked list (`reddit/blocked.ts`), or already commented on, which is a
 * record of something that happened and is never hidden. Every read of the
 * list and of its counts uses it, so the posts and the numbers beside them
 * always agree.
 */
export function shownFind(userId: string) {
  return or(
    eq(promoFinds.status, "commented"),
    notExists(
      sql`(SELECT 1 FROM ${promoBlockedSubreddits} WHERE ${promoBlockedSubreddits.userId} = ${userId} AND lower(${promoBlockedSubreddits.subreddit}) = lower(${promoFinds.subreddit}))`
    )
  )
}

/** A keyword can name this many subreddits before the list is unmanageable. */
const MAX_SUBREDDITS = 10

export type KeywordRow = {
  id: string
  term: string
  subreddits: string[]
  sort: RedditSort
  timeWindow: RedditWindow
  enabled: boolean
  lastRunAt: Date | null
  /**
   * Every post this keyword lists, however it has been dealt with. Posts from a
   * blocked subreddit are not counted, because they are not listed.
   */
  postCount: number
  /** How many posts are waiting to be looked at. */
  newCount: number
  /** What the last run did, so a failure is visible beside the keyword. */
  lastRun:
    | { status: "running" | "done" | "failed"; seen: number; new: number; error: string }
    | null
}

export type FindRow = {
  id: string
  keywordId: string
  permalink: string
  url: string
  subreddit: string
  title: string
  author: string
  score: number
  commentCount: number
  postedAt: Date | null
  /**
   * Which of the three bands the list groups under this falls in. The score
   * behind it is deliberately not sent: see `rankReason` below.
   */
  fit: FitBand
  /**
   * Plain words for why it is this high up, such as "Reddit's best match,
   * posted today, only 2 replies".
   *
   * The score itself is deliberately not sent. It only ever drove the ORDER BY
   * below, and a bare 2.0 on no scale told a reader nothing — which is what
   * Tyler said when he asked what the column meant on 5 Oct 2026.
   */
  rankReason: string
  status: FindStatus
  /** Whether the thread has been read, which is not the same as having no replies. */
  threadRead: boolean
}

export async function listKeywords(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<KeywordRow[]> {
  const keywords = await db
    .select()
    .from(promoKeywords)
    .where(eq(promoKeywords.userId, userId))
    .orderBy(desc(promoKeywords.createdAt))

  if (!keywords.length) return []

  const ids = keywords.map((keyword) => keyword.id)

  // How many posts are still waiting on each keyword, in one read rather than
  // one per row.
  const waiting = await db
    .select({ keywordId: promoFinds.keywordId, status: promoFinds.status })
    .from(promoFinds)
    .where(
      and(eq(promoFinds.userId, userId), inArray(promoFinds.keywordId, ids), shownFind(userId))
    )

  const newCounts = new Map<string, number>()
  const totals = new Map<string, number>()
  for (const row of waiting) {
    totals.set(row.keywordId, (totals.get(row.keywordId) ?? 0) + 1)
    if (row.status !== "new") continue
    newCounts.set(row.keywordId, (newCounts.get(row.keywordId) ?? 0) + 1)
  }

  const runs = await db
    .select()
    .from(promoSearches)
    .where(and(eq(promoSearches.userId, userId), inArray(promoSearches.keywordId, ids)))
    .orderBy(desc(promoSearches.startedAt))

  // The newest run per keyword. The list is already newest first, so the first
  // one seen for a keyword is its latest.
  const latest = new Map<string, (typeof runs)[number]>()
  for (const run of runs) {
    if (!latest.has(run.keywordId)) latest.set(run.keywordId, run)
  }

  return keywords.map((keyword) => {
    const run = latest.get(keyword.id)
    return {
      id: keyword.id,
      term: keyword.term,
      subreddits: keyword.subreddits,
      sort: keyword.sort,
      timeWindow: keyword.timeWindow,
      enabled: keyword.enabled,
      lastRunAt: keyword.lastRunAt,
      postCount: totals.get(keyword.id) ?? 0,
      newCount: newCounts.get(keyword.id) ?? 0,
      lastRun: run
        ? {
            status: run.status,
            seen: run.seenCount,
            new: run.newCount,
            error: run.lastError,
          }
        : null,
    }
  })
}

export type SaveKeywordInput = {
  term: string
  subreddits: string[]
  sort: RedditSort
  timeWindow: RedditWindow
}

/** Cleans a pasted subreddit name: people paste "r/x", "/r/x" and full URLs. */
export function cleanSubreddit(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?reddit\.com/i, "")
    .replace(/^\/+/, "")
    .replace(/^r\//i, "")
    .replace(/\/.*$/, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 60)
}

export function cleanSubreddits(raw: string[]): string[] {
  const seen = new Set<string>()
  for (const value of raw) {
    const name = cleanSubreddit(value)
    if (name) seen.add(name)
  }
  return [...seen].slice(0, MAX_SUBREDDITS)
}

export async function addKeyword(
  userId: string,
  input: SaveKeywordInput,
  db: CustomShellDb = defaultDb
): Promise<string> {
  const term = input.term.trim()
  if (!term) throw new Error("Type a keyword first.")
  if (term.length > 200) throw new Error("That keyword is too long.")
  if (!REDDIT_SORTS.includes(input.sort)) throw new Error("Unknown sort.")
  if (!REDDIT_WINDOWS.includes(input.timeWindow)) {
    throw new Error("Unknown time window.")
  }

  const id = uuid()
  try {
    await db.insert(promoKeywords).values({
      id,
      userId,
      term,
      subreddits: cleanSubreddits(input.subreddits),
      sort: input.sort,
      timeWindow: input.timeWindow,
    })
  } catch {
    // The only unique rule on this table is one keyword per person, so there
    // is one thing this can mean and it is worth saying rather than "failed".
    throw new Error(`"${term}" is already saved.`)
  }
  return id
}

/** Removes a keyword and every post found under it. */
export async function deleteKeyword(
  userId: string,
  keywordId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  await db
    .delete(promoKeywords)
    .where(and(eq(promoKeywords.id, keywordId), eq(promoKeywords.userId, userId)))
}

export type FindsQuery = {
  keywordId?: string
  /** "all" shows everything, including posts already dealt with. */
  status?: FindStatus | "all"
  /** "open" is everything not skipped and not commented: the work left. */
  limit?: number
}

/** The posts for the results panel, best to comment on first. */
export async function listFinds(
  userId: string,
  query: FindsQuery,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<FindRow[]> {
  const filters = [eq(promoFinds.userId, userId), shownFind(userId)]
  if (query.keywordId) filters.push(eq(promoFinds.keywordId, query.keywordId))
  if (query.status && query.status !== "all") {
    filters.push(eq(promoFinds.status, query.status))
  }

  const rows = await db
    .select()
    .from(promoFinds)
    .where(and(...filters))
    .orderBy(desc(promoFinds.rank), desc(promoFinds.postedAt))
    .limit(Math.min(Math.max(query.limit ?? 100, 1), 500))

  return rows.map((row) => ({
    id: row.id,
    keywordId: row.keywordId,
    permalink: row.permalink,
    url: `https://www.reddit.com${row.permalink}`,
    subreddit: row.subreddit,
    title: row.title,
    author: row.author,
    score: row.score,
    commentCount: row.commentCount,
    postedAt: row.postedAt,
    fit: fitBand(row.rank),
    rankReason: rankReason(
      {
        position: row.redditPosition,
        commentCount: row.commentCount,
        postedAt: row.postedAt,
      },
      now
    ),
    status: row.status,
    threadRead: Boolean(row.thread),
  }))
}

/** One post with everything the reading and writing panels need. */
export async function loadFindDetail(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb
) {
  const [find] = await db
    .select()
    .from(promoFinds)
    .where(and(eq(promoFinds.id, findId), eq(promoFinds.userId, userId)))
    .limit(1)
  if (!find) return null

  const drafts = await db
    .select()
    .from(promoDrafts)
    .where(and(eq(promoDrafts.userId, userId), eq(promoDrafts.findId, findId)))
    .orderBy(desc(promoDrafts.createdAt))

  return {
    id: find.id,
    permalink: find.permalink,
    url: `https://www.reddit.com${find.permalink}`,
    subreddit: find.subreddit,
    title: find.title,
    author: find.author,
    score: find.score,
    commentCount: find.commentCount,
    postedAt: find.postedAt,
    status: find.status,
    /** Null means the thread has not been read, not that there are no replies. */
    thread: find.thread,
    threadReadAt: find.threadReadAt,
    body: find.thread?.body || find.body,
    drafts: drafts.map((draft) => ({
      id: draft.id,
      text: draft.text,
      provider: draft.provider,
      model: draft.model,
      status: draft.status,
      createdAt: draft.createdAt,
    })),
  }
}
