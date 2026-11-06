import { and, count, eq, inArray, isNull, max, sql } from "drizzle-orm"

import type { Network } from "@/lib/social/networks"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoLinkedinPosts } from "./linkedin/schema"
import { promoMediumArticles } from "./medium/schema"
import { promoAppPosts, promoJobs, promoPosts } from "./schema"
import { promoXPosts } from "./x/schema"

/**
 * How many of a project's own posts need you on each network: failed ones
 * and drafts not sent yet. It is the number on each network's row of the
 * project's left column (part 8 of
 * `workspace/tasks/Projects/commenting-dashboard.md`); the posts waiting for
 * a comment are counted on a network's Commenting instead. Reddit and the
 * phone apps keep no drafts, so only their failed posts count.
 */
export async function readPostCounts(
  userId: string,
  projectId: string,
  networks: readonly Network[],
  db: CustomShellDb = defaultDb
): Promise<Partial<Record<Network, number>>> {
  const counts: Partial<Record<Network, number>> = {}

  if (networks.includes("x")) {
    const [row] = await db
      .select({ n: count() })
      .from(promoXPosts)
      .where(and(eq(promoXPosts.userId, userId), eq(promoXPosts.projectId, projectId), inArray(promoXPosts.status, ["draft", "failed"]), isNull(promoXPosts.deletedAt)))
    counts.x = row?.n ?? 0
  }
  if (networks.includes("linkedin")) {
    const [row] = await db
      .select({ n: count() })
      .from(promoLinkedinPosts)
      .where(
        and(
          eq(promoLinkedinPosts.userId, userId),
          eq(promoLinkedinPosts.projectId, projectId),
          inArray(promoLinkedinPosts.status, ["draft", "failed"]),
          isNull(promoLinkedinPosts.deletedAt)
        )
      )
    counts.linkedin = row?.n ?? 0
  }
  if (networks.includes("medium")) {
    const [row] = await db
      .select({ n: count() })
      .from(promoMediumArticles)
      .where(
        and(
          eq(promoMediumArticles.userId, userId),
          eq(promoMediumArticles.projectId, projectId),
          inArray(promoMediumArticles.status, ["draft", "failed"]),
          isNull(promoMediumArticles.deletedAt)
        )
      )
    counts.medium = row?.n ?? 0
  }
  for (const network of ["instagram", "tiktok"] as const) {
    if (!networks.includes(network)) continue
    const [row] = await db
      .select({ n: count() })
      .from(promoAppPosts)
      .where(and(eq(promoAppPosts.userId, userId), eq(promoAppPosts.projectId, projectId), eq(promoAppPosts.platform, network), eq(promoAppPosts.status, "failed")))
    counts[network] = row?.n ?? 0
  }
  if (networks.includes("reddit")) {
    // A post of your own names its project on its job, the same field the
    // Failed list reads (`listFailures`), so one count does without the list.
    const [row] = await db
      .select({ n: count() })
      .from(promoJobs)
      .where(
        and(
          eq(promoJobs.userId, userId),
          eq(promoJobs.kind, "submit"),
          eq(promoJobs.status, "failed"),
          isNull(promoJobs.dismissedAt),
          sql`${promoJobs.payload}->>'projectId' = ${projectId}`
        )
      )
    counts.reddit = row?.n ?? 0
  }
  return counts
}

/**
 * Every project's posts of your own that went out, on every network, and when
 * the newest did: the Projects table's Posts and Last post (part 25 of
 * `workspace/tasks/Projects/commenting-dashboard.md`). One read per network
 * across every project, never one per row. A deleted post no longer counts.
 */
export async function readProjectPosts(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<Map<string, { posts: number; lastPostAt: Date | null }>> {
  const reads = await Promise.all([
    db
      .select({ projectId: promoPosts.projectId, n: count(), last: max(promoPosts.postedAt) })
      .from(promoPosts)
      .where(and(eq(promoPosts.userId, userId), eq(promoPosts.status, "posted")))
      .groupBy(promoPosts.projectId),
    db
      .select({ projectId: promoXPosts.projectId, n: count(), last: max(promoXPosts.postedAt) })
      .from(promoXPosts)
      .where(and(eq(promoXPosts.userId, userId), eq(promoXPosts.status, "posted"), isNull(promoXPosts.deletedAt)))
      .groupBy(promoXPosts.projectId),
    db
      .select({ projectId: promoLinkedinPosts.projectId, n: count(), last: max(promoLinkedinPosts.postedAt) })
      .from(promoLinkedinPosts)
      .where(and(eq(promoLinkedinPosts.userId, userId), eq(promoLinkedinPosts.status, "posted"), isNull(promoLinkedinPosts.deletedAt)))
      .groupBy(promoLinkedinPosts.projectId),
    db
      .select({ projectId: promoMediumArticles.projectId, n: count(), last: max(promoMediumArticles.publishedAt) })
      .from(promoMediumArticles)
      .where(and(eq(promoMediumArticles.userId, userId), eq(promoMediumArticles.status, "published"), isNull(promoMediumArticles.deletedAt)))
      .groupBy(promoMediumArticles.projectId),
    db
      .select({ projectId: promoAppPosts.projectId, n: count(), last: max(promoAppPosts.postedAt) })
      .from(promoAppPosts)
      .where(and(eq(promoAppPosts.userId, userId), eq(promoAppPosts.status, "posted")))
      .groupBy(promoAppPosts.projectId),
  ])
  const out = new Map<string, { posts: number; lastPostAt: Date | null }>()
  for (const rows of reads) {
    for (const row of rows) {
      if (!row.projectId) continue
      const was = out.get(row.projectId) ?? { posts: 0, lastPostAt: null }
      const last = row.last ? new Date(row.last) : null
      out.set(row.projectId, {
        posts: was.posts + row.n,
        lastPostAt: last && (!was.lastPostAt || last > was.lastPostAt) ? last : was.lastPostAt,
      })
    }
  }
  return out
}
