/**
 * Import from a link (`workspace/docs/import-from-a-link.md`): the words and
 * shapes both halves need. The server fills these in and the Media panel
 * draws them.
 */

import type { SavedVideoPlatform } from "@/lib/video/saved-video"

/** How many links one paste may hold. */
export const LINK_IMPORT_PER_PASTE = 20

/**
 * `waiting` is a row nobody has picked up yet, `done` is a file on the
 * project's shelf, and `failed` keeps its reason for Try again.
 */
export type LinkImportStatus = "waiting" | "downloading" | "done" | "failed"

/** One import still on its way, or one that failed, as its tile draws it. */
export type LinkImportItem = {
  id: string
  status: Exclude<LinkImportStatus, "done">
  error: string | null
  platform: SavedVideoPlatform
  title: string | null
  source_url: string
}

/** What a paste started, and each line it left out with the reason. */
export type LinkImportStartResult = {
  started: number
  skipped: { link: string; reason: string }[]
}

/** Where an imported file came from, read back for its right-click. */
export type LinkImportSource = {
  url: string
  handle: string | null
}

export const LINK_IMPORT_PLATFORM_NAMES: Record<SavedVideoPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
}

export const LINK_IMPORT_BAD_LINK =
  "Only YouTube, TikTok and Instagram video links can be imported."
export const LINK_IMPORT_ALREADY_HERE = "Already in this project"
export const LINK_IMPORT_TOO_BIG = "Over 100MB, too big to import."
export const LINK_IMPORT_TOO_MANY = `Paste at most ${LINK_IMPORT_PER_PASTE} links at a time.`
export const LINK_IMPORT_NONE = "Paste at least one link."
/** Thrown by Try again and Remove on an import that is not there to change. */
export const LINK_IMPORT_NOT_FOUND = "LINK_IMPORT_NOT_FOUND"

/**
 * The lines of a paste, trimmed, blank ones dropped and repeats taken out, in
 * the order they were pasted.
 */
export function splitPastedLinks(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  )
}
