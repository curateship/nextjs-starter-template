/**
 * The browser-safe half of project history: how often a version is kept, how
 * many, and the sentences both sides show. The database work lives in
 * `src/server/video/project-versions.ts`; nothing here may touch the server.
 * The rule itself is written up in `workspace/docs/project-history.md`.
 */

/** A save after this long without one keeps the timeline it replaces. */
export const BREAK_MS = 30 * 60_000

/** Otherwise one version an hour of editing, counted from the newest. */
export const HOURLY_MS = 60 * 60_000

/** The newest this many per project are kept; older ones are deleted. */
export const KEEP_VERSIONS = 20

export const VERSION_REASONS = ["break", "hourly", "restore"] as const
export type VersionReason = (typeof VERSION_REASONS)[number]

/** What the History list says about why a version was kept. */
export const VERSION_REASON_LABEL: Record<VersionReason, string> = {
  break: "Before a break",
  hourly: "Hourly",
  restore: "Before restoring",
}

export const VERSION_NOT_FOUND_MESSAGE =
  "That version is no longer kept. It may have been replaced by a newer one."
export const VERSION_UNREADABLE_MESSAGE =
  "That version was saved in a form the editor can no longer read, so it cannot be opened."
