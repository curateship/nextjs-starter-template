import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import {
  isCreatorPlatform,
  type CreatorPlatform,
} from "@/lib/viral/creators"
import {
  postsPerWeek,
  typical,
  type ViralCreator,
  type ViralKeyword,
  type ViralKeywordStatus,
  type ViralProjectScreen,
  type ViralVideo,
} from "@/lib/viral/viral"
import { hookLine } from "@/lib/viral/viral-breakdown"
import { outlierFor } from "@/lib/viral/outlier"
import { scoreViralVideo } from "@/lib/viral/viral-score"
import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import {
  viralChannelUsual,
  viralCreatorPosts,
  viralCreators,
  viralVaultItems,
  viralAnalyses,
  viralProjectCreators,
  viralProjectHiddenChannels,
  viralProjectKeywords,
  viralProjectLinks,
  viralProjectResults,
  viralVideos,
  type ViralProjectResultRow,
} from "@/server/viral/schema"
import { coverUrl } from "@/server/viral/creators/covers"
import { readStoredBreakdown } from "@/server/viral/analysis"
import {
  getViralProjectItem,
  requireOwnedViralProject,
} from "@/server/viral/projects"

/**
 * Everything one Viral project's screen shows, read in one go.
 *
 * Nothing here calls YouTube. The results are what each keyword's last
 * search saved, plus the followed creators' posts and the videos pasted in by
 * their links. The creators are worked out from those results plus the ones
 * followed in this project, and every score is worked out on this read and
 * never stored, so it moves as a video ages. Hidden channels are taken out
 * here, so the browser never sees them.
 */

/** How many of the followed creators' newest posts the grid can show. */
const CREATOR_POSTS_SHOWN = 200

export async function loadViralProjectScreen(
  ownerId: string,
  projectId: string
): Promise<ViralProjectScreen> {
  const row = await requireOwnedViralProject(ownerId, projectId)
  const [project, keywordRows, resultRows, hidden, followed, pastedRows] =
    await Promise.all([
      getViralProjectItem(ownerId, projectId),
      db
        .select()
        .from(viralProjectKeywords)
        .where(eq(viralProjectKeywords.projectId, projectId))
        .orderBy(
          asc(viralProjectKeywords.position),
          asc(viralProjectKeywords.createdAt)
        ),
      db
        .select()
        .from(viralProjectResults)
        .where(eq(viralProjectResults.projectId, projectId)),
      db
        .select()
        .from(viralProjectHiddenChannels)
        .where(eq(viralProjectHiddenChannels.projectId, projectId)),
      db
        .select({ creator: viralCreators })
        .from(viralProjectCreators)
        .innerJoin(
          viralCreators,
          eq(viralCreators.id, viralProjectCreators.creatorId)
        )
        .where(
          and(
            eq(viralProjectCreators.projectId, projectId),
            eq(viralCreators.ownerId, ownerId)
          )
        ),
      db
        .select({ video: viralVideos })
        .from(viralProjectLinks)
        .innerJoin(
          viralVideos,
          eq(viralVideos.id, viralProjectLinks.savedVideoId)
        )
        .where(
          and(
            eq(viralProjectLinks.projectId, projectId),
            eq(viralVideos.ownerId, ownerId)
          )
        )
        .orderBy(desc(viralProjectLinks.createdAt)),
    ])

  const hiddenKeys = new Set(
    hidden.map((channel) => `${channel.platform}:${channel.channelId}`)
  )
  const keywordNames = new Map(keywordRows.map((one) => [one.id, one.keyword]))
  const visibleResults = resultRows.filter(
    (result) => !hiddenKeys.has(`${result.platform}:${result.channelId}`)
  )

  const followedCreators = followed.map((one) => one.creator)
  const posts = followedCreators.length
    ? await db
        .select()
        .from(viralCreatorPosts)
        .where(
          and(
            eq(viralCreatorPosts.ownerId, ownerId),
            inArray(
              viralCreatorPosts.creatorId,
              followedCreators.map((creator) => creator.id)
            )
          )
        )
        .orderBy(
          desc(
            sql`coalesce(${viralCreatorPosts.postedAt}, ${viralCreatorPosts.firstSeenAt})`
          )
        )
        .limit(CREATOR_POSTS_SHOWN)
    : []

  const searched = mergeResults(visibleResults, keywordNames, row.isSample)
  const covers = await Promise.all(posts.map(coverUrl))
  const fromCreators = posts.flatMap((post, index) => {
    const creator = followedCreators.find((one) => one.id === post.creatorId)
    if (!creator || !isCreatorPlatform(post.platform)) return []
    const channelId = creatorChannelId(creator)
    if (hiddenKeys.has(`${post.platform}:${channelId}`)) return []
    return [
      {
        platform: post.platform,
        platformVideoId: post.platformVideoId,
        url: post.url,
        title: post.title ?? "Untitled",
        channelId,
        channelName: creator.displayName ?? `@${creator.handle}`,
        subscribers: creator.followerCount,
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        postedAt: post.postedAt?.toISOString() ?? null,
        durationSeconds: post.durationSeconds,
        thumbnailUrl: covers[index],
        keywords: [],
        isNew: false,
        topicMatch: null,
        source: "creator" as const,
        sample: false,
      },
    ]
  })

  const pasted = (
    await Promise.all(pastedRows.map(({ video }) => pastedVideo(video)))
  ).filter(
    (video): video is UnscoredVideo =>
      video !== null && !hiddenKeys.has(`${video.platform}:${video.channelId}`)
  )

  // A followed creator's post that a keyword also found is one card, the
  // search's, which knows its keywords. A pasted video that either found is
  // that card too.
  const seen = new Set<string>()
  const videos = await scoreVideos(
    ownerId,
    [...searched, ...fromCreators, ...pasted].filter((video) => {
      const key = `${video.platform}:${video.platformVideoId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
    new Date(),
    projectId
  )

  const keywords: ViralKeyword[] = keywordRows.map((keyword) => {
    const mine = visibleResults.filter((result) => result.keywordId === keyword.id)
    return {
      id: keyword.id,
      keyword: keyword.keyword,
      status: keyword.status as ViralKeywordStatus,
      error: keyword.error,
      ran_at: keyword.ranAt?.toISOString() ?? null,
      units_spent: keyword.unitsSpent,
      new_count: mine.filter((result) => result.isNew).length,
      result_count: mine.length,
    }
  })

  return {
    project,
    keywords,
    videos,
    creators: listCreators(videos, followedCreators, posts),
    hidden: hidden.flatMap((channel) =>
      isCreatorPlatform(channel.platform)
        ? [
            {
              platform: channel.platform,
              channelId: channel.channelId,
              channelName: channel.channelName,
            },
          ]
        : []
    ),
  }
}

/** A followed creator's stand-in for a channel id: YouTube's own, or @handle. */
export function creatorChannelId(creator: {
  platformChannelId: string | null
  handle: string
}) {
  return creator.platformChannelId ?? `@${creator.handle}`
}

export type UnscoredVideo = Omit<
  ViralVideo,
  "key" | "score" | "savedVideoId" | "savedStatus" | "hook" | "outlier" | "vaultItemId" | "analysed"
>

/**
 * A pasted video, drawn from its saved row. Until the download lands the row
 * knows only its link, so the title is the link and the figures are blank.
 */
async function pastedVideo(
  row: typeof viralVideos.$inferSelect
): Promise<UnscoredVideo | null> {
  if (!isCreatorPlatform(row.platform)) return null
  return {
    platform: row.platform,
    platformVideoId: row.platformVideoId,
    url: row.sourceUrl,
    title: row.title ?? row.sourceUrl,
    channelId: row.channelId ?? "",
    channelName: row.channelName ?? "",
    subscribers: row.subscribers,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    postedAt: row.postedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    thumbnailUrl: row.thumbnailStoragePath
      ? await getPublicMediaUrl(row.thumbnailStoragePath)
      : null,
    keywords: [],
    isNew: false,
    topicMatch: null,
    source: "link",
    sample: false,
  }
}

/**
 * One entry per video. Two keywords finding the same video is one card that
 * names both keywords, carries the newer numbers, and is new if either
 * search found it new.
 */
function mergeResults(
  rows: ViralProjectResultRow[],
  keywordNames: Map<string, string>,
  sample: boolean
): UnscoredVideo[] {
  const byVideo = new Map<string, UnscoredVideo>()
  for (const row of rows) {
    if (!isCreatorPlatform(row.platform)) continue
    const key = `${row.platform}:${row.platformVideoId}`
    const keyword = keywordNames.get(row.keywordId)
    const seen = byVideo.get(key)
    if (seen) {
      if (keyword && !seen.keywords.includes(keyword)) seen.keywords.push(keyword)
      seen.isNew = seen.isNew || row.isNew
      seen.topicMatch = seen.topicMatch ?? row.topicMatch
      if ((row.views ?? 0) > (seen.views ?? 0)) {
        seen.views = row.views
        seen.likes = row.likes
        seen.comments = row.comments
      }
      continue
    }
    byVideo.set(key, {
      platform: row.platform,
      platformVideoId: row.platformVideoId,
      url: row.url,
      title: row.title,
      channelId: row.channelId,
      channelName: row.channelName,
      subscribers: row.subscribers,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      postedAt: row.postedAt?.toISOString() ?? null,
      durationSeconds: row.durationSeconds,
      thumbnailUrl: row.thumbnailUrl,
      keywords: keyword ? [keyword] : [],
      isNew: row.isNew,
      topicMatch: row.topicMatch,
      source: "search",
      sample,
    })
  }
  return [...byVideo.values()]
}

/**
 * Each channel's recent uploads' views, for the Outlier figure: the YouTube
 * figures kept in `viral_channel_usual`, and the followed creators' own
 * listed posts, which cost nothing to read. A kept figure wins, because it
 * reads 30 uploads where a followed creator's list holds 10.
 */
async function recentViewsByChannel(ownerId: string, videos: UnscoredVideo[]) {
  const byChannel = new Map<string, Record<string, number>>()
  const channelIds = [...new Set(videos.map((video) => video.channelId).filter(Boolean))]
  if (!channelIds.length) return byChannel
  const [kept, posts] = await Promise.all([
    db
      .select({
        platform: viralChannelUsual.platform,
        channelId: viralChannelUsual.channelId,
        recentViews: viralChannelUsual.recentViews,
      })
      .from(viralChannelUsual)
      .where(and(eq(viralChannelUsual.ownerId, ownerId), inArray(viralChannelUsual.channelId, channelIds))),
    db
      .select({
        platform: viralCreatorPosts.platform,
        platformVideoId: viralCreatorPosts.platformVideoId,
        views: viralCreatorPosts.views,
        platformChannelId: viralCreators.platformChannelId,
        handle: viralCreators.handle,
      })
      .from(viralCreatorPosts)
      .innerJoin(viralCreators, eq(viralCreators.id, viralCreatorPosts.creatorId))
      .where(eq(viralCreatorPosts.ownerId, ownerId)),
  ])
  for (const post of posts) {
    if (post.views === null) continue
    const key = `${post.platform}:${creatorChannelId(post)}`
    const views = byChannel.get(key) ?? {}
    views[post.platformVideoId] = post.views
    byChannel.set(key, views)
  }
  for (const row of kept) byChannel.set(`${row.platform}:${row.channelId}`, row.recentViews)
  return byChannel
}

/** Which of these videos are in the project's vault, by `platform:platformVideoId`. */
async function vaultItemsByKey(ownerId: string, projectId: string) {
  const rows = await db
    .select({ id: viralVaultItems.id, platform: viralVaultItems.platform, platformVideoId: viralVaultItems.platformVideoId })
    .from(viralVaultItems)
    .where(and(eq(viralVaultItems.ownerId, ownerId), eq(viralVaultItems.projectId, projectId)))
  return new Map(rows.map((row) => [`${row.platform}:${row.platformVideoId}`, row.id]))
}

/**
 * Adds the score, the Outlier figure, the saved copy, the vault item and the
 * hook's words to each video. A video this person has already had broken
 * down scores its breakdown part; every other one scores 0 there and says
 * the breakdown is missing.
 */
export async function scoreVideos(
  ownerId: string,
  videos: UnscoredVideo[],
  at: Date = new Date(),
  projectId: string | null = null
): Promise<ViralVideo[]> {
  const [recentViews, vault] = await Promise.all([
    recentViewsByChannel(ownerId, videos),
    projectId ? vaultItemsByKey(ownerId, projectId) : Promise.resolve(new Map<string, string>()),
  ])
  const byPlatform = new Map<string, string[]>()
  for (const video of videos) {
    const ids = byPlatform.get(video.platform) ?? []
    ids.push(video.platformVideoId)
    byPlatform.set(video.platform, ids)
  }
  const saved = (
    await Promise.all(
      [...byPlatform].map(([platform, ids]) =>
        db
          .select({
            id: viralVideos.id,
            platform: viralVideos.platform,
            platformVideoId: viralVideos.platformVideoId,
            status: viralVideos.status,
            breakdown: viralVideos.breakdown,
          })
          .from(viralVideos)
          .where(
            and(
              eq(viralVideos.ownerId, ownerId),
              eq(viralVideos.platform, platform),
              inArray(viralVideos.platformVideoId, ids)
            )
          )
      )
    )
  ).flat()
  const savedByKey = new Map(
    saved.map((row) => [`${row.platform}:${row.platformVideoId}`, row])
  )
  // Which saved copies have an analysis written, for the Analysed tab.
  const analysedIds = saved.length
    ? new Set(
        (
          await db
            .selectDistinct({ id: viralAnalyses.savedVideoId })
            .from(viralAnalyses)
            .where(and(eq(viralAnalyses.ownerId, ownerId), inArray(viralAnalyses.savedVideoId, saved.map((row) => row.id))))
        ).map((row) => row.id)
      )
    : new Set<string>()

  return videos.map((video) => {
    const key = `${video.platform}:${video.platformVideoId}`
    const copy = savedByKey.get(key)
    const breakdown =
      copy?.status === "ready" ? readStoredBreakdown(copy.breakdown) : null
    return {
      ...video,
      key,
      savedVideoId: copy?.id ?? null,
      savedStatus: copy?.status ?? null,
      hook: breakdown ? hookLine(breakdown) : null,
      outlier: outlierFor(video, recentViews.get(`${video.platform}:${video.channelId}`)),
      vaultItemId: vault.get(key) ?? null,
      analysed: copy ? analysedIds.has(copy.id) : false,
      score: scoreViralVideo({
        views: video.views,
        likes: video.likes,
        comments: video.comments,
        postedAt: video.postedAt,
        followers: video.subscribers,
        breakdown,
        now: at,
      }),
    }
  })
}

/**
 * The Creators view: every channel behind the project's results, plus every
 * creator followed in it, most hits first. A followed YouTube channel that
 * also has results is one entry, not two.
 */
function listCreators(
  videos: ViralVideo[],
  followed: (typeof viralCreators.$inferSelect)[],
  posts: (typeof viralCreatorPosts.$inferSelect)[]
): ViralCreator[] {
  const found = new Map<
    string,
    {
      platform: CreatorPlatform
      channelId: string
      name: string
      subscribers: number | null
      scores: number[]
      sample: boolean
    }
  >()
  for (const video of videos) {
    if (video.source !== "search") continue
    const key = `${video.platform}:${video.channelId}`
    const entry = found.get(key) ?? {
      platform: video.platform,
      channelId: video.channelId,
      name: video.channelName,
      subscribers: video.subscribers,
      scores: [],
      sample: video.sample,
    }
    entry.scores.push(video.score.score)
    found.set(key, entry)
  }

  const creators: ViralCreator[] = []
  const followedKeys = new Set<string>()
  for (const creator of followed) {
    if (!isCreatorPlatform(creator.platform)) continue
    const channelId = creatorChannelId(creator)
    const key = `${creator.platform}:${channelId}`
    followedKeys.add(key)
    const results = found.get(key)
    const theirPosts = posts.filter((post) => post.creatorId === creator.id)
    const theirScores = videos
      .filter((video) => video.channelId === channelId)
      .map((video) => video.score.score)
    creators.push({
      key,
      platform: creator.platform,
      channelId: creator.platformChannelId,
      name: creator.displayName ?? `@${creator.handle}`,
      handle: creator.handle,
      subscribers: creator.followerCount ?? results?.subscribers ?? null,
      hits: results?.scores.length ?? 0,
      typicalScore: typical(theirScores),
      followedId: creator.id,
      watch: creator.watch,
      lastCheckedAt: creator.lastCheckedAt?.toISOString() ?? null,
      avatarUrl: creator.avatarStoragePath
        ? `/api/v1/viral/creators/${creator.id}/avatar`
        : null,
      profileUrl: creator.profileUrl,
      postsPerWeek: postsPerWeek(
        theirPosts.map((post) => post.postedAt ?? post.firstSeenAt)
      ),
    })
  }

  for (const [key, entry] of found) {
    if (followedKeys.has(key)) continue
    creators.push({
      key,
      platform: entry.platform,
      channelId: entry.channelId,
      name: entry.name,
      handle: null,
      subscribers: entry.subscribers,
      hits: entry.scores.length,
      typicalScore: typical(entry.scores),
      followedId: null,
      watch: null,
      lastCheckedAt: null,
      avatarUrl: null,
      // A sample channel is made up, so there is nowhere to send anyone.
      profileUrl:
        entry.platform === "youtube" && !entry.sample
          ? `https://www.youtube.com/channel/${encodeURIComponent(entry.channelId)}`
          : "",
      postsPerWeek: null,
    })
  }

  return creators.sort(
    (left, right) =>
      right.hits - left.hits ||
      (right.typicalScore ?? -1) - (left.typicalScore ?? -1) ||
      left.name.localeCompare(right.name)
  )
}
