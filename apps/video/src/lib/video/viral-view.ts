/**
 * What the Viral project screen does to its videos before drawing them: the
 * filters the project saves, the ones in the address, and the sort. Pure, so
 * the browser does it on every change without asking the server, and so it
 * can be tested on its own.
 */

import { typical, type ViralCreator, type ViralVideo } from "./viral"

/** A grid of covers or a list of rows, remembered per browser. */
export const VIRAL_LAYOUTS = ["grid", "list"] as const

/** The grid's three card sizes, remembered per browser. */
export const VIRAL_CARD_SIZES = ["small", "medium", "large"] as const
export type ViralCardSize = (typeof VIRAL_CARD_SIZES)[number]

/** The details a star keeps, taken from what the screen already shows. */
export function starredCopy(video: ViralVideo) {
  return {
    platform: video.platform,
    platformVideoId: video.platformVideoId,
    url: video.url,
    title: video.title,
    channelId: video.channelId,
    channelName: video.channelName,
    subscribers: video.subscribers,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    postedAt: video.postedAt,
    durationSeconds: video.durationSeconds,
    thumbnailUrl: video.thumbnailUrl,
  }
}

export const VIRAL_SORTS = [
  "score",
  "views",
  "views_per_day",
  "newest",
  "topic",
] as const
export type ViralSort = (typeof VIRAL_SORTS)[number]

export const viralSortLabels: Record<ViralSort, string> = {
  score: "Score",
  views: "Views",
  views_per_day: "Views per day",
  newest: "Newest",
  topic: "Fits the topic",
}

/** Where the Videos view's videos come from. */
export const VIRAL_SOURCES = ["search", "creators", "both"] as const
export type ViralSource = (typeof VIRAL_SOURCES)[number]

export const viralSourceLabels: Record<ViralSource, string> = {
  search: "Search",
  creators: "Followed creators",
  both: "Both",
}

/** The topic-match floors the Fit filter offers. 0 is no filter. */
export const VIRAL_FIT_CHOICES = [0, 40, 70] as const
export type ViralFit = (typeof VIRAL_FIT_CHOICES)[number]

export type ViralVideoFilter = {
  minViews: number
  minScore: number
  source: ViralSource
  /** Only videos this keyword found. */
  keyword: string | null
  /** Words that must be in the title or the channel name. */
  text: string
  /** Only videos the AI matched at least this well. 0 keeps every video. */
  minFit: number
}

export function filterVideos(
  videos: ViralVideo[],
  filter: ViralVideoFilter
): ViralVideo[] {
  const words = filter.text.trim().toLowerCase()
  return videos.filter((video) => {
    if (filter.source === "search" && video.source !== "search") return false
    if (filter.source === "creators" && video.source !== "creator") return false
    if ((video.views ?? 0) < filter.minViews) return false
    if (video.score.score < filter.minScore) return false
    if (filter.keyword && !video.keywords.includes(filter.keyword)) return false
    // A video the AI has not matched yet is kept: hiding it would make the
    // filter look like it removed something it never judged.
    if (filter.minFit > 0 && video.topicMatch !== null && video.topicMatch < filter.minFit) {
      return false
    }
    if (
      words &&
      !video.title.toLowerCase().includes(words) &&
      !video.channelName.toLowerCase().includes(words)
    ) {
      return false
    }
    return true
  })
}

export function sortVideos(
  videos: ViralVideo[],
  sort: ViralSort,
  direction: "asc" | "desc"
): ViralVideo[] {
  const factor = direction === "asc" ? 1 : -1
  const value = (video: ViralVideo): number => {
    switch (sort) {
      case "views":
        return video.views ?? -1
      case "views_per_day":
        return video.score.viewsPerDay ?? -1
      case "newest":
        return video.postedAt ? Date.parse(video.postedAt) : -1
      case "topic":
        return video.topicMatch ?? -1
      default:
        return video.score.score
    }
  }
  return [...videos].sort(
    (left, right) =>
      factor * (value(left) - value(right)) ||
      (right.views ?? 0) - (left.views ?? 0)
  )
}

export type SubscriberRange = { min: number | null; max: number | null }

/** The sizes the subscriber range offers, smallest first. */
export const SUBSCRIBER_STEPS = [
  1_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 10_000_000,
] as const

export function filterCreators(
  creators: ViralCreator[],
  range: SubscriberRange,
  text: string
): ViralCreator[] {
  const words = text.trim().toLowerCase()
  return creators.filter((creator) => {
    // A creator whose count is hidden is kept only when no range is set:
    // nobody can say whether they are inside it.
    if (range.min !== null || range.max !== null) {
      if (creator.subscribers === null) return false
      if (range.min !== null && creator.subscribers < range.min) return false
      if (range.max !== null && creator.subscribers > range.max) return false
    }
    if (
      words &&
      !creator.name.toLowerCase().includes(words) &&
      !(creator.handle ?? "").toLowerCase().includes(words)
    ) {
      return false
    }
    return true
  })
}

/** The left panel's figures, from the videos as filtered. */
export function atAGlance(videos: ViralVideo[], creators: ViralCreator[]) {
  return {
    videos: videos.length,
    creators: creators.length,
    bestScore: videos.length
      ? Math.max(...videos.map((video) => video.score.score))
      : null,
    typicalViews: typical(
      videos.flatMap((video) => (video.views === null ? [] : [video.views]))
    ),
  }
}
