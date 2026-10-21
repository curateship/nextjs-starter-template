/**
 * What the Viral dashboard and its server half both need to know. Viral is a
 * list of projects: each is one niche, with a description and up to ten
 * keywords, and the app searches YouTube for the most viral videos on those
 * keywords. Client-safe: no server imports, so the screens can draw the
 * choices without pulling in the database.
 */

import type { CreatorPlatform } from "./creators"
import type { HookLine } from "./viral-breakdown"
import type { ViralScore } from "./viral-score"

/** The posted-within windows a project offers, in days. */
export const VIRAL_DAY_CHOICES = [7, 30, 90] as const
export type ViralDays = (typeof VIRAL_DAY_CHOICES)[number]

/**
 * Anything longer than this many seconds is not a Short. The API's own
 * "short" filter means under 4 minutes, which lets 3:59 videos through;
 * YouTube's real Shorts limit is 3 minutes.
 */
export const SHORT_MAX_SECONDS = 180

/** A keyword longer than this is refused before anything is spent. */
export const VIRAL_KEYWORD_MAX = 100

/** Nobody needs more keywords than this, and ten already costs 1,020 units. */
export const VIRAL_KEYWORDS_MAX = 10

export const VIRAL_PROJECT_NAME_MAX = 200
export const VIRAL_DESCRIPTION_MAX = 2000

/**
 * Which videos a project asks YouTube for. "both" runs two searches per
 * keyword, so it costs twice as much.
 */
export const VIRAL_VIDEO_LENGTHS = ["shorts", "long", "both"] as const
export type ViralVideoLength = (typeof VIRAL_VIDEO_LENGTHS)[number]

export const viralVideoLengthLabels: Record<ViralVideoLength, string> = {
  shorts: "Shorts (3 minutes or less)",
  long: "Longer videos",
  both: "Both",
}

/**
 * One YouTube keyword search: 100 units for the search, 1 for the videos'
 * numbers and 1 for their channels' subscriber counts.
 */
export const UNITS_PER_SEARCH = 102

/** YouTube's free daily allowance, shared by everything that calls it. */
export const YOUTUBE_DAILY_UNITS = 10_000

/** What one keyword costs at a project's length setting. */
export function unitsPerKeyword(length: ViralVideoLength) {
  return length === "both" ? UNITS_PER_SEARCH * 2 : UNITS_PER_SEARCH
}

export const VIRAL_KEYWORD_STATUSES = [
  "idle",
  "queued",
  "searching",
  "done",
  "failed",
] as const
export type ViralKeywordStatus = (typeof VIRAL_KEYWORD_STATUSES)[number]

export function isKeywordWorking(status: ViralKeywordStatus) {
  return status === "queued" || status === "searching"
}

export type ViralKeyword = {
  id: string
  keyword: string
  status: ViralKeywordStatus
  error: string | null
  ran_at: string | null
  units_spent: number
  /** How many of this keyword's videos are new since its last search. */
  new_count: number
  /** How many videos this keyword found, before any filter. */
  result_count: number
}

/** A video as the middle panel draws it, wherever it came from. */
export type ViralVideo = {
  /** `platform:platformVideoId`, unique within one screen. */
  key: string
  platform: CreatorPlatform
  platformVideoId: string
  url: string
  title: string
  channelId: string
  channelName: string
  subscribers: number | null
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: string | null
  durationSeconds: number | null
  thumbnailUrl: string | null
  score: ViralScore
  /** Which of the project's keywords found it. Empty for a creator's post. */
  keywords: string[]
  /** Not in the project before its keyword's last search. */
  isNew: boolean
  /** The AI's 0 to 100 for how well it fits the description, or null. */
  topicMatch: number | null
  /** Where it came from: a keyword search, a followed creator, or a pasted link. */
  source: "search" | "creator" | "link"
  /** Made up by "Add a sample project", so there is nothing to play. */
  sample: boolean
  /** The saved copy, when this person pressed Save & break down. */
  savedVideoId: string | null
  savedStatus: string | null
  /** The words of its hook, once it is broken down and something is said in it. */
  hook: HookLine | null
}

/** A channel as the Creators view lists it. */
export type ViralCreator = {
  /** `platform:channelId`, or `creator:<id>` for a followed creator. */
  key: string
  platform: CreatorPlatform
  /** YouTube's channel id, or null for a TikTok or Instagram creator. */
  channelId: string | null
  name: string
  handle: string | null
  subscribers: number | null
  /** How many of the project's results are theirs. */
  hits: number
  /** The middle score of their results, or null when they have none. */
  typicalScore: number | null
  /** Set when somebody follows them in this project. */
  followedId: string | null
  /**
   * Whether the watch timer checks a followed creator for new posts. Null for
   * a creator nobody follows, which the timer never checks.
   */
  watch: boolean | null
  /** When the watch timer last checked them. Null if never, or not followed. */
  lastCheckedAt: string | null
  avatarUrl: string | null
  profileUrl: string
  /** Videos a week over the last four weeks, or null with too few posts. */
  postsPerWeek: number | null
}

export type ViralProjectFilters = {
  days: ViralDays
  min_views: number
  min_score: number
  video_length: ViralVideoLength
}

export type ViralProjectItem = ViralProjectFilters & {
  id: string
  name: string
  description: string
  folder_id: string | null
  keywords: string[]
  pinned: boolean
  archived: boolean
  sample: boolean
  cover_url: string | null
  result_count: number
  units_spent: number
  spend_limit_cents: number | null
  updated_at: string
  /** True while any keyword is queued or being searched. */
  searching: boolean
}

export type ViralHiddenChannel = {
  platform: CreatorPlatform
  channelId: string
  channelName: string
}

/** An editor project Copy this made from this Viral project. */
export type ViralMadeProject = { id: string; name: string }

/** Everything the project screen opens with. */
export type ViralProjectScreen = {
  project: ViralProjectItem
  keywords: ViralKeyword[]
  videos: ViralVideo[]
  creators: ViralCreator[]
  hidden: ViralHiddenChannel[]
  made: ViralMadeProject[]
  spend: { total_cents: number; limit_cents: number | null }
}

/** "Video" or "Videos", with the count. */
export function countVideos(count: number) {
  return count === 1 ? "1 video" : `${count.toLocaleString()} videos`
}

/** The middle number of a list, or null when it is empty. */
export function typical(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

/**
 * Videos a week over the last four weeks, from the dates the creator posted.
 * Fewer than three known posts is too few to say anything.
 */
export function postsPerWeek(
  postedAt: (string | Date | null)[],
  now: Date = new Date()
): number | null {
  const known = postedAt
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((time) => Number.isFinite(time))
  if (known.length < 3) return null
  const since = now.getTime() - 28 * 24 * 60 * 60 * 1000
  const recent = known.filter((time) => time >= since).length
  return Math.round((recent / 4) * 10) / 10
}

/** Trims, collapses spaces and refuses empty or over-long keywords. */
export function cleanKeyword(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ")
  if (!cleaned) throw new Error("Type a keyword first.")
  if (cleaned.length > VIRAL_KEYWORD_MAX) {
    throw new Error(`A keyword can be at most ${VIRAL_KEYWORD_MAX} characters.`)
  }
  return cleaned
}

/**
 * The keywords as typed, cleaned, with repeats refused ignoring case and the
 * count capped. Throws the sentence the screen shows.
 */
export function cleanKeywords(values: string[]) {
  const cleaned = values.map(cleanKeyword)
  const seen = new Set<string>()
  for (const keyword of cleaned) {
    const key = keyword.toLowerCase()
    if (seen.has(key)) throw new Error(`"${keyword}" is in the list twice.`)
    seen.add(key)
  }
  if (cleaned.length > VIRAL_KEYWORDS_MAX) {
    throw new Error(`A project can have at most ${VIRAL_KEYWORDS_MAX} keywords.`)
  }
  return cleaned
}

/**
 * Marks an error whose message is already a finished sentence for the
 * screen. The server throws `viralSays("...")`, and the browser's error
 * lookup shows the words after the marker as they are.
 */
export const VIRAL_SAYS = "VIRAL_SAYS: "

export function viralSays(sentence: string) {
  return new Error(`${VIRAL_SAYS}${sentence}`)
}

export const VIRAL_PROJECT_NOT_FOUND = "That project is gone. Pick another from the list."

/** The one sentence for a used-up YouTube allowance, wherever it is found. */
export const YOUTUBE_QUOTA_MESSAGE =
  "Today's free YouTube allowance is used up. It resets at midnight Pacific time."
