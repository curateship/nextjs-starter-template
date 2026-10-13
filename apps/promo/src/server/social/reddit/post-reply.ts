import { and, eq, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { redditReply, type CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { MAX_COMMENT_CHARS } from "@/lib/social/options"
import { answerableReply } from "../replies"
import { promoAccounts, promoComments, promoDrafts } from "../schema"

/**
 * Sending one answer to a reply under a comment the app sent.
 *
 * Like `post-comment.ts`, it only runs because a person pressed Reply, and it
 * is never tried twice. The answer is stored as a comment with a parent: the
 * app's own comment it sits under, and the reply it answers as that reply read
 * when it was answered. A failure is stored too, with the words that were
 * tried, so a person can tell an answer that never went from one a moderator
 * removed.
 */

export type PostReplyRequest = {
  userId: string
  /** The app's own sent comment. */
  commentId: string
  /** Reddit's id for the reply being answered. */
  replyId: string
  text: string
  draftId?: string | null
}

export async function postReply(
  request: PostReplyRequest,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<{ commentId: string; replyUrl: string }> {
  const text = request.text.trim()
  if (!text) throw new Error("There is nothing to post.")
  if (text.length > MAX_COMMENT_CHARS) {
    throw new Error(`That reply is ${text.length} characters. Replies are capped at ${MAX_COMMENT_CHARS}.`)
  }

  const { comment, reply } = await answerableReply(
    request.userId,
    request.commentId,
    request.replyId,
    db
  )

  // The guard against answering one reply twice, read again here because the
  // queue's own check was made when Reply was pressed, maybe hours ago.
  const [already] = await db
    .select({ id: promoComments.id })
    .from(promoComments)
    .where(
      and(
        eq(promoComments.userId, request.userId),
        eq(promoComments.parentId, comment.id),
        eq(promoComments.status, "posted"),
        sql`${promoComments.replyTo}->>'id' = ${reply.id}`
      )
    )
    .limit(1)
  if (already) throw new Error("You have already answered that reply.")

  const id = uuid()
  const record = {
    id,
    userId: request.userId,
    findId: comment.findId,
    draftId: request.draftId || null,
    accountId: comment.accountId,
    text,
    parentId: comment.id,
    replyTo: reply,
  }

  try {
    const { replyUrl, visit } = await redditReply(target, { replyUrl: reply.url, text })
    if (visit) console.log(`Reply visit for comment ${comment.id}: ${JSON.stringify(visit)}`)

    await db.insert(promoComments).values({ ...record, status: "posted", commentUrl: replyUrl, visit })

    if (request.draftId) {
      await db
        .update(promoDrafts)
        .set({ status: "sent" })
        .where(and(eq(promoDrafts.id, request.draftId), eq(promoDrafts.userId, request.userId)))
    }
    await db
      .update(promoAccounts)
      .set({ lastPostedAt: new Date() })
      .where(eq(promoAccounts.id, comment.accountId))

    return { commentId: id, replyUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.insert(promoComments).values({ ...record, status: "failed", lastError: message })
    throw error
  }
}
