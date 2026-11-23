import { and, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { redditComment, type CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { MAX_COMMENT_CHARS } from "@/lib/social/options"
import { queueJob } from "../jobs"
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
  /** "Sam via Project" when a guest sent from Project pressed Post; null for the owner. */
  sentBy?: string | null
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
    const { commentUrl, visit } = await redditComment(target, {
      permalink: find.permalink,
      text,
      subreddit: find.subreddit,
    })
    // To the program's log as well as the row, so a visit can be read back
    // from either.
    if (visit) console.log(`Comment visit for find ${find.id}: ${JSON.stringify(visit)}`)

    await db.insert(promoComments).values({
      id: commentId,
      userId: request.userId,
      findId: find.id,
      draftId: request.draftId || null,
      accountId: account.id,
      text,
      status: "posted",
      commentUrl,
      visit,
      sentBy: request.sentBy ?? null,
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

    // A comment from a phone comes back without its address, because the
    // Reddit app does not show one. The signed-out reader finds it in the
    // thread (`comment-link.ts`). Nothing here may fail the comment, which
    // is already on Reddit: with no reader picked, the link stays empty.
    if (!commentUrl) {
      try {
        await queueJob(request.userId, "comment_link", { commentId, accountId: account.id }, db)
      } catch (error) {
        console.error(`Could not ask the reader for the link of comment ${commentId}`, error)
      }
    }

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
      sentBy: request.sentBy ?? null,
    })

    // The find keeps its old status on purpose. Marking it commented would
    // hide a post that still needs a comment.
    throw error
  }
}
