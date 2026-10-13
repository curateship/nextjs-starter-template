import { and, eq } from "drizzle-orm"

import { redditCommentCheck, type CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import type { IncomingReply } from "@/lib/social/options"

import { ringBell } from "../notices"
import { promoComments, promoFinds } from "../schema"

/**
 * Reads one sent comment on Reddit again and stores what was seen: its
 * upvotes, the replies under it with the words of the ones directly under
 * it, and whether it is still there. Run by the
 * browser program for a `comment_check` job.
 *
 * Only ever reads. Nothing here deletes, edits or posts again.
 *
 * Two things ring the bell: a reply directly under the comment that the last
 * reading did not have, and the comment going from there to gone. A comment
 * the app deleted on a person's press is never read again, so its going is
 * never reported as a moderator's removal.
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
    .select({
      id: promoComments.id,
      commentUrl: promoComments.commentUrl,
      status: promoComments.status,
      deletedAt: promoComments.deletedAt,
      stillVisible: promoComments.stillVisible,
      incomingReplies: promoComments.incomingReplies,
      postTitle: promoFinds.title,
    })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
    .limit(1)
  if (!comment) throw new Refusal("That comment is no longer saved.")
  if (comment.deletedAt) {
    throw new Refusal("You deleted that comment from Reddit, so there is nothing to read.")
  }
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

  const title = comment.postTitle ? `"${comment.postTitle.slice(0, 120)}"` : "a post"
  const known = new Set((comment.incomingReplies ?? []).map((reply) => reply.id))
  const fresh = (reading.incoming ?? []).filter((reply) => !known.has(reply.id))
  if (fresh.length) {
    const first = fresh[0]
    await ringBell(
      userId,
      {
        kind: "reply",
        targetId: comment.id,
        message: `${NOTICE_HEADINGS.reply} on ${title}`,
        detail:
          fresh.length === 1
            ? `u/${first.author || "someone"} wrote: ${first.text.slice(0, 200)}`
            : `${fresh.length} new replies, the first from u/${first.author || "someone"}: ${first.text.slice(0, 160)}`,
        href: `/admin/comments?replies=${encodeURIComponent(comment.id)}`,
      },
      db,
      now
    )
  }
  if (comment.stillVisible !== false && reading.visible === false) {
    await ringBell(
      userId,
      {
        kind: "removed",
        targetId: comment.id,
        message: `${NOTICE_HEADINGS.removed} on ${title}`,
        detail: "A stranger reading the post no longer sees it. That is usually a moderator, or Reddit's own filter.",
        href: `/admin/comments?comment=${encodeURIComponent(comment.id)}`,
      },
      db,
      now
    )
  }
}
