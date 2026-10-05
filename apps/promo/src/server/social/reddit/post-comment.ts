import { and, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { redditComment, type CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { MAX_COMMENT_CHARS } from "@/lib/social/options"
import { promoAccounts, promoComments, promoDrafts, promoFinds } from "../schema"

/**
 * Sending one comment to Reddit.
 *
 * This is the only code in the app that writes anything to Reddit, and it only
 * ever runs because a person pressed Post. There is no scheduler, no queue of
 * approved comments going out later, and no retry: a failed post stays failed
 * and visible, because a comment that quietly posted twice is worse than one
 * that did not post at all.
 */

export type PostCommentRequest = {
  userId: string
  findId: string
  accountId: string
  /** Exactly what goes out, which may differ from the draft after an edit. */
  text: string
  /** Null when the words were typed rather than taken from a draft. */
  draftId?: string | null
}

export type PostCommentResult = {
  commentId: string
  commentUrl: string
}

export async function postComment(
  request: PostCommentRequest,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<PostCommentResult> {
  const text = request.text.trim()
  if (!text) throw new Error("There is nothing to post.")
  if (text.length > MAX_COMMENT_CHARS) {
    throw new Error(
      `That comment is ${text.length} characters. Reddit comments here are capped at ${MAX_COMMENT_CHARS}.`
    )
  }

  const [find] = await db
    .select()
    .from(promoFinds)
    .where(and(eq(promoFinds.id, request.findId), eq(promoFinds.userId, request.userId)))
    .limit(1)
  if (!find) throw new Error("That post is no longer saved.")

  // The guard against commenting twice on one post. It is a read rather than a
  // unique index because a second comment on the same post is sometimes right,
  // just never by accident: the screen has to say so and be overruled.
  if (find.status === "commented") {
    throw new Error("You have already commented on that post.")
  }

  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(
      and(eq(promoAccounts.id, request.accountId), eq(promoAccounts.userId, request.userId))
    )
    .limit(1)
  if (!account) throw new Error("Set up a Reddit account first, in Settings.")

  const commentId = uuid()

  try {
    const { commentUrl } = await redditComment(target, {
      permalink: find.permalink,
      text,
    })

    await db.insert(promoComments).values({
      id: commentId,
      userId: request.userId,
      findId: find.id,
      draftId: request.draftId || null,
      accountId: account.id,
      text,
      status: "posted",
      commentUrl,
    })

    await db
      .update(promoFinds)
      .set({ status: "commented" })
      .where(eq(promoFinds.id, find.id))

    if (request.draftId) {
      await db
        .update(promoDrafts)
        .set({ status: "sent" })
        .where(
          and(
            eq(promoDrafts.id, request.draftId),
            eq(promoDrafts.userId, request.userId)
          )
        )
    }

    await db
      .update(promoAccounts)
      .set({ lastPostedAt: new Date() })
      .where(eq(promoAccounts.id, account.id))

    return { commentId, commentUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // The attempt is recorded even though it failed, with the words that were
    // tried. Without the row a person cannot tell a comment that never went
    // from one that went and was removed by a moderator.
    await db.insert(promoComments).values({
      id: commentId,
      userId: request.userId,
      findId: find.id,
      draftId: request.draftId || null,
      accountId: account.id,
      text,
      status: "failed",
      lastError: message,
    })

    // The find keeps its old status on purpose. Marking it commented would
    // hide a post that still needs a comment.
    throw error
  }
}
