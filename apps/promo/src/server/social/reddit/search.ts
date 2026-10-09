import { and, eq, inArray, ne, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  redditSearch,
  redditThread,
  type BrowserPost,
  type CommandTarget,
} from "@/server/browser/command"

import { blockedNames } from "./blocked"
import { rankFind } from "./rank"
import type { FindThread } from "@/lib/social/options"

import { promoFinds, promoKeywords, promoSearches } from "../schema"

/**
 * Running a saved keyword and writing down what came back.
 *
 * The one rule that shapes this file: **a re-run never undoes a decision.** A
 * post already marked skipped or commented keeps that status; only its figures
 * and its rank are brought up to date. Otherwise running a keyword twice would
 * hand back the fifty posts already dealt with, and the screen would be
 * useless by the second day.
 */

/** How long a post's thread is trusted before it is read again. */
const THREAD_FRESH_MINUTES = 30

export type SearchOutcome = {
  searchId: string
  /** How many posts Reddit returned, less any from a blocked subreddit. */
  seen: number
  /** How many of those had not been seen before. */
  new: number
  /** "json" when Reddit's own data answered, "page" when it had to be scraped. */
  source: "json" | "page"
}

/**
 * Runs one keyword through a live browser and stores the posts.
 *
 * The caller owns the browser session, because starting one costs a minute and
 * several keywords in a row should share it.
 */
export async function runKeywordSearch(
  userId: string,
  keywordId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<SearchOutcome> {
  // Scoped by owner for the same reason as `loadFindThread` below: the id came
  // off a job payload that a browser filled in.
  const [keyword] = await db
    .select()
    .from(promoKeywords)
    .where(and(eq(promoKeywords.id, keywordId), eq(promoKeywords.userId, userId)))
    .limit(1)
  if (!keyword) throw new Error("That keyword is no longer saved.")

  const searchId = uuid()
  await db.insert(promoSearches).values({
    id: searchId,
    userId: keyword.userId,
    keywordId: keyword.id,
    status: "running",
    startedAt: now,
  })

  try {
    // A blocked subreddit is dropped here, before anything is written, so it
    // never makes a post to hide. The list is read per run, so a block made
    // while a keyword waited in the queue still counts.
    const blocked = await blockedNames(keyword.userId, db)

    // No subreddits means all of Reddit, in one request. A list means one
    // request each, because Reddit has no "search these three" address. A
    // listed subreddit that is now blocked is not searched at all, and a list
    // that is all blocked searches nothing rather than falling back to all of
    // Reddit.
    const targets = keyword.subreddits.length
      ? keyword.subreddits.filter((name) => !blocked.has(name.toLowerCase()))
      : [""]
    const posts: BrowserPost[] = []
    let source: "json" | "page" = "json"

    for (const subreddit of targets) {
      const answer = await redditSearch(target, {
        query: keyword.term,
        subreddit: subreddit || undefined,
        sort: keyword.sort,
        window: keyword.timeWindow,
      })
      // One scraped answer in the batch makes the whole run scraped, because
      // that is the weaker evidence and the run should say so.
      if (answer.source === "page") source = "page"
      posts.push(
        ...answer.posts.filter((post) => !blocked.has(post.subreddit.toLowerCase()))
      )
    }

    const stored = await storeFinds(keyword, searchId, posts, db, now)

    await db
      .update(promoSearches)
      .set({
        status: "done",
        seenCount: stored.seen,
        newCount: stored.new,
        finishedAt: new Date(),
      })
      .where(eq(promoSearches.id, searchId))

    await db
      .update(promoKeywords)
      .set({ lastRunAt: new Date() })
      .where(eq(promoKeywords.id, keyword.id))

    return { searchId, seen: stored.seen, new: stored.new, source }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoSearches)
      .set({ status: "failed", lastError: message, finishedAt: new Date() })
      .where(eq(promoSearches.id, searchId))
    throw error
  }
}

/**
 * Writes the posts, adding the new ones and refreshing the old ones.
 *
 * `onConflictDoUpdate` on (keyword, post) is what makes a re-run safe: the
 * figures and the rank move, and `status`, `thread` and `firstSearchId` are
 * deliberately absent from the update so a decision already made survives.
 */
async function storeFinds(
  keyword: typeof promoKeywords.$inferSelect,
  searchId: string,
  posts: BrowserPost[],
  db: CustomShellDb,
  now: Date
): Promise<{ seen: number; new: number }> {
  if (!posts.length) return { seen: 0, new: 0 }

  // Reddit can return the same post twice across two subreddit searches, and
  // one statement cannot update the same row twice. Last one wins.
  const unique = new Map<string, BrowserPost>()
  for (const post of posts) unique.set(post.redditId, post)

  const rows = [...unique.values()].map((post) => {
    const postedAt = post.postedAtSeconds
      ? new Date(post.postedAtSeconds * 1000)
      : null
    return {
      id: uuid(),
      userId: keyword.userId,
      keywordId: keyword.id,
      firstSearchId: searchId,
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
      rank: rankFind(
        { position: post.position, commentCount: post.commentCount, postedAt },
        now
      ),
      firstSeenAt: now,
      lastSeenAt: now,
    }
  })

  const written = await db
    .insert(promoFinds)
    .values(rows)
    .onConflictDoUpdate({
      target: [promoFinds.keywordId, promoFinds.redditId],
      set: {
        // The figures move, because a post gains votes and replies.
        score: sql`excluded.score`,
        commentCount: sql`excluded.comment_count`,
        redditPosition: sql`excluded.reddit_position`,
        rank: sql`excluded.rank`,
        title: sql`excluded.title`,
        body: sql`excluded.body`,
        lastSeenAt: sql`excluded.last_seen_at`,
      },
    })
    .returning({ id: promoFinds.id, firstSeenAt: promoFinds.firstSeenAt })

  // A row whose firstSeenAt is this run's clock is one this run created. An
  // older one was already here and was only refreshed.
  const fresh = written.filter(
    (row) => row.firstSeenAt.getTime() === now.getTime()
  ).length

  return { seen: rows.length, new: fresh }
}

/**
 * The post and its replies, read through the browser unless a recent read is
 * already stored.
 *
 * The replies are the reason this exists. A draft written without them repeats
 * whatever the top comment already said, which is worse than no draft.
 */
export async function loadFindThread(
  userId: string,
  findId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<FindThread> {
  // Scoped by owner, not just by id. The id arrives in a job's payload, which
  // came from a browser, so a foreign id has to match nothing rather than hand
  // back somebody else's post.
  const [find] = await db
    .select()
    .from(promoFinds)
    .where(and(eq(promoFinds.id, findId), eq(promoFinds.userId, userId)))
    .limit(1)
  if (!find) throw new Error("That post is no longer saved.")

  const fresh =
    find.thread &&
    find.threadReadAt &&
    now.getTime() - find.threadReadAt.getTime() < THREAD_FRESH_MINUTES * 60_000
  if (fresh && find.thread) return find.thread

  const answer = await redditThread(target, { permalink: find.permalink })
  const thread: FindThread = {
    body: answer.post?.body || find.body,
    replies: answer.replies,
  }

  await db
    .update(promoFinds)
    .set({
      thread,
      threadReadAt: now,
      // Reading the thread is also the freshest figures there are, so the rank
      // is brought up to date at the same time rather than drifting.
      ...(answer.post
        ? {
            score: answer.post.score,
            commentCount: answer.post.commentCount,
            body: answer.post.body || find.body,
            // Reading the thread is the freshest reply count there is, and
            // the reply count is half the ranking, so it is brought up to date
            // here rather than waiting for the next search.
            rank: rankFind(
              {
                position: find.redditPosition,
                commentCount: answer.post.commentCount,
                postedAt: find.postedAt,
              },
              now
            ),
          }
        : {}),
    })
    .where(and(eq(promoFinds.id, findId), eq(promoFinds.userId, userId)))

  return thread
}

/** Moves a post's triage status. The one thing a re-run must never do. */
export async function setFindStatus(
  userId: string,
  findIds: string[],
  status: "new" | "shortlisted" | "skipped",
  db: CustomShellDb = defaultDb
): Promise<{ completed: string[]; skipped: string[] }> {
  if (!findIds.length) return { completed: [], skipped: [] }

  // A post already commented on is left alone: moving it back to "new" would
  // offer it up to be commented on twice.
  const moved = await db
    .update(promoFinds)
    .set({ status })
    .where(
      and(
        eq(promoFinds.userId, userId),
        // `inArray` rather than a built-up SQL string: the ids arrive from a
        // browser, and a hand-written ARRAY[...] is an injection waiting for
        // the one id that contains a quote.
        inArray(promoFinds.id, findIds),
        // A post already commented on is left alone. Moving it back to "new"
        // would offer it up to be commented on a second time.
        ne(promoFinds.status, "commented")
      )
    )
    .returning({ id: promoFinds.id })

  const completed = moved.map((row) => row.id)
  return {
    completed,
    skipped: findIds.filter((id) => !completed.includes(id)),
  }
}
