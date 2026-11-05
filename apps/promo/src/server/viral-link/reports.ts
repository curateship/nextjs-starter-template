import { and, eq, isNull, like, ne, or } from "drizzle-orm"

import { linkedinPostUrl } from "@/lib/social/linkedin/options"
import { xPostUrl } from "@/lib/social/x/options"
import { promoArchiveItems } from "@/server/archive/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoLinkedinPosts } from "@/server/social/linkedin/schema"
import { promoAccounts, promoAppPosts } from "@/server/social/schema"
import { promoXPosts } from "@/server/social/x/schema"

import { callViral, ViralSaidNo } from "./link"
import { promoViralLinks, promoViralReports } from "./schema"

/**
 * Telling Viral about posts that came from its ideas (Viral's task
 * features/01, part 21: "Promo reports back"). A post counts when its draft
 * came from Viral (`source` is `viral:<idea id>`) or when it was made from an
 * Archive item that Video sent with a Viral idea's id (`viral_idea_id`).
 *
 * The first report says it is up, with its link, and Viral turns the idea
 * Posted. After that the figures Promo's own checks read are sent again at
 * most once a day, and only when the views moved, so Viral can show your
 * views beside the original's.
 */

/** A post from a Viral idea, ready to tell Viral about. */
export type ViralPostReport = {
  postKey: string
  ideaId: string
  network: string
  url: string
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: string | null
}

const SOURCE_PREFIX = "viral:"

/** The idea a post came from: its own draft's source first, then its Archive item's. */
function ideaOf(source: string, archiveIdea: string | null): string {
  if (source.startsWith(SOURCE_PREFIX)) return source.slice(SOURCE_PREFIX.length)
  return archiveIdea ?? ""
}

/** Every posted X, LinkedIn and phone-app post of this person that came from a Viral idea. */
export async function viralPosts(userId: string, db: CustomShellDb = defaultDb): Promise<ViralPostReport[]> {
  const fromViral = (source: Parameters<typeof like>[0], archiveIdea: Parameters<typeof ne>[0]) =>
    or(like(source, `${SOURCE_PREFIX}%`), ne(archiveIdea, ""))

  const xRows = await db
    .select({ id: promoXPosts.id, source: promoXPosts.source, pieces: promoXPosts.pieces, handle: promoAccounts.handle, views: promoXPosts.views, likes: promoXPosts.likes, replies: promoXPosts.replyCount, postedAt: promoXPosts.postedAt, archiveIdea: promoArchiveItems.viralIdeaId })
    .from(promoXPosts)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoXPosts.accountId))
    .leftJoin(promoArchiveItems, eq(promoArchiveItems.id, promoXPosts.archiveItemId))
    .where(and(eq(promoXPosts.userId, userId), eq(promoXPosts.status, "posted"), isNull(promoXPosts.deletedAt), fromViral(promoXPosts.source, promoArchiveItems.viralIdeaId)))

  const linkedinRows = await db
    .select({ id: promoLinkedinPosts.id, source: promoLinkedinPosts.source, postId: promoLinkedinPosts.postId, postUrl: promoLinkedinPosts.postUrl, views: promoLinkedinPosts.impressions, likes: promoLinkedinPosts.reactions, comments: promoLinkedinPosts.commentCount, postedAt: promoLinkedinPosts.postedAt, archiveIdea: promoArchiveItems.viralIdeaId })
    .from(promoLinkedinPosts)
    .leftJoin(promoArchiveItems, eq(promoArchiveItems.id, promoLinkedinPosts.archiveItemId))
    .where(and(eq(promoLinkedinPosts.userId, userId), eq(promoLinkedinPosts.status, "posted"), isNull(promoLinkedinPosts.deletedAt), fromViral(promoLinkedinPosts.source, promoArchiveItems.viralIdeaId)))

  // A phone-app post (TikTok, Instagram) has no draft of its own, so only its Archive item can name an idea.
  const appRows = await db
    .select({ id: promoAppPosts.id, platform: promoAppPosts.platform, postUrl: promoAppPosts.postUrl, views: promoAppPosts.views, likes: promoAppPosts.likes, comments: promoAppPosts.comments, postedAt: promoAppPosts.postedAt, archiveIdea: promoArchiveItems.viralIdeaId })
    .from(promoAppPosts)
    .innerJoin(promoArchiveItems, eq(promoArchiveItems.id, promoAppPosts.archiveItemId))
    .where(and(eq(promoAppPosts.userId, userId), eq(promoAppPosts.status, "posted"), ne(promoArchiveItems.viralIdeaId, "")))

  const reports: ViralPostReport[] = []
  for (const row of xRows) {
    const first = row.pieces[0]?.postId ?? ""
    if (!first) continue
    reports.push({
      postKey: `x:${row.id}`,
      ideaId: ideaOf(row.source, row.archiveIdea),
      network: "x",
      url: xPostUrl(first, row.handle ?? ""),
      views: row.views,
      likes: row.likes,
      comments: row.replies,
      postedAt: row.postedAt?.toISOString() ?? null,
    })
  }
  for (const row of linkedinRows) {
    const url = row.postUrl || (row.postId ? linkedinPostUrl(row.postId) : "")
    if (!url) continue
    reports.push({
      postKey: `linkedin:${row.id}`,
      ideaId: ideaOf(row.source, row.archiveIdea),
      network: "linkedin",
      url,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      postedAt: row.postedAt?.toISOString() ?? null,
    })
  }
  for (const row of appRows) {
    // A post whose link the phone hasn't read yet waits for it.
    if (!row.postUrl) continue
    reports.push({
      postKey: `app:${row.id}`,
      ideaId: row.archiveIdea,
      network: row.platform,
      url: row.postUrl,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      postedAt: row.postedAt?.toISOString() ?? null,
    })
  }
  return reports.filter((report) => report.ideaId)
}

/** Figures are sent again at most this often. */
const FIGURES_GAP_MS = 24 * 3600_000

/**
 * Tells Viral every post it hasn't heard about, and fresh views for the ones
 * it has, at most daily. A call that fails is tried again next pass. Answers
 * how many reports Viral took.
 */
export async function reportViralPosts(
  userId: string,
  db: CustomShellDb = defaultDb,
  { fetchImpl, now = new Date() }: { fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<number> {
  const posts = await viralPosts(userId, db)
  if (!posts.length) return 0
  const told = new Map(
    (await db.select().from(promoViralReports).where(eq(promoViralReports.userId, userId))).map((row) => [row.postKey, row])
  )
  let sent = 0
  for (const post of posts) {
    const before = told.get(post.postKey)
    if (before && (before.views === post.views || now.getTime() - before.reportedAt.getTime() < FIGURES_GAP_MS)) continue
    let taken = true
    try {
      await callViral(userId, "/api/connect/promo/events", { type: "posted", ...post }, { db, fetchImpl })
    } catch (error) {
      taken = false
      console.error("Could not tell Viral about a post", error)
      // Viral refused this one post, such as a shape it doesn't take: it is
      // kept as told, so it never holds up the posts after it. Viral being
      // down, the key changing (401) or too many messages (429) stops the
      // pass, and everything waits for the next one.
      const refusedThisPost = error instanceof ViralSaidNo && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429
      if (!refusedThisPost) break
    }
    await db
      .insert(promoViralReports)
      .values({ userId, postKey: post.postKey, ideaId: post.ideaId, views: post.views, reportedAt: now })
      .onConflictDoUpdate({ target: [promoViralReports.userId, promoViralReports.postKey], set: { views: post.views, reportedAt: now } })
    if (taken) sent += 1
  }
  return sent
}

/** How often the pass runs. A post going up is news within ten minutes. */
const REPORT_GAP_MS = 10 * 60_000

let lastReportAt = 0

/** The tick's part: every person linked to a Viral that pressed Test. */
export async function reportAllViralPosts(db: CustomShellDb = defaultDb, now = new Date()): Promise<void> {
  if (now.getTime() - lastReportAt < REPORT_GAP_MS) return
  lastReportAt = now.getTime()
  const links = await db.select({ userId: promoViralLinks.userId }).from(promoViralLinks).where(ne(promoViralLinks.viralUrl, ""))
  for (const link of links) {
    const sent = await reportViralPosts(link.userId, db, { now })
    if (sent) console.log(`Told Viral about ${sent} post(s) from its ideas`)
  }
}
