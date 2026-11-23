/**
 * The facts about a video in a project that the browser and the server both
 * need (`workspace/docs/project-videos.md`). Browser-safe, like
 * `src/lib/video/projects.ts`.
 */

export const VIDEO_NOT_FOUND_MESSAGE = "Video not found"
export const VIDEO_NAME_REQUIRED_MESSAGE = "Video name is required"
export const VIDEO_NAME_MAX = 200

/** Where a video is in its life, set from its menu in the Videos tab. */
export const VIDEO_STATUSES = ["draft", "ready", "posted"] as const
export type VideoStatus = (typeof VIDEO_STATUSES)[number]

export const VIDEO_STATUS_LABELS: Record<VideoStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  posted: "Posted",
}

/** The orders the Videos tab can list a project's videos in. */
export const VIDEO_SORTS = ["edited", "newest", "name"] as const
export type VideoSort = (typeof VIDEO_SORTS)[number]

export const VIDEO_SORT_LABELS: Record<VideoSort, string> = {
  edited: "Last edited",
  newest: "Newest",
  name: "Name",
}

/** The name a brand new video gets, numbered so the list tells them apart. */
export function newVideoName(count: number) {
  return `Video ${count + 1}`
}
