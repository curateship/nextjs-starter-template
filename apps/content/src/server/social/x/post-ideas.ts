import { and, desc, eq, or, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { askPostIdeas, type PostIdea } from "../post-ideas"
import { ownedProject } from "../projects"
import { promoXFinds, promoXKeywords } from "./schema"

/** How many of the newest question posts the AI reads. */
const FINDS = 30

/**
 * Ideas for an X post of your own from the questions people asked in the
 * project's X finds and their top replies (part 3 of
 * `workspace/tasks/New features/new-features-18-nov.md`), the same asking as
 * LinkedIn's Post ideas. X's own Ideas and Trending are keywords, not posts.
 */
export async function xPostIdeas(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<PostIdea[]> {
  await ownedProject(userId, projectId, db)
  const finds = await db
    .select({ id: promoXFinds.id, text: promoXFinds.text, topReplies: promoXFinds.topReplies })
    .from(promoXFinds)
    .innerJoin(promoXKeywords, eq(promoXKeywords.id, promoXFinds.keywordId))
    .where(
      and(
        eq(promoXFinds.userId, userId),
        eq(promoXKeywords.projectId, projectId),
        or(sql`${promoXFinds.text} LIKE '%?%'`, sql`${promoXFinds.topReplies}::text LIKE '%?%'`)
      )
    )
    .orderBy(desc(promoXFinds.firstSeenAt))
    .limit(FINDS)
  if (!finds.length) {
    throw new Refusal("No X post found for this project asks a question yet. Add keywords and let them search first.")
  }
  return askPostIdeas(
    {
      userId,
      projectId,
      network: "X",
      pieceWords: "posts and their replies",
      feature: "x-post-ideas",
      pieces: finds.map((find) => ({
        findId: find.id,
        text: [find.text, ...(find.topReplies ?? []).map((reply) => reply.text)].join("\n"),
      })),
    },
    db
  )
}
