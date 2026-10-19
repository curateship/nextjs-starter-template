/**
 * The words and shapes creators and saved videos are built from.
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

/**
 * What a saved video's job is doing. `waiting` is a row nobody has picked up
 * yet; `downloaded` is in the media library with no AI run, because it was
 * saved with Download alone; `ready` has a breakdown; `failed` keeps its
 * reason and can be retried.
 */
export const SAVED_VIDEO_STATUSES = [
  "waiting",
  "downloading",
  "downloaded",
  "analysing",
  "ready",
  "failed",
] as const

export type SavedVideoStatus = (typeof SAVED_VIDEO_STATUSES)[number]

/** The one line the right panel and the feed chip both show for a status. */
export const savedVideoStatusLabels: Record<SavedVideoStatus, string> = {
  waiting: "Waiting",
  downloading: "Downloading",
  downloaded: "Downloaded",
  analysing: "Watching it",
  ready: "Broken down",
  failed: "Failed",
}

/**
 * True while the job is still moving, so the screen keeps asking. A
 * `downloaded` video is finished: nothing moves until AI analyse is pressed.
 */
export function isSavedVideoWorking(status: SavedVideoStatus): boolean {
  return status === "waiting" || status === "downloading" || status === "analysing"
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
