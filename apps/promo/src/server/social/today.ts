import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { shownFind } from "./keywords"
import { STRONG_FIT_FROM, rankReason } from "./reddit/rank"
import { unansweredCounts } from "./replies"
import { promoAccounts, promoComments, promoFinds, promoKeywords, promoProjects } from "./schema"

/**
 * The Today page: every project's best posts and every reply waiting for an
 * answer, in one list each, best first. With several projects, the morning
 * round is one list instead of opening each project in turn.
 *
 * Nothing here posts. A post opens on its own project's dashboard, where the
 * account has to be one of that project's; a reply opens in its comment's
 * Replies window.
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
  project: { id: string; name: string }
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
  project: { id: string; name: string } | null
}

export type TodayView = { posts: TodayPost[]; replies: TodayReply[] }

export async function readToday(
  userId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<TodayView> {
  const posts = await db
    .select({
      find: promoFinds,
      projectId: promoProjects.id,
      projectName: promoProjects.name,
    })
    .from(promoFinds)
    .innerJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .innerJoin(promoProjects, eq(promoProjects.id, promoKeywords.projectId))
    .where(
      and(
        eq(promoFinds.userId, userId),
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
  for (const { find, projectId, projectName } of posts) {
    const key = `${projectId}:${find.redditId}`
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
      project: { id: projectId, name: projectName },
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
      projectId: promoProjects.id,
      projectName: promoProjects.name,
    })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
    .leftJoin(promoProjects, eq(promoProjects.id, promoAccounts.projectId))
    .where(
      and(
        eq(promoComments.userId, userId),
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
      project: comment.projectId && comment.projectName !== null ? { id: comment.projectId, name: comment.projectName } : null,
    })
  }

  return { posts: todayPosts, replies }
}
