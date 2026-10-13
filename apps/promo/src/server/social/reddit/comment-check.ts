import { and, eq } from "drizzle-orm"

import { redditCommentCheck, type CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { IncomingReply } from "@/lib/social/options"

import { promoComments } from "../schema"

/**
 * Reads one sent comment on Reddit again and stores what was seen: its
 * upvotes, the replies under it with the words of the ones directly under
 * it, and whether it is still there. Run by the
 * browser program for a `comment_check` job.
 *
 * Only ever reads. Nothing here deletes, edits or posts again.
 */
export async function recordCommentCheck(
  userId: string,
  commentId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  // Scoped by owner: the id came off a job payload.
  const [comment] = await db
    .select({ id: promoComments.id, commentUrl: promoComments.commentUrl, status: promoComments.status })
    .from(promoComments)
    .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
    .limit(1)
  if (!comment) throw new Refusal("That comment is no longer saved.")
  // Only an address the app itself wrote is ever handed to the browser.
  if (comment.status !== "posted" || !comment.commentUrl.startsWith("https://www.reddit.com/")) {
    throw new Refusal("That comment never landed on Reddit, so there is nothing to read.")
  }

  const reading = await redditCommentCheck(target, { commentUrl: comment.commentUrl })

  await db
    .update(promoComments)
    .set({
      upvotes: reading.upvotes,
      replyCount: reading.replies,
      stillVisible: reading.visible,
      checkedAs: reading.seenAs,
      checkedAt: now,
      // The replies' words, so each can be answered. An older browser image
      // does not send them, and then the last ones read are kept.
      ...(reading.incoming
        ? {
            incomingReplies: reading.incoming.map(
              (reply): IncomingReply => ({
                id: reply.id,
                author: reply.author,
                text: reply.text,
                score: reply.score,
                url: reply.url,
                postedAt:
                  reply.postedAtSeconds === null
                    ? null
                    : new Date(reply.postedAtSeconds * 1000).toISOString(),
              })
            ),
          }
        : {}),
    })
    .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
}
