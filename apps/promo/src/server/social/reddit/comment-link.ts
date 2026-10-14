import { and, eq } from "drizzle-orm"

import { redditThread, type CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { TryAgainLater } from "../jobs"
import { promoAccounts, promoComments, promoFinds } from "../schema"

/**
 * The address of a comment a phone posted.
 *
 * The Reddit app shows the comment once it is posted, but not its address,
 * and the address is what the Comments dashboard, the comment checks and the
 * answers to replies all work from. So the signed-out reader browser reads
 * the post's newest replies, for a `comment_link` job, and takes the one by
 * the account with the same words. Reading is safe to try again; the comment
 * itself is never sent twice.
 */

/** The newest replies read when looking for it. A comment posted a minute ago is among the first. */
const NEWEST_REPLIES = 50

/** How long before looking again, when Reddit has not shown it yet. */
const LOOK_AGAIN_MS = 2 * 60_000

/** Two texts are the same comment when they read the same once spacing is ignored. */
export function sameComment(a: string, b: string): boolean {
  const plain = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase()
  const left = plain(a)
  const right = plain(b)
  if (!left || !right) return false
  // Reddit may tidy the end of a comment (a trailing space, a markdown mark),
  // so the first 80 characters decide.
  return left.slice(0, 80) === right.slice(0, 80)
}

export async function findCommentLink(
  userId: string,
  payload: Record<string, unknown>,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<string> {
  const commentId = String(payload.commentId ?? "")
  if (!commentId) throw new Refusal("That job names no comment.")
  const [row] = await db
    .select({ comment: promoComments, permalink: promoFinds.permalink, handle: promoAccounts.handle })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
    .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That comment is no longer saved.")
  if (row.comment.commentUrl) return row.comment.commentUrl
  if (!row.handle) throw new Refusal("The account that sent it has no name read yet, so its comment cannot be told apart.")

  const answer = await redditThread(target, { permalink: row.permalink, replyLimit: NEWEST_REPLIES, sort: "new" })
  const handle = row.handle.toLowerCase()
  const found = answer.replies.find(
    (reply) => reply.author.toLowerCase() === handle && reply.permalink && sameComment(reply.text, row.comment.text)
  )
  if (!found) {
    throw new TryAgainLater(
      `The reader did not find u/${row.handle}'s comment among the post's newest ${NEWEST_REPLIES} replies yet. Reddit can take a minute to show it; this is tried again in two minutes.`,
      LOOK_AGAIN_MS
    )
  }
  await db
    .update(promoComments)
    .set({ commentUrl: found.permalink.slice(0, 600) })
    .where(eq(promoComments.id, commentId))
  return found.permalink
}
