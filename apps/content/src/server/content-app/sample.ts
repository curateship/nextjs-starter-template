import { eq } from "drizzle-orm"

import { storedProjectPage } from "@/lib/social/project-description"
import { uuid } from "@/server/auth/security"
import { adoptLooseParts, syncProjectParts } from "@/server/content-app/projects"
import { contentSampleMade } from "@/server/content-app/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoFinds, promoKeywords, promoProjects } from "@/server/social/schema"
import { insertVideo } from "@/server/video/project-videos"
import { viralSampleMade } from "@/server/viral/schema"

/**
 * The sample project (Tyler, 26 Nov 2026: "Start with dummy data so we can
 * have a better visual view how everything works";
 * `workspace/docs/content-app.md`, "The sample project"). A new account gets
 * one the first time its Projects list is read, so every row of a project's
 * page has something in it:
 *
 * - **Research:** Viral's sample, as it was: made-up found videos, one
 *   analysed video, ideas in the vault, and X and Reddit posts.
 *   Its screen says it is a sample and refuses to search.
 * - **Videos:** two videos, a draft and one ready, with empty timelines.
 * - **Promote:** YouTube, Reddit and X, and on Reddit's Commenting three
 *   made-up posts under a keyword that is switched off.
 *
 * **Nothing in it can reach a network.** It has no account, no browser
 * profile, no phone and no job, which is what Promo's workers claim. A
 * keyword that is switched off is never searched (`reddit/timed-searches.ts`),
 * and a post can only be commented on from an account. Its name starts
 * "Sample:", as Viral's sample always has.
 */
export async function ensureSampleContentProject(userId: string, database: CustomShellDb = defaultDb): Promise<boolean> {
  const [claimed] = await database
    .insert(contentSampleMade)
    .values({ ownerId: userId, madeAt: new Date() })
    .onConflictDoNothing()
    .returning({ ownerId: contentSampleMade.ownerId })
  if (!claimed) return false
  // Somebody who already has a project doesn't need one.
  const [any] = await database.select({ id: promoProjects.id }).from(promoProjects).where(eq(promoProjects.userId, userId)).limit(1)
  if (any) return false
  // Viral's own first-visit sample would be a second one, so it is marked made.
  await database.insert(viralSampleMade).values({ ownerId: userId, madeAt: new Date() }).onConflictDoNothing()
  const { createSampleViralProject } = await import("@/server/viral/projects")
  const research = await createSampleViralProject(userId)
  await adoptLooseParts(userId, database)
  const projectId = research.id
  const at = new Date()

  await database
    .update(promoProjects)
    .set({
      networks: ["youtube", "reddit", "x"],
      description: storedProjectPage(JSON.stringify(SAMPLE_PAGE)),
      updatedAt: at,
    })
    .where(eq(promoProjects.id, projectId))
  // Research's topic is the description (`projects.ts`).
  await syncProjectParts(projectId, database)

  await insertVideo(userId, projectId, { name: "The 30 second stretch, my version", aspect: "9:16", status: "draft" }, database)
  await insertVideo(userId, projectId, { name: "3 moves for people who sit all day", aspect: "9:16", status: "ready" }, database)

  const keywordId = uuid()
  await database.insert(promoKeywords).values({
    id: keywordId,
    userId,
    projectId,
    term: "back pain from sitting",
    subreddits: ["officeworkers", "posture"],
    // Switched off, so it is never searched.
    enabled: false,
    createdAt: at,
    updatedAt: at,
  })
  const HOUR = 60 * 60 * 1000
  await database.insert(promoFinds).values(
    SAMPLE_POSTS.map((post, index) => ({
      id: uuid(),
      userId,
      keywordId,
      redditId: `t3_sample${index + 1}`,
      permalink: `/r/${post.subreddit}/comments/sample${index + 1}/`,
      subreddit: post.subreddit,
      title: post.title,
      body: post.body,
      author: post.author,
      score: post.score,
      commentCount: post.comments,
      postedAt: new Date(at.getTime() - (index + 2) * HOUR),
      createdAt: at,
      updatedAt: at,
    }))
  )
  return true
}

/** The sample's description, which Research also searches with. */
const SAMPLE_PAGE = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Desk stretches and short office workouts for people who sit all day." }],
    },
  ],
}

/** Made-up Reddit posts for Reddit's Commenting row. */
const SAMPLE_POSTS = [
  {
    subreddit: "officeworkers",
    title: "My lower back hurts by 3pm every day. What actually helps?",
    body: "I sit 9 hours a day. I've tried a cushion and a standing desk. Anyone found stretches that work?",
    author: "sample_sitter",
    score: 142,
    comments: 37,
  },
  {
    subreddit: "posture",
    title: "Is a 2 minute stretch every hour worth it?",
    body: "Saw a video saying short breaks beat one long workout. Has anyone tried it for a month?",
    author: "sample_deskjockey",
    score: 88,
    comments: 21,
  },
  {
    subreddit: "officeworkers",
    title: "Exercises you can do at your desk without looking weird",
    body: "Open plan office. I want something nobody will notice.",
    author: "sample_openplan",
    score: 63,
    comments: 15,
  },
]
