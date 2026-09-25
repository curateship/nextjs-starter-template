/**
 * What the Viral page and its server half both need to know about a YouTube
 * Shorts search. Client-safe: no server imports, so the page can draw the
 * filter choices without pulling in the database.
 */

/** The time windows the page offers, in days. */
export const VIRAL_DAY_CHOICES = [7, 30, 90] as const
export type ViralDays = (typeof VIRAL_DAY_CHOICES)[number]

/**
 * Anything longer than this many seconds is not a Short and is dropped. The
 * API's own "short" filter means under 4 minutes, which lets 3:59 videos
 * through; YouTube's real Shorts limit is 3 minutes.
 */
export const SHORT_MAX_SECONDS = 180

/** A keyword longer than this is refused before anything is spent. */
export const VIRAL_KEYWORD_MAX = 100

/** Where a saved search ran. Tasks 09+ add more platforms to this list. */
export const VIRAL_PLATFORMS = ["youtube"] as const
export type ViralPlatform = (typeof VIRAL_PLATFORMS)[number]

export type ViralShort = {
  id: string
  /** The video's own page, opened in a new tab from the table. */
  url: string
  title: string
  channelId: string
  channelTitle: string
  publishedAt: string
  thumbnailUrl: string | null
  durationSeconds: number
  views: number
  /** Null when the channel hides the count. */
  likes: number | null
  comments: number | null
  subscribers: number | null
}

/** One saved search, as the past-keywords panel lists it. */
export type ViralSearchSummary = {
  id: string
  keyword: string
  platform: ViralPlatform
  days: ViralDays
  min_views: number
  ran_at: string
  result_count: number
}
