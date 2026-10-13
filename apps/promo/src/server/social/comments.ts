import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { MAX_CHECKS_PER_PRESS } from "@/lib/social/options"

import { nextExampleIds } from "./examples"
import { queueJob } from "./jobs"
import { unansweredCounts } from "./replies"
import { promoComments, promoFinds, promoJobs } from "./schema"

/**
 * The comments the app has sent, and what became of each one.
 *
 * The app sends a comment and then used to forget it. This is the other half:
 * every sent comment with its upvotes, how many replies sit under it, and
 * whether it is still there, so the ranking and the drafts can be judged by
 * what actually happened. Reading a comment again needs the browser, so it is
 * a `comment_check` job, never a request that waits.
 */

export type CommentRow = {
  id: string
  /** Exactly what was sent. */
  text: string
  /** Where it landed on Reddit. */
  commentUrl: string
  postedAt: Date
  postTitle: string
  postUrl: string
  subreddit: string
  /** Null until read, and after a reading while Reddit hides the score. */
  upvotes: number | null
  /** Null until read. Never 0 as a stand-in. */
  replyCount: number | null
  /**
   * Replies directly under it that the app has not answered. Null until a
   * check has read the replies' words.
   */
  toAnswer: number | null
  /** Null until read: not read, still there, and gone are three answers. */
  stillVisible: boolean | null
  /** Whose view said whether it is there. Null until read. */
  checkedAs: "stranger" | "you" | null
  checkedAt: Date | null
  /** A check is waiting or running. */
  checking: boolean
  /** Why the newest check failed, when it did and nothing has read it since. */
  checkError: string | null
  /** True when it was sent with no draft behind it, so the words are the person's. */
  handWritten: boolean
  /** True when a person marked it as not a good example of how they write. */
  notExample: boolean
  /** True when the next draft will carry it as an example. */
  inNextDraft: boolean
}

/** Every comment that landed, newest first, with its last reading. */
export async function listSentComments(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<CommentRow[]> {
  const rows = await db
    .select({
      id: promoComments.id,
      text: promoComments.text,
      commentUrl: promoComments.commentUrl,
      postedAt: promoComments.postedAt,
      draftId: promoComments.draftId,
      notExample: promoComments.notExample,
      upvotes: promoComments.upvotes,
      replyCount: promoComments.replyCount,
      stillVisible: promoComments.stillVisible,
      checkedAs: promoComments.checkedAs,
      checkedAt: promoComments.checkedAt,
      incomingReplies: promoComments.incomingReplies,
      postTitle: promoFinds.title,
      permalink: promoFinds.permalink,
      subreddit: promoFinds.subreddit,
    })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    // An answer to a reply is shown under the reply it answers, in its
    // comment's Replies window, not as a row of its own.
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.status, "posted"),
        isNull(promoComments.parentId)
      )
    )
    .orderBy(desc(promoComments.postedAt))

  const [examples, checks, unanswered] = await Promise.all([
    nextExampleIds(userId, db),
    latestChecks(userId, db),
    unansweredCounts(userId, rows, db),
  ])

  return rows.map((row) => {
    const check = checks.get(row.id)
    const checking = check?.status === "queued" || check?.status === "running"
    // A failure older than the last good reading is history, not news.
    const failedSinceReading =
      check?.status === "failed" &&
      Boolean(check.lastError) &&
      (!row.checkedAt || (check.finishedAt !== null && check.finishedAt > row.checkedAt))
    return {
      id: row.id,
      text: row.text,
      commentUrl: row.commentUrl,
      postedAt: row.postedAt,
      postTitle: row.postTitle,
      postUrl: `https://www.reddit.com${row.permalink}`,
      subreddit: row.subreddit,
      upvotes: row.upvotes,
      replyCount: row.replyCount,
      toAnswer: unanswered.get(row.id) ?? null,
      stillVisible: row.stillVisible,
      checkedAs: row.checkedAs,
      checkedAt: row.checkedAt,
      checking,
      checkError: failedSinceReading ? check.lastError : null,
      handWritten: row.draftId === null,
      notExample: row.notExample,
      inNextDraft: examples.has(row.id),
    }
  })
}

/** The newest check job for each comment that has one. */
async function latestChecks(
  userId: string,
  db: CustomShellDb
): Promise<
  Map<string, { status: string; lastError: string; finishedAt: Date | null }>
> {
  // One row per comment, its newest, rather than every check ever run: the
  // screen asks every two seconds while a check is going.
  const commentId = sql<string>`${promoJobs.payload}->>'commentId'`
  const rows = await db
    .selectDistinctOn([commentId], {
      commentId,
      status: promoJobs.status,
      lastError: promoJobs.lastError,
      finishedAt: promoJobs.finishedAt,
    })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "comment_check")))
    .orderBy(commentId, desc(promoJobs.createdAt))

  return new Map(rows.filter((row) => row.commentId).map((row) => [row.commentId, row]))
}

/**
 * Queues a fresh reading of each of these comments, as one request. A comment
 * that is not this person's, never landed, or is already being read is left
 * out and reported as skipped.
 */
export async function queueCommentChecks(
  userId: string,
  commentIds: string[],
  db: CustomShellDb = defaultDb
): Promise<{ completed: string[]; skipped: string[] }> {
  const wanted = [...new Set(commentIds)].slice(0, MAX_CHECKS_PER_PRESS)
  if (!wanted.length) return { completed: [], skipped: commentIds }

  const [rows, checks] = await Promise.all([
    db
      .select({
        id: promoComments.id,
        accountId: promoComments.accountId,
        commentUrl: promoComments.commentUrl,
      })
      .from(promoComments)
      .where(
        and(
          eq(promoComments.userId, userId),
          inArray(promoComments.id, wanted),
          eq(promoComments.status, "posted")
        )
      ),
    latestChecks(userId, db),
  ])

  const completed: string[] = []
  for (const row of rows) {
    if (!row.commentUrl) continue
    const check = checks.get(row.id)
    if (check?.status === "queued" || check?.status === "running") continue
    // Read in the reader browser, signed in to nobody, which is how a
    // stranger sees it. The account it came from stays in the payload.
    await queueJob(userId, "comment_check", { commentId: row.id, accountId: row.accountId }, db)
    completed.push(row.id)
  }
  return { completed, skipped: commentIds.filter((id) => !completed.includes(id)) }
}
