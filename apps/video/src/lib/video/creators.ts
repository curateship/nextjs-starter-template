/**
 * The words and shapes the research dashboard is built from.
 *
 * Pure data, in `lib/` because both halves need it: the server fills these in
 * and the browser draws them. Nothing here reaches the database or the network,
 * so a component can import it without dragging the server in.
 */

/** Where a creator posts. The three the app can read uploads from. */
export const CREATOR_PLATFORMS = ["youtube", "tiktok", "instagram"] as const

export type CreatorPlatform = (typeof CREATOR_PLATFORMS)[number]

export function isCreatorPlatform(value: string): value is CreatorPlatform {
  return (CREATOR_PLATFORMS as readonly string[]).includes(value)
}

/** What each platform is called on screen, and where a profile link goes. */
export const creatorPlatformLabels: Record<CreatorPlatform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
}

/** A folder name longer than this is refused, matching the column. */
export const CREATOR_FOLDER_NAME_MAX = 80

/** Nobody needs more folders than this, and the cap keeps the panel readable. */
export const MAX_CREATOR_FOLDERS = 100

/** How many feed rows one page of the middle panel holds. */
export const CREATOR_FEED_PAGE = 50

/**
 * How many of a creator's newest posts the views-per-day pace is worked out
 * from. Ten is what the watch tick fetches each time, so the pace is read from
 * what is already there rather than asking for more.
 */
export const CREATOR_PACE_SAMPLE = 10

export type CreatorFolder = {
  id: string
  name: string
  position: number
  hidden: boolean
  /** Which creators are in it. A creator may be in several folders. */
  creatorIds: string[]
}

export type ResearchCreator = {
  id: string
  platform: CreatorPlatform
  handle: string
  displayName: string | null
  followerCount: number | null
  profileUrl: string
  /** True while the watch timer is checking this creator for new posts. */
  watch: boolean
  lastCheckedAt: string | null
  /** Served by the app's own route when the avatar was stored, else null. */
  avatarUrl: string | null
  /**
   * Views a day across the creator's newest posts, or null when none of them
   * carry a view count. A pace, not a score: it says how fast this creator's
   * recent work is being watched, nothing about whether it is good.
   */
  viewsPerDay: number | null
}

/**
 * What a saved video's job is doing. `waiting` is a row nobody has picked up
 * yet; `ready` has a breakdown; `failed` keeps its reason and can be retried.
 */
export const SAVED_VIDEO_STATUSES = [
  "waiting",
  "downloading",
  "analysing",
  "ready",
  "failed",
] as const

export type SavedVideoStatus = (typeof SAVED_VIDEO_STATUSES)[number]

/** The one line the right panel and the feed chip both show for a status. */
export const savedVideoStatusLabels: Record<SavedVideoStatus, string> = {
  waiting: "Waiting",
  downloading: "Downloading",
  analysing: "Watching it",
  ready: "Broken down",
  failed: "Failed",
}

/** True while the job is still moving, so the screen keeps asking. */
export function isSavedVideoWorking(status: SavedVideoStatus): boolean {
  return status === "waiting" || status === "downloading" || status === "analysing"
}

export type CreatorPost = {
  id: string
  creatorId: string
  creatorHandle: string
  creatorDisplayName: string | null
  platform: CreatorPlatform
  platformVideoId: string
  url: string
  title: string | null
  thumbnailUrl: string | null
  durationSeconds: number | null
  views: number | null
  likes: number | null
  comments: number | null
  /** When the creator posted it, or when the watch timer first saw it. */
  postedAt: string | null
  firstSeenAt: string
  /**
   * The saved copy's state when this video has one, else null. Read by joining
   * the archive on platform and video id, never stored on the post itself, so
   * a video saved from the Viral page lights up here with no extra bookkeeping.
   */
  savedStatus: SavedVideoStatus | null
  savedVideoId: string | null
}

/** Which creators the middle panel is showing. A creator beats a folder. */
export type CreatorFeedScope = {
  folderId: string | null
  creatorId: string | null
}

export const EVERYONE_SCOPE: CreatorFeedScope = {
  folderId: null,
  creatorId: null,
}

export type CreatorFeedView = {
  posts: CreatorPost[]
  /** True when there are older posts behind the ones sent. */
  more: boolean
  /** How many posts the scope holds in all. */
  held: number
}

export type CreatorResearchData = CreatorFeedView & {
  folders: CreatorFolder[]
  creators: ResearchCreator[]
  /** False when no YouTube key is saved, which the panel says once. */
  youtubeKeyConfigured: boolean
}

/**
 * A number a person can read at a glance: 12,400 becomes "12.4k". Counts a
 * platform hides are null and show as a dash, never a zero.
 */
export function formatCount(value: number | null): string {
  if (value === null) return "—"
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${trimZero(value / 1_000)}k`
  return `${trimZero(value / 1_000_000)}m`
}

function trimZero(value: number): string {
  const rounded = value.toFixed(1)
  return rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded
}

/** "2:05" from 125 seconds. Blank when the platform did not say. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return ""
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`
}
