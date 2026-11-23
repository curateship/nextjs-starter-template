import { and, desc, eq, isNull, ne, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoComments, promoFinds } from "../schema"
import { titleWords } from "../title-words"

/**
 * What you have said before, shown beside the comment box while you write:
 * your comments on posts like this one, and how often this subreddit has
 * removed you.
 */

/** How many past comments sit beside the box. */
const PAST_ANSWERS = 3

export type PastAnswer = {
  id: string
  postTitle: string
  subreddit: string
  text: string
  /** Null until a check has read it, or while Reddit hides the score. */
  upvotes: number | null
  commentUrl: string
  postedAt: Date
}

/**
 * Up to three comments already sent on posts like this one: those under the
 * same keyword first, then those whose post's title shares the most words
 * with this one's. Only comments that landed and are still up, never
 * answers to replies, and never this post's own.
 */
export async function pastAnswers(
  userId: string,
  find: { id: string; keywordId: string | null; title: string },
  db: CustomShellDb = defaultDb
): Promise<PastAnswer[]> {
  const rows = await db
    .select({
      id: promoComments.id,
      text: promoComments.text,
      upvotes: promoComments.upvotes,
      commentUrl: promoComments.commentUrl,
      postedAt: promoComments.postedAt,
      postTitle: promoFinds.title,
      subreddit: promoFinds.subreddit,
      keywordId: promoFinds.keywordId,
    })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.status, "posted"),
        isNull(promoComments.parentId),
        isNull(promoComments.deletedAt),
        ne(promoComments.findId, find.id)
      )
    )
    .orderBy(desc(promoComments.postedAt))
    .limit(300)

  const wanted = titleWords(find.title)
  const scored = rows
    .map((row) => {
      const words = titleWords(row.postTitle)
      const shared = [...words].filter((word) => wanted.has(word)).length
      const sameKeyword = Boolean(find.keywordId) && row.keywordId === find.keywordId
      return { row, score: (sameKeyword ? 100 : 0) + shared }
    })
    // A comment under another keyword sharing one word is a coincidence.
    .filter((item) => item.score >= 100 || item.score >= 2)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, PAST_ANSWERS).map(({ row }) => ({
    id: row.id,
    postTitle: row.postTitle,
    subreddit: row.subreddit,
    text: row.text,
    upvotes: row.upvotes,
    commentUrl: row.commentUrl,
    postedAt: row.postedAt,
  }))
}

/**
 * How many of your checked comments in this subreddit are gone, and how many
 * were checked. Only comments a check has read count, and never one you
 * deleted, so the answer is what the checks saw.
 */
export async function subredditRemovals(
  userId: string,
  subreddit: string,
  db: CustomShellDb = defaultDb
): Promise<{ removed: number; checked: number }> {
  const [row] = await db
    .select({
      checked: sql<number>`count(*)::int`,
      removed: sql<number>`count(*) filter (where ${promoComments.stillVisible} = false)::int`,
    })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.status, "posted"),
        isNull(promoComments.deletedAt),
        sql`${promoComments.stillVisible} IS NOT NULL`,
        sql`lower(${promoFinds.subreddit}) = ${subreddit.toLowerCase()}`
      )
    )
  return { removed: row?.removed ?? 0, checked: row?.checked ?? 0 }
}
