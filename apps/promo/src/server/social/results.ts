import { and, count, eq, gte, isNull, sql, type SQL } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { PHONE_ONLY_NETWORKS, type Network } from "@/lib/social/networks"

import { promoLinkedinComments, promoLinkedinPosts } from "./linkedin/schema"
import { promoMediumArticles, promoMediumResponses } from "./medium/schema"
import { promoAppPosts, promoComments, promoFinds, promoKeywords, promoPosts, promoProjects } from "./schema"
import { promoXPosts, promoXReplies } from "./x/schema"

/**
 * The Projects dashboard's Results widget (part 4 of
 * `workspace/tasks/New features/new-features-18-nov.md`): for each project
 * and network, what went out in the last few days, and the likes and replies
 * it has had as each network's last daily read counted them. Comments on
 * other people's posts and posts of your own are counted together. Failed,
 * waiting and deleted ones are left out.
 *
 * Per project and per network, never per keyword or per account: Tyler
 * declined "which keywords pay off" on 12 Oct 2026, and per-account results
 * belong to the Reddit accounts dashboard's own task.
 */

export type ResultsRow = {
  projectId: string
  projectName: string
  network: Network
  /** Comments and posts that went out in the period. */
  sent: number
  /** Upvotes on Reddit, claps on Medium, likes on X, Instagram and TikTok, reactions on LinkedIn. */
  likes: number
  replies: number
}

/** The periods the widget offers, in days. */
export type ResultsDays = 7 | 30

type Tally = { projectId: string | null; sent: number; likes: number; replies: number }

const sum = (column: AnyPgColumn) => sql<number>`coalesce(sum(${column}), 0)::int`

/** One network's sent pieces since `since`, per project. */
async function tally(
  db: CustomShellDb,
  table: { userId: AnyPgColumn; projectId: AnyPgColumn; status: AnyPgColumn; postedAt: AnyPgColumn; deletedAt?: AnyPgColumn },
  from: PgTable,
  userId: string,
  since: Date,
  sent: string,
  likes: SQL<number>,
  replies: SQL<number>
): Promise<Tally[]> {
  return db
    .select({ projectId: sql<string | null>`${table.projectId}`, sent: count(), likes, replies })
    .from(from)
    .where(
      and(
        eq(table.userId, userId),
        eq(table.status, sent),
        gte(table.postedAt, since),
        table.deletedAt ? isNull(table.deletedAt) : undefined
      )
    )
    .groupBy(table.projectId)
}

export async function readResults(
  userId: string,
  days: ResultsDays,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<ResultsRow[]> {
  const since = new Date(now.getTime() - days * 86_400_000)

  // A Reddit comment belongs to the project whose keyword or thread found its post. A help-only post's
  // comment belongs to an account, not a project, so it is left out.
  const redditProject = sql<string | null>`coalesce(${promoKeywords.projectId}, ${promoFinds.threadProjectId})`
  const redditComments = await db
    .select({ projectId: redditProject, sent: count(), likes: sum(promoComments.upvotes), replies: sum(promoComments.replyCount) })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .leftJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.status, "posted"),
        gte(promoComments.postedAt, since),
        isNull(promoComments.deletedAt)
      )
    )
    .groupBy(redditProject)

  const byNetwork: Array<[Network, Tally[]]> = [
    [
      "reddit",
      [
        ...redditComments,
        ...(await tally(db, promoPosts, promoPosts, userId, since, "posted", sum(promoPosts.upvotes), sum(promoPosts.commentCount))),
      ],
    ],
    [
      "medium",
      [
        ...(await tally(db, promoMediumResponses, promoMediumResponses, userId, since, "posted", sum(promoMediumResponses.claps), sum(promoMediumResponses.replyCount))),
        ...(await tally(
          db,
          { ...promoMediumArticles, postedAt: promoMediumArticles.publishedAt },
          promoMediumArticles,
          userId,
          since,
          "published",
          sum(promoMediumArticles.claps),
          sum(promoMediumArticles.responses)
        )),
      ],
    ],
    [
      "x",
      [
        ...(await tally(db, promoXReplies, promoXReplies, userId, since, "posted", sum(promoXReplies.likes), sum(promoXReplies.replyCount))),
        ...(await tally(db, promoXPosts, promoXPosts, userId, since, "posted", sum(promoXPosts.likes), sum(promoXPosts.replyCount))),
      ],
    ],
    [
      "linkedin",
      [
        ...(await tally(db, promoLinkedinComments, promoLinkedinComments, userId, since, "posted", sum(promoLinkedinComments.reactions), sum(promoLinkedinComments.replyCount))),
        ...(await tally(db, promoLinkedinPosts, promoLinkedinPosts, userId, since, "posted", sum(promoLinkedinPosts.reactions), sum(promoLinkedinPosts.commentCount))),
      ],
    ],
  ]
  for (const network of PHONE_ONLY_NETWORKS) {
    const rows = await db
      .select({ projectId: promoAppPosts.projectId, sent: count(), likes: sum(promoAppPosts.likes), replies: sum(promoAppPosts.comments) })
      .from(promoAppPosts)
      .where(
        and(
          eq(promoAppPosts.userId, userId),
          eq(promoAppPosts.platform, network),
          eq(promoAppPosts.status, "posted"),
          gte(promoAppPosts.postedAt, since)
        )
      )
      .groupBy(promoAppPosts.projectId)
    byNetwork.push([network, rows])
  }

  const projects = await db
    .select({ id: promoProjects.id, name: promoProjects.name })
    .from(promoProjects)
    .where(eq(promoProjects.userId, userId))
  const names = new Map(projects.map((project) => [project.id, project.name]))

  const rows = new Map<string, ResultsRow>()
  for (const [network, tallies] of byNetwork) {
    for (const one of tallies) {
      const projectName = one.projectId ? names.get(one.projectId) : undefined
      if (!one.projectId || projectName === undefined) continue
      const key = `${one.projectId}:${network}`
      const row = rows.get(key) ?? { projectId: one.projectId, projectName, network, sent: 0, likes: 0, replies: 0 }
      row.sent += Number(one.sent)
      row.likes += Number(one.likes)
      row.replies += Number(one.replies)
      rows.set(key, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.sent - a.sent || a.projectName.localeCompare(b.projectName))
}
