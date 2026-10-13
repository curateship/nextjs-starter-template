import { and, eq } from "drizzle-orm"

import {
  redditDeleteComment,
  redditEditComment,
  type CommandTarget,
} from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { MAX_COMMENT_CHARS } from "@/lib/social/options"

import { promoComments } from "../schema"

/**
 * Deleting or editing a comment the app sent, from the account that sent it.
 * Run by the browser program for a `delete_comment` or `edit_comment` job,
 * which only a person pressing Delete or Save changes on the Comments screen
 * writes.
 *
 * A deleted comment keeps its row, marked deleted by you, so a later check
 * never reads its going as a moderator's removal. An edited one keeps the
 * words it first went out with.
 */

type SentComment = typeof promoComments.$inferSelect

async function sentComment(userId: string, commentId: string, db: CustomShellDb): Promise<SentComment> {
  // Scoped by owner: the id came off a job payload.
  const [comment] = await db
    .select()
    .from(promoComments)
    .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
    .limit(1)
  if (!comment) throw new Refusal("That comment is no longer saved.")
  // Only an address the app itself wrote is ever handed to the browser.
  if (comment.status !== "posted" || !comment.commentUrl.startsWith("https://www.reddit.com/")) {
    throw new Refusal("That comment never landed on Reddit, so there is nothing to change.")
  }
  if (comment.deletedAt) throw new Refusal("That comment is already deleted from Reddit.")
  return comment
}

export async function deleteSentComment(
  userId: string,
  commentId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const comment = await sentComment(userId, commentId, db)
  const answer = await redditDeleteComment(target, { commentUrl: comment.commentUrl })
  if (!answer.done) {
    throw new Error("Reddit did not show the comment as deleted afterwards, so it may still be there. Open it on Reddit to check.")
  }
  await db
    .update(promoComments)
    .set({ deletedAt: now })
    .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
}

export async function editSentComment(
  userId: string,
  commentId: string,
  text: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const words = text.trim()
  if (!words) throw new Refusal("There is nothing to change it to.")
  if (words.length > MAX_COMMENT_CHARS) {
    throw new Refusal(`That is ${words.length} characters, and a comment stops at ${MAX_COMMENT_CHARS}.`)
  }
  const comment = await sentComment(userId, commentId, db)
  const answer = await redditEditComment(target, { commentUrl: comment.commentUrl, text: words })
  if (!answer.done) {
    throw new Error("Reddit did not show the new words afterwards, so the edit may not have saved. Open it on Reddit to check.")
  }
  await db
    .update(promoComments)
    .set({
      text: words,
      editedAt: now,
      // The words it first went out with, kept from the first edit on.
      originalText: comment.originalText ?? comment.text,
    })
    .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
}
