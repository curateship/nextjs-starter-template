import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { phoneStepRefusal } from "@/lib/phones/options"
import { redditReply, redditThread, type CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { MAX_COMMENT_CHARS, NO_PROFILE_MESSAGE } from "@/lib/social/options"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { postingRefusalText } from "@/lib/social/wording"

import { refuseInteraction } from "../apart"
import { queueJob } from "../jobs"
import { ringBell } from "../notices"
import { refuseWhileCommentingPaused } from "../pause"
import { readPostingState } from "../posting"
import { promoAccounts, promoJobs, promoPostAnswers, promoPosts, type OwnPostComment } from "../schema"

/**
 * Your own Reddit posts read again, and the comments under them answered
 * (part 6 of `workspace/tasks/New features/new-features-18-nov.md`).
 *
 * - **Read on a press only.** Check queues one `post_check` job per post, in
 *   the reader browser signed in to nobody, the same rule a sent comment's
 *   check follows: there is no schedule (Tyler declined comments re-checked
 *   by themselves on 12 Oct 2026). It is the reader's existing `reddit/thread`
 *   read, so no new browser step is needed.
 * - **What is kept:** the upvotes, how many comments, and up to 20 comments
 *   directly under the post, each with its own address. Only Reddit's own
 *   data counts: when Reddit only shows the drawn page, nothing is written
 *   but why.
 * - **The bell** rings once per post for new comments a check finds, never on
 *   the post's first check, opening Posts beside your Reddit posts.
 * - **An answer** goes out from the account that posted, as a `post_answer`
 *   job, under every rule a comment follows: warm-up, a young account's pace,
 *   waking hours, a paused project or commenting, and the guard that keeps
 *   important and throwaway accounts apart. One answer per comment, tried
 *   once, never by itself.
 */

/** How many comments under a post a check keeps. */
const POST_COMMENTS_KEPT = 20
/** The most posts one press checks. */
const CHECK_MAX = 50
/** Only an address the browser read off Reddit is ever handed back to it. */
const REDDIT_ADDRESS = "https://www.reddit.com/r/"

type PostRow = typeof promoPosts.$inferSelect

/** The post, scoped by owner, or a refusal. */
async function ownPost(userId: string, postId: string, db: CustomShellDb): Promise<PostRow> {
  const [post] = await db
    .select()
    .from(promoPosts)
    .where(and(eq(promoPosts.id, postId), eq(promoPosts.userId, userId)))
    .limit(1)
  if (!post) throw new Refusal("That post is no longer saved.")
  return post
}

/** Posts with a check waiting or running, by post id. */
export async function postChecksOnTheirWay(userId: string, db: CustomShellDb = defaultDb): Promise<Set<string>> {
  const rows = await db
    .select({ postId: sql<string>`${promoJobs.payload}->>'postId'` })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "post_check"), inArray(promoJobs.status, ["queued", "running"])))
  return new Set(rows.map((row) => row.postId))
}

/**
 * Check on the Posts list: one `post_check` per post that landed, at most 50
 * a press. A post already being read, or with no Reddit address yet, is
 * skipped and counted as skipped.
 */
export async function queuePostChecks(
  userId: string,
  postIds: string[],
  db: CustomShellDb = defaultDb
): Promise<{ queued: number; skipped: number }> {
  const wanted = [...new Set(postIds)].slice(0, CHECK_MAX)
  if (!wanted.length) return { queued: 0, skipped: 0 }
  const posts = await db
    .select({ id: promoPosts.id, status: promoPosts.status, postUrl: promoPosts.postUrl })
    .from(promoPosts)
    .where(and(eq(promoPosts.userId, userId), inArray(promoPosts.id, wanted)))
  const waiting = await postChecksOnTheirWay(userId, db)
  let queued = 0
  for (const post of posts) {
    if (post.status !== "posted" || !post.postUrl.startsWith(REDDIT_ADDRESS) || waiting.has(post.id)) continue
    await queueJob(userId, "post_check", { postId: post.id }, db)
    queued += 1
  }
  return { queued, skipped: wanted.length - queued }
}

/** The post's own path on Reddit, which the thread read takes. */
function permalinkOf(postUrl: string): string {
  const path = new URL(postUrl).pathname
  return path.endsWith("/") ? path : `${path}/`
}

/** Reads one post as a stranger sees it, and rings the bell for comments new since the last check. */
export async function recordPostCheck(
  userId: string,
  postId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const post = await ownPost(userId, postId, db)
  if (post.status !== "posted" || !post.postUrl.startsWith(REDDIT_ADDRESS)) {
    throw new Refusal("That post never reached Reddit, so there is nothing to read.")
  }
  const answer = await redditThread(target, { permalink: permalinkOf(post.postUrl), replyLimit: POST_COMMENTS_KEPT })
  if (answer.source !== "json" || !answer.post) {
    await db
      .update(promoPosts)
      .set({ checkedAt: now, checkError: "Reddit only showed the page, not its own data, so the numbers were not read. Check again later." })
      .where(eq(promoPosts.id, post.id))
    return
  }

  const [account] = await db.select({ handle: promoAccounts.handle }).from(promoAccounts).where(eq(promoAccounts.id, post.accountId)).limit(1)
  const own = (account?.handle ?? "").toLowerCase()
  const comments: OwnPostComment[] = answer.replies
    .filter((reply) => reply.permalink.startsWith(REDDIT_ADDRESS))
    .map((reply) => ({ author: reply.author, text: reply.text.slice(0, 4_000), score: reply.score, url: reply.permalink }))

  await db
    .update(promoPosts)
    .set({
      upvotes: answer.post.score,
      commentCount: answer.post.commentCount,
      comments,
      checkedAt: now,
      checkError: "",
    })
    .where(eq(promoPosts.id, post.id))

  // A first check finds what was already there; only later ones say something is new.
  if (post.comments === null) return
  const known = new Set(post.comments.map((comment) => comment.url))
  const fresh = comments.filter((comment) => !known.has(comment.url) && comment.author.toLowerCase() !== own)
  if (!fresh.length) return
  const first = fresh[0]
  await ringBell(
    userId,
    {
      kind: "post_comment",
      targetId: post.id,
      message: `${NOTICE_HEADINGS.post_comment} ${post.title}`.slice(0, 300),
      detail:
        fresh.length === 1
          ? `u/${first.author || "someone"} wrote: ${first.text.slice(0, 200)}`
          : `${fresh.length} new comments, the first from u/${first.author || "someone"}: ${first.text.slice(0, 160)}`,
      // Reddit's posts on the project's page, where the post's row opens its comments.
      href: post.projectId ? `/admin/projects/${encodeURIComponent(post.projectId)}?network=reddit` : "/admin/projects",
    },
    db,
    now
  )
}

/** One comment under one of your posts, and the account that posted it, or a refusal saying why it can't be answered. */
async function answerable(
  userId: string,
  postId: string,
  commentUrl: string,
  db: CustomShellDb
): Promise<{ post: PostRow; comment: OwnPostComment; account: typeof promoAccounts.$inferSelect }> {
  const post = await ownPost(userId, postId, db)
  if (post.status !== "posted") throw new Refusal("That post never reached Reddit, so nothing under it can be answered.")
  const comment = (post.comments ?? []).find((item) => item.url === commentUrl)
  if (!comment) throw new Refusal("That comment is not among the comments last read. Check the post again first.")
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, post.accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Refusal("The account that posted this is not there any more.")
  if (comment.author.toLowerCase() === account.handle.toLowerCase()) {
    throw new Refusal("That comment is your own, so there is nothing to answer.")
  }
  const [already] = await db
    .select({ id: promoPostAnswers.id })
    .from(promoPostAnswers)
    .where(and(eq(promoPostAnswers.postId, post.id), eq(promoPostAnswers.commentUrl, commentUrl)))
    .limit(1)
  if (already) throw new Refusal("You have already answered that comment.")
  return { post, comment, account }
}

/**
 * Queues an answer a person pressed Answer for, or refuses it with why. It
 * waits for the account's morning outside its waking hours.
 */
export async function queuePostAnswer(
  userId: string,
  input: { postId: string; commentUrl: string; text: string; sentBy?: string | null },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ jobId: string; runAfter: Date | null }> {
  const text = input.text.trim()
  if (!text) throw new Refusal("Write the answer first.")
  if (text.length > MAX_COMMENT_CHARS) {
    throw new Refusal(`That answer is ${text.length} characters. Answers are capped at ${MAX_COMMENT_CHARS}.`)
  }
  const { post, comment, account } = await answerable(userId, input.postId, input.commentUrl, db)
  const [pending] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "post_answer"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'commentUrl' = ${comment.url}`
      )
    )
    .limit(1)
  if (pending) throw new Refusal("An answer to that comment is already on its way.")

  const handle = account.handle ? `u/${account.handle}` : "This account"
  if (account.retiredAt) {
    throw new Refusal(`${handle} posted this and is retired, so it no longer posts. Bring it back on the Accounts dashboard first.`)
  }
  if (!account.profileId && !account.phoneId) throw new Refusal(NO_PROFILE_MESSAGE)
  const onPhone = account.phoneId ? phoneStepRefusal("reddit/reply", account.handle ? `u/${account.handle}'s phone` : "This account's phone") : null
  if (onPhone) throw new Refusal(onPhone)
  await refuseWhileCommentingPaused(userId, account, db)
  const state = await readPostingState(userId, account, db, now)
  const refusal = postingRefusalText(state, now, state.timeZone)
  if (refusal) throw new Refusal(refusal)
  await refuseInteraction(userId, account, { replyAuthor: comment.author, words: [text] }, db)

  const runAfter = state.nextWakeAt
  const jobId = await queueJob(
    userId,
    "post_answer",
    {
      postId: post.id,
      commentUrl: comment.url,
      accountId: account.id,
      text,
      ...(input.sentBy ? { sentBy: input.sentBy } : {}),
    },
    db,
    runAfter
  )
  return { jobId, runAfter }
}

/** Sends one answer, from the post's own account, in its browser. Tried once. */
export async function sendPostAnswer(
  userId: string,
  accountId: string,
  payload: Record<string, unknown>,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const postId = typeof payload.postId === "string" ? payload.postId : ""
  const commentUrl = typeof payload.commentUrl === "string" ? payload.commentUrl : ""
  const text = typeof payload.text === "string" ? payload.text.trim() : ""
  if (!postId || !commentUrl || !text) throw new Error("That answer job is missing its post, the comment it answers, or its words.")
  // Read again here, because the press was checked when it was made, maybe hours ago.
  const { post, comment, account } = await answerable(userId, postId, commentUrl, db)
  if (account.id !== accountId) throw new Refusal("Only the account that posted can answer under its post.")
  const { replyUrl } = await redditReply(target, { replyUrl: comment.url, text })
  await db.insert(promoPostAnswers).values({
    id: uuid(),
    userId,
    postId: post.id,
    accountId: account.id,
    commentUrl: comment.url,
    text,
    answerUrl: replyUrl,
    sentBy: typeof payload.sentBy === "string" && payload.sentBy ? payload.sentBy : null,
  })
}

/** What each comment under these posts has: the answer that landed, or the one on its way. */
export type PostAnswerState =
  | { text: string; url: string; postedAt: Date }
  | { waiting: true; runAfter: Date | null; text: string }
  | { failed: true; reason: string; text: string }

/** Answers by comment address, for the posts listed. */
export async function postAnswers(
  userId: string,
  postIds: string[],
  db: CustomShellDb = defaultDb
): Promise<Map<string, PostAnswerState>> {
  const out = new Map<string, PostAnswerState>()
  if (!postIds.length) return out
  const sent = await db
    .select()
    .from(promoPostAnswers)
    .where(and(eq(promoPostAnswers.userId, userId), inArray(promoPostAnswers.postId, postIds)))
  for (const row of sent) out.set(row.commentUrl, { text: row.text, url: row.answerUrl, postedAt: row.postedAt })
  // Newest first, so a comment's latest attempt is the one that counts.
  const jobs = await db
    .select({ payload: promoJobs.payload, runAfter: promoJobs.runAfter, status: promoJobs.status, lastError: promoJobs.lastError })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "post_answer"),
        inArray(promoJobs.status, ["queued", "running", "failed"]),
        inArray(sql<string>`${promoJobs.payload}->>'postId'`, postIds)
      )
    )
    .orderBy(desc(promoJobs.createdAt))
  for (const job of jobs) {
    const url = typeof job.payload.commentUrl === "string" ? job.payload.commentUrl : ""
    if (!url || out.has(url)) continue
    const text = typeof job.payload.text === "string" ? job.payload.text : ""
    out.set(
      url,
      job.status === "failed"
        ? { failed: true, reason: job.lastError || "The browser did not say why.", text }
        : { waiting: true, runAfter: job.runAfter, text }
    )
  }
  return out
}
