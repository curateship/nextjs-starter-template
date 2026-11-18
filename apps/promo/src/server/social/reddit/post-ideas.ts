import { and, desc, eq, isNull, or, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { askPostIdeas, type PostIdea } from "../post-ideas"
import { ownedProject } from "../projects"
import { promoFinds, promoKeywords } from "../schema"

/** A Reddit post idea, with the subreddit the question was asked in. */
export type RedditPostIdea = PostIdea & { subreddit: string }

/** How many of the newest question posts the AI reads. */
const FINDS = 30

/**
 * Ideas for a Reddit post of your own from the questions people asked in the
 * project's Reddit finds and their replies (part 3 of
 * `workspace/tasks/New features/new-features-18-nov.md`), the same asking as
 * LinkedIn's Post ideas. Help-only posts belong to an account, so they are
 * left out.
 */
export async function redditPostIdeas(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<RedditPostIdea[]> {
  await ownedProject(userId, projectId, db)
  const finds = await db
    .select({
      id: promoFinds.id,
      subreddit: promoFinds.subreddit,
      title: promoFinds.title,
      body: promoFinds.body,
      thread: promoFinds.thread,
    })
    .from(promoFinds)
    .leftJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .where(
      and(
        eq(promoFinds.userId, userId),
        or(eq(promoKeywords.projectId, projectId), eq(promoFinds.threadProjectId, projectId)),
        isNull(promoFinds.helpAccountId),
        or(
          sql`${promoFinds.title} LIKE '%?%'`,
          sql`${promoFinds.body} LIKE '%?%'`,
          sql`${promoFinds.thread}::text LIKE '%?%'`
        )
      )
    )
    .orderBy(desc(promoFinds.firstSeenAt))
    .limit(FINDS)
  if (!finds.length) {
    throw new Refusal("No Reddit post found for this project asks a question yet. Add keywords and let them search first.")
  }
  const ideas = await askPostIdeas(
    {
      userId,
      projectId,
      network: "Reddit",
      pieceWords: "posts and their replies",
      feature: "reddit-post-ideas",
      pieces: finds.map((find) => ({
        findId: find.id,
        text: [find.title, find.thread?.body || find.body, ...(find.thread?.replies ?? []).map((reply) => reply.text)]
          .filter(Boolean)
          .join("\n"),
      })),
    },
    db
  )
  const subreddits = new Map(finds.map((find) => [find.id, find.subreddit]))
  return ideas.map((idea) => ({ ...idea, subreddit: subreddits.get(idea.findId) ?? "" }))
}
