import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { isCreatorPlatform } from "@/lib/viral/creators"
import { SHORT_MAX_SECONDS, UNITS_PER_SEARCH, viralSays, YOUTUBE_QUOTA_MESSAGE, type ViralVideo } from "@/lib/viral/viral"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { readStoredBreakdown } from "@/server/viral/analysis"
import { refreshChannelUsuals } from "@/server/viral/outliers"
import { requireViralProjectBudget, viralProjectSpendMetadata } from "@/server/viral/project-spend"
import { scoreVideos, type UnscoredVideo } from "@/server/viral/project-view"
import { requireOwnedViralProject } from "@/server/viral/projects"
import {
  viralCreatorPosts,
  viralProjectResults,
  viralProjects,
  viralSameIdea,
  viralVideos,
  type ViralSameIdeaResultRow,
} from "@/server/viral/schema"
import { getYoutubeApiKey } from "@/server/viral/settings"
import { askWriter } from "@/server/viral/writer"
import { searchYoutubeVideos } from "@/server/viral/youtube"
import { queuedKeywordUnits, recordYoutubeUnits, youtubeUnitsLeftToday } from "@/server/viral/youtube-units"

/**
 * "Same idea, other creators" (`workspace/docs/finding-content.md`): one hit
 * can be luck, and ten creators winning with the same idea means the format
 * repeats. The AI reads the video's title, and its transcript when it has
 * been broken down, and writes one YouTube search line. That search costs
 * 102 units and finds the other versions. The original's own channel is left
 * out. Each one's Outlier figure comes from the channel figures Viral keeps,
 * read for the channels it doesn't have yet (2 units each, at most 25).
 *
 * The last search for each video in each project is kept, so the list comes
 * back on a reload without spending again.
 */

/** How far back the search looks: a format can have worked last year. */
const SAME_IDEA_DAYS = 365

const lineSchema = z.object({ line: z.string().min(2).max(120) })

export type SameIdeaView = {
  searchLine: string
  createdAt: string
  units: number
  videos: ViralVideo[]
}

type Original = { title: string; channelId: string; durationSeconds: number | null; transcript: string }

/** The kept search for this video, or null when it was never run. */
export async function loadSameIdea(
  ownerId: string,
  projectId: string,
  video: { platform: string; platformVideoId: string }
): Promise<SameIdeaView | null> {
  await requireOwnedViralProject(ownerId, projectId)
  const [row] = await db
    .select()
    .from(viralSameIdea)
    .where(
      and(
        eq(viralSameIdea.projectId, projectId),
        eq(viralSameIdea.platform, video.platform),
        eq(viralSameIdea.platformVideoId, video.platformVideoId)
      )
    )
  return row ? toView(ownerId, projectId, row) : null
}

export async function findSameIdea(
  ownerId: string,
  projectId: string,
  video: { platform: string; platformVideoId: string },
  fetchFn: typeof fetch = fetch
): Promise<SameIdeaView> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  if (project.isSample) {
    throw viralSays("A sample project's videos are made up, so there is nothing to search for. Make your own project to try it.")
  }
  if (!isCreatorPlatform(video.platform)) throw viralSays("That video's social isn't one Viral reads.")
  const original = await readOriginal(ownerId, projectId, video)
  if (!original) throw viralSays("That video is no longer in this project.")

  const apiKey = await getYoutubeApiKey()
  if (!apiKey) throw viralSays("Finding the same idea searches YouTube, so it needs the YouTube key. Paste one in Settings → YouTube first.")
  const left = (await youtubeUnitsLeftToday()) - (await queuedKeywordUnits()).searchUnits
  if (left < UNITS_PER_SEARCH) throw viralSays(YOUTUBE_QUOTA_MESSAGE)
  await requireViralProjectBudget(ownerId, projectId, project.spendLimitCents, 0)

  const { line } = await askWriter({
    userId: ownerId,
    feature: "viral_same_idea",
    metadata: viralProjectSpendMetadata(projectId),
    prompt: sameIdeaPrompt(original),
    schema: lineSchema,
    label: "The same-idea search line",
  })
  const searchLine = line.trim().replace(/\s+/g, " ").slice(0, 100)

  const answer = await searchYoutubeVideos(
    {
      keyword: searchLine,
      days: SAME_IDEA_DAYS,
      length: (original.durationSeconds ?? 0) > SHORT_MAX_SECONDS ? "long" : "shorts",
    },
    apiKey,
    fetchFn
  )
  await recordYoutubeUnits(answer.units, "viral_same_idea")
  const results: ViralSameIdeaResultRow[] = answer.videos
    .filter((found) => found.id !== video.platformVideoId && found.channelId !== original.channelId)
    .map((found) => ({
      platformVideoId: found.id,
      url: found.url,
      title: found.title,
      channelId: found.channelId,
      channelName: found.channelTitle,
      subscribers: found.subscribers,
      views: found.views,
      likes: found.likes,
      comments: found.comments,
      postedAt: found.publishedAt,
      durationSeconds: found.durationSeconds,
      thumbnailUrl: found.thumbnailUrl,
    }))
  const outlierUnits = await refreshChannelUsuals(
    ownerId,
    projectId,
    results.map((result) => result.channelId),
    apiKey,
    { fetchFn }
  ).catch((error) => {
    console.error("The same-idea Outlier figures were not read", error)
    return 0
  })

  const at = now()
  const units = answer.units + outlierUnits
  await db
    .update(viralProjects)
    .set({ unitsSpent: sql`${viralProjects.unitsSpent} + ${answer.units}` })
    .where(eq(viralProjects.id, projectId))
  const [row] = await db
    .insert(viralSameIdea)
    .values({ id: uuid(), ownerId, projectId, platform: video.platform, platformVideoId: video.platformVideoId, searchLine, results, units, createdAt: at })
    .onConflictDoUpdate({
      target: [viralSameIdea.projectId, viralSameIdea.platform, viralSameIdea.platformVideoId],
      set: { searchLine, results, units, createdAt: at },
    })
    .returning()
  return toView(ownerId, projectId, row)
}

async function toView(
  ownerId: string,
  projectId: string,
  row: typeof viralSameIdea.$inferSelect
): Promise<SameIdeaView> {
  const unscored: UnscoredVideo[] = row.results.map((result) => ({
    platform: "youtube",
    platformVideoId: result.platformVideoId,
    url: result.url,
    title: result.title,
    channelId: result.channelId,
    channelName: result.channelName,
    subscribers: result.subscribers,
    views: result.views,
    likes: result.likes,
    comments: result.comments,
    postedAt: result.postedAt || null,
    durationSeconds: result.durationSeconds,
    thumbnailUrl: result.thumbnailUrl,
    keywords: [],
    isNew: false,
    topicMatch: null,
    source: "search",
    sample: false,
  }))
  return {
    searchLine: row.searchLine,
    createdAt: row.createdAt.toISOString(),
    units: row.units,
    videos: await scoreVideos(ownerId, unscored, new Date(), projectId),
  }
}

/** The video's title, channel, length and spoken words, from wherever this project holds it. */
async function readOriginal(
  ownerId: string,
  projectId: string,
  video: { platform: string; platformVideoId: string }
): Promise<Original | null> {
  const [saved] = await db
    .select()
    .from(viralVideos)
    .where(and(eq(viralVideos.ownerId, ownerId), eq(viralVideos.platform, video.platform), eq(viralVideos.platformVideoId, video.platformVideoId)))
  const breakdown = saved?.status === "ready" ? readStoredBreakdown(saved.breakdown) : null
  const transcript = breakdown ? breakdown.transcript.map((line) => line.text).join(" ").slice(0, 4000) : ""

  const [result] = await db
    .select()
    .from(viralProjectResults)
    .where(and(eq(viralProjectResults.projectId, projectId), eq(viralProjectResults.platform, video.platform), eq(viralProjectResults.platformVideoId, video.platformVideoId)))
    .limit(1)
  if (result) return { title: result.title, channelId: result.channelId, durationSeconds: result.durationSeconds, transcript }

  const [post] = await db
    .select()
    .from(viralCreatorPosts)
    .where(and(eq(viralCreatorPosts.ownerId, ownerId), eq(viralCreatorPosts.platform, video.platform), eq(viralCreatorPosts.platformVideoId, video.platformVideoId)))
    .limit(1)
  if (post) return { title: post.title ?? "", channelId: "", durationSeconds: post.durationSeconds, transcript }

  if (saved) return { title: saved.title ?? "", channelId: saved.channelId ?? "", durationSeconds: saved.durationSeconds, transcript }
  return null
}

function sameIdeaPrompt(original: Original) {
  return [
    "A short video went viral. Write ONE YouTube search line, 3 to 7 words, that finds other creators' videos making the same idea.",
    "Name the idea itself, not this creator, not this exact title, and no hashtags.",
    `Title: ${original.title}`,
    original.transcript ? `What is said: ${original.transcript}` : "",
    'Answer as JSON: {"line": "..."}',
  ]
    .filter(Boolean)
    .join("\n")
}
