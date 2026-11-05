import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm"

import { isCreatorPlatform } from "@/lib/viral/creators"
import { isRising } from "@/lib/viral/rising"
import { VAULT_STATUSES, type VaultStatus } from "@/lib/viral/vault"
import type { ViralVideo } from "@/lib/viral/viral"
import { db } from "@/server/db"
import { loadViralProjectScreen } from "@/server/viral/project-view"
import {
  viralCreatorPosts,
  viralCreators,
  viralProjectCreators,
  viralProjectResults,
  viralProjects,
  viralVaultItems,
} from "@/server/viral/schema"

/**
 * Today, Viral's home page (`workspace/docs/today-page.md`). Tyler, 4 Nov
 * 2026: "Viral's home page". It reads every project that isn't archived and
 * shows the best videos that arrived or took off since yesterday, then how
 * many vault ideas sit in each status. Its search looks through every
 * project's videos at once. Nothing here calls YouTube.
 */

/** How many videos each project shows on Today. */
const BEST_PER_PROJECT = 5

/** How many rows a search across every project answers with. */
const SEARCH_LIMIT = 50

export type TodayProject = {
  id: string
  name: string
  sample: boolean
  /** New to this person or rising fast, above the project's minimum score, best first. */
  videos: ViralVideo[]
}

export type TodayVault = { projectId: string; projectName: string; counts: Record<VaultStatus, number> }

export type ViralToday = { projects: TodayProject[]; vault: TodayVault[] }

export async function loadViralToday(ownerId: string): Promise<ViralToday> {
  const projects = await db
    .select({ id: viralProjects.id, name: viralProjects.name })
    .from(viralProjects)
    .where(and(eq(viralProjects.ownerId, ownerId), isNull(viralProjects.archivedAt)))
    .orderBy(sql`${viralProjects.pinnedAt} desc nulls last`, asc(viralProjects.name))

  const screens = await Promise.all(projects.map((project) => loadViralProjectScreen(ownerId, project.id)))
  const best = screens.map((screen): TodayProject => {
    const { project } = screen
    return {
      id: project.id,
      name: project.name,
      sample: project.sample,
      videos: screen.videos
        .filter((video) => ((video.isNew && !video.seen) || isRising(video.growth)) && video.score.score >= project.min_score)
        .filter((video) => (video.views ?? 0) >= project.min_views)
        .sort((left, right) => right.score.score - left.score.score || (right.views ?? 0) - (left.views ?? 0))
        .slice(0, BEST_PER_PROJECT),
    }
  })

  const counts = projects.length
    ? await db
        .select({ projectId: viralVaultItems.projectId, status: viralVaultItems.status, count: sql<number>`count(*)::int` })
        .from(viralVaultItems)
        .where(and(eq(viralVaultItems.ownerId, ownerId), inArray(viralVaultItems.projectId, projects.map((project) => project.id))))
        .groupBy(viralVaultItems.projectId, viralVaultItems.status)
    : []
  const vault = projects.flatMap((project): TodayVault[] => {
    const mine = counts.filter((row) => row.projectId === project.id)
    if (!mine.length) return []
    const byStatus = Object.fromEntries(VAULT_STATUSES.map((status) => [status, 0])) as Record<VaultStatus, number>
    for (const row of mine) byStatus[row.status] = row.count
    return [{ projectId: project.id, projectName: project.name, counts: byStatus }]
  })

  return { projects: best, vault }
}

/** One video a search across every project found. */
export type ViralSearchHit = {
  projectId: string
  projectName: string
  /** `platform:platformVideoId`, the project page's `?open=`. */
  key: string
  platform: string
  title: string
  channelName: string
  views: number | null
  thumbnailUrl: string | null
}

/** `%` and `_` typed into the box mean themselves, not "anything". */
function likePattern(text: string) {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

/**
 * Titles and channel names in every project that isn't archived: the
 * keyword searches' results and the followed creators' posts. Each video
 * shows once per project, most viewed first.
 */
export async function searchEveryProject(ownerId: string, text: string): Promise<ViralSearchHit[]> {
  const words = text.trim().replace(/\s+/g, " ").slice(0, 200)
  if (!words) return []
  const pattern = likePattern(words)
  const owned = and(eq(viralProjects.ownerId, ownerId), isNull(viralProjects.archivedAt))

  const [results, posts] = await Promise.all([
    db
      .select({
        projectId: viralProjects.id,
        projectName: viralProjects.name,
        platform: viralProjectResults.platform,
        platformVideoId: viralProjectResults.platformVideoId,
        title: viralProjectResults.title,
        channelName: viralProjectResults.channelName,
        views: viralProjectResults.views,
        thumbnailUrl: viralProjectResults.thumbnailUrl,
      })
      .from(viralProjectResults)
      .innerJoin(viralProjects, eq(viralProjects.id, viralProjectResults.projectId))
      .where(and(owned, or(ilike(viralProjectResults.title, pattern), ilike(viralProjectResults.channelName, pattern))))
      .orderBy(desc(viralProjectResults.views))
      .limit(SEARCH_LIMIT * 2),
    db
      .select({
        projectId: viralProjects.id,
        projectName: viralProjects.name,
        platform: viralCreatorPosts.platform,
        platformVideoId: viralCreatorPosts.platformVideoId,
        title: viralCreatorPosts.title,
        channelName: sql<string>`coalesce(${viralCreators.displayName}, '@' || ${viralCreators.handle})`,
        views: viralCreatorPosts.views,
        thumbnailUrl: viralCreatorPosts.thumbnailUrl,
      })
      .from(viralCreatorPosts)
      .innerJoin(viralCreators, eq(viralCreators.id, viralCreatorPosts.creatorId))
      .innerJoin(viralProjectCreators, eq(viralProjectCreators.creatorId, viralCreators.id))
      .innerJoin(viralProjects, eq(viralProjects.id, viralProjectCreators.projectId))
      .where(
        and(
          owned,
          eq(viralCreatorPosts.ownerId, ownerId),
          or(ilike(viralCreatorPosts.title, pattern), ilike(viralCreators.displayName, pattern), ilike(viralCreators.handle, pattern))
        )
      )
      .orderBy(desc(viralCreatorPosts.views))
      .limit(SEARCH_LIMIT * 2),
  ])

  const seen = new Set<string>()
  const hits: ViralSearchHit[] = []
  for (const row of [...results, ...posts].sort((left, right) => (right.views ?? 0) - (left.views ?? 0))) {
    if (!isCreatorPlatform(row.platform)) continue
    const key = `${row.platform}:${row.platformVideoId}`
    if (seen.has(`${row.projectId}|${key}`)) continue
    seen.add(`${row.projectId}|${key}`)
    hits.push({
      projectId: row.projectId,
      projectName: row.projectName,
      key,
      platform: row.platform,
      title: row.title ?? "Untitled",
      channelName: row.channelName ?? "",
      views: row.views,
      thumbnailUrl: row.thumbnailUrl?.startsWith("https://") ? row.thumbnailUrl : null,
    })
    if (hits.length >= SEARCH_LIMIT) break
  }
  return hits
}
