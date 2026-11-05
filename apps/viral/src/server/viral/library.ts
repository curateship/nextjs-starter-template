import { and, asc, desc, eq, inArray } from "drizzle-orm"

import type { LibraryHook } from "@/lib/viral/library"
import { isCreatorPlatform } from "@/lib/viral/creators"
import { hookLine } from "@/lib/viral/viral-breakdown"
import { viralSays } from "@/lib/viral/viral"
import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { readStoredBreakdown } from "@/server/viral/analysis"
import { viralAnalyses, viralHookTags, viralProjects, viralTags, viralVideos } from "@/server/viral/schema"
import { tagIds } from "@/server/viral/vault"

/**
 * Library → Hooks (`workspace/docs/library.md`, task part 17): the opening
 * line of every video Analyse with AI has written about, across all the
 * person's projects. A video analysed in two projects is one row naming both,
 * the latest first. Nothing here asks YouTube or an AI.
 */
export async function listLibraryHooks(ownerId: string): Promise<LibraryHook[]> {
  const analyses = await db
    .select({ savedVideoId: viralAnalyses.savedVideoId, projectId: viralAnalyses.projectId, at: viralAnalyses.createdAt })
    .from(viralAnalyses)
    .where(eq(viralAnalyses.ownerId, ownerId))
    .orderBy(desc(viralAnalyses.createdAt))
  if (!analyses.length) return []
  const videoIds = [...new Set(analyses.map((row) => row.savedVideoId))]
  const projectIds = [...new Set(analyses.flatMap((row) => (row.projectId ? [row.projectId] : [])))]
  const [videos, projects, tags] = await Promise.all([
    db
      .select()
      .from(viralVideos)
      .where(and(eq(viralVideos.ownerId, ownerId), inArray(viralVideos.id, videoIds))),
    projectIds.length
      ? db
          .select({ id: viralProjects.id, name: viralProjects.name })
          .from(viralProjects)
          .where(and(eq(viralProjects.ownerId, ownerId), inArray(viralProjects.id, projectIds)))
      : Promise.resolve([]),
    db
      .select({ savedVideoId: viralHookTags.savedVideoId, name: viralTags.name })
      .from(viralHookTags)
      .innerJoin(viralTags, eq(viralTags.id, viralHookTags.tagId))
      .where(inArray(viralHookTags.savedVideoId, videoIds))
      .orderBy(asc(viralTags.name)),
  ])
  const names = new Map(projects.map((row) => [row.id, row.name]))
  const byVideo = new Map(videos.map((row) => [row.id, row]))
  const hooks: LibraryHook[] = []
  for (const savedVideoId of videoIds) {
    const video = byVideo.get(savedVideoId)
    const breakdown = video ? readStoredBreakdown(video.breakdown) : null
    const hook = breakdown ? hookLine(breakdown) : null
    if (!video || !hook || !isCreatorPlatform(video.platform)) continue
    const its = analyses.filter((row) => row.savedVideoId === savedVideoId)
    const projectsHere = [...new Set(its.flatMap((row) => (row.projectId && names.has(row.projectId) ? [row.projectId] : [])))]
    hooks.push({
      savedVideoId,
      key: `${video.platform}:${video.platformVideoId}`,
      platform: video.platform,
      title: video.title ?? video.sourceUrl,
      channelName: video.channelName ?? "",
      thumbnailUrl: video.thumbnailStoragePath
        ? await getPublicMediaUrl(video.thumbnailStoragePath)
        : video.platform === "youtube" && !video.platformVideoId.startsWith("sample-")
          ? `https://i.ytimg.com/vi/${video.platformVideoId}/hqdefault.jpg`
          : null,
      views: video.views,
      hook,
      projects: projectsHere.map((id) => ({ id, name: names.get(id) ?? "" })),
      tags: tags.filter((tag) => tag.savedVideoId === savedVideoId).map((tag) => tag.name),
      analysedAt: its[0].at.toISOString(),
    })
  }
  return hooks
}

/** The tags on one hook, saved as they change. */
export async function setHookTags(ownerId: string, savedVideoId: string, names: string[]): Promise<string[]> {
  const [video] = await db
    .select({ id: viralVideos.id })
    .from(viralVideos)
    .where(and(eq(viralVideos.id, savedVideoId), eq(viralVideos.ownerId, ownerId)))
  if (!video) throw viralSays("That video is gone.")
  const ids = await tagIds(ownerId, names)
  await db.transaction(async (tx) => {
    await tx.delete(viralHookTags).where(eq(viralHookTags.savedVideoId, video.id))
    if (ids.length) await tx.insert(viralHookTags).values(ids.map((tagId) => ({ savedVideoId: video.id, tagId })))
  })
  const rows = await db
    .select({ name: viralTags.name })
    .from(viralHookTags)
    .innerJoin(viralTags, eq(viralTags.id, viralHookTags.tagId))
    .where(eq(viralHookTags.savedVideoId, video.id))
    .orderBy(asc(viralTags.name))
  return rows.map((row) => row.name)
}
