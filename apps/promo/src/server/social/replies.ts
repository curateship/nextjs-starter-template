import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { phoneStepRefusal } from "@/lib/phones/options"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  MAX_COMMENT_CHARS,
  NO_PROFILE_MESSAGE,
  type IncomingReply,
} from "@/lib/social/options"
import { postingRefusalText } from "@/lib/social/wording"

import { refuseInteraction } from "./apart"
import { queueJob } from "./jobs"
import { readPostingState } from "./posting"
import {
  promoAccounts,
  promoComments,
  promoDrafts,
  promoFinds,
  promoJobs,
} from "./schema"

/**
 * Answering the people who reply to a comment the app sent.
 *
 * A comment's check reads the replies directly under it (`comment-check.ts`).
 * Each one can be answered from the Comments screen: draft with AI, read it,
 * press Reply. The answer goes out from the account that sent the comment, as
 * a `reply` job, under the same rules as any comment: the warm-up, a young
 * account's pace, and its waking hours. It is stored in `promo_comments` with
 * `parent_id` naming the comment it sits under and `reply_to` the reply it
 * answers.
 *
 * Nothing is automatic. There is no watching for replies, no answering on its
 * own, and no retry: a failed answer stays failed and says why.
 *
 * One level only. A reply to an answer the app sent is not offered, and a
 * stranger's comment on a post the app never commented on is not either.
 */

type CommentRowDb = typeof promoComments.$inferSelect

/**
 * The app's own sent comment and one reply under it, as the last check read
 * it, or a refusal that says why it cannot be answered. Scoped by owner,
 * because both ids arrive from a browser.
 */
export async function answerableReply(
  userId: string,
  commentId: string,
  replyId: string,
  db: CustomShellDb = defaultDb
): Promise<{ comment: CommentRowDb; reply: IncomingReply }> {
  const [comment] = await db
    .select()
    .from(promoComments)
    .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
    .limit(1)
  if (!comment) throw new Refusal("That comment is no longer saved.")
  if (comment.status !== "posted" || comment.parentId) {
    throw new Refusal("Only a reply under a comment the app sent to a post can be answered.")
  }
  const reply = (comment.incomingReplies ?? []).find((item) => item.id === replyId)
  if (!reply) {
    throw new Refusal("That reply is not among the replies last read. Read the comment again first.")
  }
  // Only an address the browser read off Reddit is ever handed back to it.
  if (!reply.url.startsWith("https://www.reddit.com/r/")) {
    throw new Refusal("That reply has no Reddit address, so it cannot be answered.")
  }
  return { comment, reply }
}

/** The app's posted answers under one comment, by the id of the reply each answers, newest kept. */
async function answersByReply(
  userId: string,
  commentId: string,
  db: CustomShellDb
): Promise<Map<string, CommentRowDb>> {
  const rows = await db
    .select()
    .from(promoComments)
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.parentId, commentId),
        eq(promoComments.status, "posted")
      )
    )
    .orderBy(desc(promoComments.postedAt))
  const out = new Map<string, CommentRowDb>()
  for (const row of rows) {
    const id = row.replyTo?.id
    if (id && !out.has(id)) out.set(id, row)
  }
  return out
}

type ReplyJob = {
  replyId: string
  status: string
  runAfter: Date | null
  lastError: string
  text: string
  finishedAt: Date | null
}

/** The newest `reply` job for each reply under one comment. */
async function latestReplyJobs(
  userId: string,
  commentId: string,
  db: CustomShellDb
): Promise<Map<string, ReplyJob>> {
  const replyId = sql<string>`${promoJobs.payload}->>'replyId'`
  const rows = await db
    .selectDistinctOn([replyId], {
      replyId,
      status: promoJobs.status,
      runAfter: promoJobs.runAfter,
      lastError: promoJobs.lastError,
      text: sql<string>`coalesce(${promoJobs.payload}->>'text', '')`,
      finishedAt: promoJobs.finishedAt,
    })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "reply"),
        sql`${promoJobs.payload}->>'commentId' = ${commentId}`
      )
    )
    .orderBy(replyId, desc(promoJobs.createdAt))
  return new Map(rows.filter((row) => row.replyId).map((row) => [row.replyId, row]))
}

/**
 * Queues an answer a person pressed Reply for, or refuses it with why.
 *
 * Refused: a reply already answered, an answer to it already on its way, an
 * account that is retired or has no browser profile, and every refusal Post
 * gives (still warming up, a young account at its pace limit). Outside the
 * account's waking hours it waits for its morning, and the answer says when.
 */
export async function queueReply(
  userId: string,
  input: { commentId: string; replyId: string; text: string; draftId: string | null; sentBy?: string | null },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ jobId: string; runAfter: Date | null; handle: string }> {
  const text = input.text.trim()
  if (!text) throw new Error("There is nothing to post.")
  if (text.length > MAX_COMMENT_CHARS) {
    throw new Error(`That reply is ${text.length} characters. Replies are capped at ${MAX_COMMENT_CHARS}.`)
  }

  const { comment, reply } = await answerableReply(userId, input.commentId, input.replyId, db)

  if ((await answersByReply(userId, comment.id, db)).has(reply.id)) {
    throw new Refusal("You have already answered that reply.")
  }
  const pending = (await latestReplyJobs(userId, comment.id, db)).get(reply.id)
  if (pending && (pending.status === "queued" || pending.status === "running")) {
    throw new Refusal("An answer to that reply is already on its way. Cancel it first to send a different one.")
  }

  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, comment.accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Refusal("The account that sent this comment is not there any more.")
  const handle = account.handle ? `u/${account.handle}` : "This account"
  if (account.retiredAt) {
    throw new Refusal(
      `${handle} sent this comment and is retired, so it no longer posts. Bring it back on the Accounts dashboard first.`
    )
  }
  if (!account.profileId && !account.phoneId) throw new Refusal(NO_PROFILE_MESSAGE)
  const onPhone = account.phoneId ? phoneStepRefusal("reddit/reply", account.handle ? `u/${account.handle}'s phone` : "This account's phone") : null
  if (onPhone) throw new Refusal(onPhone)

  const state = await readPostingState(userId, account, db, now)
  const refusal = postingRefusalText(state, now, state.timeZone)
  if (refusal) throw new Refusal(refusal)
  await refuseInteraction(userId, account, { replyAuthor: reply.author, words: [text] }, db)

  const runAfter = state.nextWakeAt
  const jobId = await queueJob(
    userId,
    "reply",
    {
      commentId: comment.id,
      replyId: reply.id,
      accountId: account.id,
      text,
      draftId: input.draftId,
      // Only a guest's answer carries who sent it; the owner's payload is as it always was.
      ...(input.sentBy ? { sentBy: input.sentBy } : {}),
    },
    db,
    runAfter
  )
  return { jobId, runAfter, handle: account.handle }
}

/**
 * Cancels an answer still waiting for the account's waking hours. One that
 * has started cannot be cancelled: it may already be on Reddit.
 */
export async function cancelWaitingReply(
  userId: string,
  commentId: string,
  replyId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const removed = await db
    .delete(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "reply"),
        eq(promoJobs.status, "queued"),
        sql`${promoJobs.payload}->>'commentId' = ${commentId}`,
        sql`${promoJobs.payload}->>'replyId' = ${replyId}`
      )
    )
    .returning({ id: promoJobs.id })
  if (!removed.length) {
    throw new Error("That reply is no longer waiting. It may have started going to Reddit.")
  }
}

export type ReplyDraftView = { id: string; text: string }

/** One reply under a sent comment, and where answering it has got to. */
export type ReplyView = IncomingReply & {
  /** True when it was answered but is no longer among the replies read. */
  gone: boolean
  /** The answer that landed, newest first when there are several. */
  answer: { text: string; url: string; postedAt: Date } | null
  /** An answer waiting for the account's morning, or on its way now. */
  pending: { runAfter: Date | null; running: boolean } | null
  /** The newest attempt failed, with the words that were tried and why. */
  failed: { text: string; error: string } | null
  /** The newest two drafts for it. */
  drafts: ReplyDraftView[]
}

export type CommentReplies = {
  commentId: string
  /** Exactly what the app sent. */
  text: string
  commentUrl: string
  postTitle: string
  subreddit: string
  /** The handle of the account that sent it, which answers too. */
  handle: string
  checkedAt: Date | null
  /** Null until a check has read the replies' words. */
  replies: ReplyView[] | null
}

/** A sent comment and the replies directly under it, for the Replies window. */
export async function loadCommentReplies(
  userId: string,
  commentId: string,
  db: CustomShellDb = defaultDb
): Promise<CommentReplies> {
  const [row] = await db
    .select({
      comment: promoComments,
      postTitle: promoFinds.title,
      subreddit: promoFinds.subreddit,
      handle: promoAccounts.handle,
    })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
    .where(
      and(
        eq(promoComments.id, commentId),
        eq(promoComments.userId, userId),
        eq(promoComments.status, "posted"),
        isNull(promoComments.parentId)
      )
    )
    .limit(1)
  if (!row) throw new Error("That comment is no longer saved.")
  const { comment } = row

  const [answers, jobs] = await Promise.all([
    answersByReply(userId, commentId, db),
    latestReplyJobs(userId, commentId, db),
  ])

  const read = comment.incomingReplies
  // An answered reply that has since been deleted stays listed, from what it
  // said when it was answered, so the answer is never left without context.
  const listed: Array<IncomingReply & { gone: boolean }> = [
    ...(read ?? []).map((reply) => ({ ...reply, gone: false })),
    ...[...answers.values()]
      .filter((answer) => answer.replyTo && !(read ?? []).some((reply) => reply.id === answer.replyTo?.id))
      .map((answer) => ({ ...(answer.replyTo as IncomingReply), gone: true })),
  ]

  const ids = listed.map((reply) => reply.id)
  const drafts = ids.length
    ? await db
        .select({ id: promoDrafts.id, text: promoDrafts.text, replyToId: promoDrafts.replyToId })
        .from(promoDrafts)
        .where(
          and(
            eq(promoDrafts.userId, userId),
            eq(promoDrafts.findId, comment.findId),
            inArray(promoDrafts.replyToId, ids)
          )
        )
        .orderBy(desc(promoDrafts.createdAt))
    : []

  return {
    commentId: comment.id,
    text: comment.text,
    commentUrl: comment.commentUrl,
    postTitle: row.postTitle,
    subreddit: row.subreddit,
    handle: row.handle,
    checkedAt: comment.checkedAt,
    replies:
      read === null && !listed.length
        ? null
        : listed.map((reply) => {
            const answer = answers.get(reply.id)
            const job = jobs.get(reply.id)
            const waiting = job?.status === "queued" || job?.status === "running"
            return {
              ...reply,
              answer: answer
                ? { text: answer.text, url: answer.commentUrl, postedAt: answer.postedAt }
                : null,
              pending:
                !answer && waiting
                  ? { runAfter: job.runAfter, running: job.status === "running" }
                  : null,
              failed:
                !answer && job?.status === "failed"
                  ? { text: job.text, error: job.lastError }
                  : null,
              drafts: drafts
                .filter((draft) => draft.replyToId === reply.id)
                .slice(0, 2)
                .map((draft) => ({ id: draft.id, text: draft.text })),
            }
          }),
  }
}

/**
 * How many replies under each of these comments have no answer from the app,
 * for the "2 to answer" line on the Comments screen. A comment whose replies
 * were never read is left out, so it reads as unknown rather than none.
 */
export async function unansweredCounts(
  userId: string,
  comments: Array<{ id: string; incomingReplies: IncomingReply[] | null }>,
  db: CustomShellDb = defaultDb
): Promise<Map<string, number>> {
  const read = comments.filter((comment) => comment.incomingReplies !== null)
  if (!read.length) return new Map()
  const answers = await db
    .select({ parentId: promoComments.parentId, replyId: sql<string>`${promoComments.replyTo}->>'id'` })
    .from(promoComments)
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.status, "posted"),
        inArray(
          promoComments.parentId,
          read.map((comment) => comment.id)
        )
      )
    )
  const answered = new Set(answers.map((row) => `${row.parentId}:${row.replyId}`))
  return new Map(
    read.map((comment) => [
      comment.id,
      (comment.incomingReplies ?? []).filter((reply) => !answered.has(`${comment.id}:${reply.id}`)).length,
    ])
  )
}
