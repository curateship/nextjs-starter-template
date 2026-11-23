import { and, asc, desc, eq, inArray } from "drizzle-orm"

import type { HookKind, LibraryHook, OwnLibraryHook, VideoLibraryHook } from "@/lib/viral/library"
import { isWinner } from "@/lib/viral/sounds"
import { hookLine } from "@/lib/viral/viral-breakdown"
import { viralSays } from "@/lib/viral/viral"
import { db } from "@/server/db"
import { readStoredBreakdown } from "@/server/viral/analysis"
import { typeIdOf } from "@/server/viral/hook-types"
import { pastedVideo, scoreVideos, type UnscoredVideo } from "@/server/viral/project-view"
import {
  viralAnalyses,
  viralHookTags,
  viralOwnHooks,
  viralOwnHookTags,
  viralProjects,
  viralTags,
  viralVideos,
  type ViralOwnHookRow,
} from "@/server/viral/schema"
import { tagIds } from "@/server/viral/vault"

/**
 * Library → Hooks (`workspace/docs/library.md`, task part 17, and
 * more-features parts 7 and 8): the opening line of every video Analyse with
 * AI has written about, across all the person's projects, and the hooks they
 * typed themselves, newest first. A video analysed in two projects is one row
 * naming both. Each carries its type and whether it is a winner. Nothing here
 * asks an AI.
 */
export async function listLibraryHooks(ownerId: string): Promise<LibraryHook[]> {
  const [videoHooks, ownHooks] = await Promise.all([listVideoHooks(ownerId), listOwnHooks(ownerId)])
  return [...videoHooks, ...ownHooks].sort((left, right) => right.at.localeCompare(left.at))
}

async function listVideoHooks(ownerId: string): Promise<VideoLibraryHook[]> {
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

  const found: { video: (typeof videos)[number]; unscored: UnscoredVideo; hook: NonNullable<ReturnType<typeof hookLine>> }[] = []
  for (const savedVideoId of videoIds) {
    const video = byVideo.get(savedVideoId)
    const breakdown = video ? readStoredBreakdown(video.breakdown) : null
    const hook = breakdown ? hookLine(breakdown) : null
    const unscored = video && hook ? await pastedVideo(video) : null
    if (video && hook && unscored) found.push({ video, unscored, hook })
  }
  // A winner by the Sounds tab's rule: the Outlier badge, or a score of 70 or more.
  const scored = found.length ? await scoreVideos(ownerId, found.map((one) => one.unscored)) : []
  const winners = new Set(scored.filter(isWinner).map((video) => video.key))

  return found.map(({ video, unscored, hook }) => {
    const its = analyses.filter((row) => row.savedVideoId === video.id)
    const projectsHere = [...new Set(its.flatMap((row) => (row.projectId && names.has(row.projectId) ? [row.projectId] : [])))]
    const key = `${video.platform}:${video.platformVideoId}`
    return {
      kind: "video",
      id: video.id,
      key,
      platform: unscored.platform,
      title: unscored.title,
      channelName: unscored.channelName,
      thumbnailUrl:
        unscored.thumbnailUrl ??
        (video.platform === "youtube" && !video.platformVideoId.startsWith("sample-")
          ? `https://i.ytimg.com/vi/${video.platformVideoId}/hqdefault.jpg`
          : null),
      views: video.views,
      text: hook.text,
      hook,
      projects: projectsHere.map((id) => ({ id, name: names.get(id) ?? "" })),
      tags: tags.filter((tag) => tag.savedVideoId === video.id).map((tag) => tag.name),
      typeId: typeIdOf(video),
      winner: winners.has(key),
      at: its[0].at.toISOString(),
    }
  })
}

/** Your own hooks, each with its tags. */
async function listOwnHooks(ownerId: string): Promise<OwnLibraryHook[]> {
  const rows = await db
    .select()
    .from(viralOwnHooks)
    .where(eq(viralOwnHooks.ownerId, ownerId))
    .orderBy(desc(viralOwnHooks.createdAt))
  if (!rows.length) return []
  const tags = await ownHookTags(rows.map((row) => row.id))
  return rows.map((row) => toOwnHook(row, tags.get(row.id) ?? []))
}

export function toOwnHook(row: ViralOwnHookRow, tags: string[]): OwnLibraryHook {
  return {
    kind: "own",
    id: row.id,
    text: row.words,
    link: row.link,
    tags,
    typeId: typeIdOf(row),
    winner: false,
    at: row.createdAt.toISOString(),
  }
}

export async function ownHookTags(ownHookIds: string[]): Promise<Map<string, string[]>> {
  const byHook = new Map<string, string[]>()
  if (!ownHookIds.length) return byHook
  const rows = await db
    .select({ ownHookId: viralOwnHookTags.ownHookId, name: viralTags.name })
    .from(viralOwnHookTags)
    .innerJoin(viralTags, eq(viralTags.id, viralOwnHookTags.tagId))
    .where(inArray(viralOwnHookTags.ownHookId, ownHookIds))
    .orderBy(asc(viralTags.name))
  for (const row of rows) byHook.set(row.ownHookId, [...(byHook.get(row.ownHookId) ?? []), row.name])
  return byHook
}

/** The tags on one hook, an analysed video's or your own, saved as they change. */
export async function setHookTags(ownerId: string, kind: HookKind, hookId: string, names: string[]): Promise<string[]> {
  if (kind === "own") {
    const [hook] = await db
      .select({ id: viralOwnHooks.id })
      .from(viralOwnHooks)
      .where(and(eq(viralOwnHooks.id, hookId), eq(viralOwnHooks.ownerId, ownerId)))
    if (!hook) throw viralSays("That hook is gone.")
    const ids = await tagIds(ownerId, names)
    await db.transaction(async (tx) => {
      await tx.delete(viralOwnHookTags).where(eq(viralOwnHookTags.ownHookId, hook.id))
      if (ids.length) await tx.insert(viralOwnHookTags).values(ids.map((tagId) => ({ ownHookId: hook.id, tagId })))
    })
    return (await ownHookTags([hook.id])).get(hook.id) ?? []
  }
  const [video] = await db
    .select({ id: viralVideos.id })
    .from(viralVideos)
    .where(and(eq(viralVideos.id, hookId), eq(viralVideos.ownerId, ownerId)))
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
