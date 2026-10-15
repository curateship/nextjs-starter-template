import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { shownFind } from "./keywords"
import { STRONG_FIT_FROM, rankReason } from "./reddit/rank"
import { unansweredCounts } from "./replies"
import { promoAccounts, promoComments, promoFinds, promoKeywords } from "./schema"

/**
 * The Today tab in a project's Reddit module: the project's best posts and
 * every reply to its accounts' comments waiting for an answer, in one list
 * each, best first. It was one page across every project until 14 Oct 2026,
 * when Tyler folded Reddit's screens into the project.
 *
 * Nothing here posts. A post opens beside the list, where the account has to
 * be one of the project's; a reply opens in its comment's Replies window.
 */

/** How many posts the list shows. More than a morning's work. */
const TODAY_POSTS = 60

export type TodayPost = {
  id: string
  title: string
  subreddit: string
  commentCount: number
  postedAt: Date | null
  reason: string
}

export type TodayReply = {
  /** The sent comment the replies sit under. */
  commentId: string
  postTitle: string
  subreddit: string
  /** How many replies directly under it have no answer from the app. */
  toAnswer: number
  /** The newest of those, to read before opening. */
  latest: { author: string; text: string }
  account: { id: string; handle: string }
}

export type TodayView = { posts: TodayPost[]; replies: TodayReply[] }

/** One project's Strong fit posts and its replies waiting for an answer, for its Today tab. */
export async function readToday(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<TodayView> {
  const posts = await db
    .select({ find: promoFinds })
    .from(promoFinds)
    .innerJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .where(
      and(
        eq(promoFinds.userId, userId),
        eq(promoKeywords.projectId, projectId),
        inArray(promoFinds.status, ["new", "shortlisted"]),
        gte(promoFinds.rank, STRONG_FIT_FROM),
        shownFind(userId)
      )
    )
    .orderBy(desc(promoFinds.rank), desc(promoFinds.postedAt))
    .limit(TODAY_POSTS * 2)

  // The same post can be found by two keywords; it is one post to answer.
  const seen = new Set<string>()
  const todayPosts: TodayPost[] = []
  for (const { find } of posts) {
    const key = find.redditId
    if (seen.has(key)) continue
    seen.add(key)
    todayPosts.push({
      id: find.id,
      title: find.title,
      subreddit: find.subreddit,
      commentCount: find.commentCount,
      postedAt: find.postedAt,
      reason: rankReason(
        { position: find.redditPosition, commentCount: find.commentCount, postedAt: find.postedAt },
        now
      ),
    })
    if (todayPosts.length >= TODAY_POSTS) break
  }

  const comments = await db
    .select({
      id: promoComments.id,
      incomingReplies: promoComments.incomingReplies,
      postTitle: promoFinds.title,
      subreddit: promoFinds.subreddit,
      accountId: promoAccounts.id,
      handle: promoAccounts.handle,
    })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoAccounts.projectId, projectId),
        eq(promoComments.status, "posted"),
        isNull(promoComments.parentId),
        isNull(promoComments.deletedAt)
      )
    )
    .orderBy(desc(promoComments.postedAt))
  const counts = await unansweredCounts(userId, comments, db)

  const replies: TodayReply[] = []
  for (const comment of comments) {
    const toAnswer = counts.get(comment.id) ?? 0
    if (!toAnswer) continue
    const newest = [...(comment.incomingReplies ?? [])].sort(
      (a, b) => new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime()
    )[0]
    replies.push({
      commentId: comment.id,
      postTitle: comment.postTitle,
      subreddit: comment.subreddit,
      toAnswer,
      latest: { author: newest?.author ?? "", text: newest?.text ?? "" },
      account: { id: comment.accountId, handle: comment.handle },
    })
  }

  return { posts: todayPosts, replies }
}
