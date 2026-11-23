import type { BackgroundReference } from "@/lib/pomodoro/background-catalog"
import type {
  PomodoroUploadKind,
  PomodoroUploadPurpose,
} from "@/lib/pomodoro/media-limits"
import type { SoundReference } from "@/lib/pomodoro/sound-catalog"

/**
 * Shared sounds and backgrounds, the browser-safe half: the wording, the page
 * sizes and the shapes the server hands to a page. See
 * `workspace/docs/shared-media.md`.
 */

/** The second tick under Share. Both must be ticked to share a file. */
export const SHARE_RIGHTS_LABEL =
  "I made this, or I have the right to share it. Files that break someone's copyright are taken down."

/** "Shared by members" is paged on the server, this many at a time. */
export const SHARED_PAGE_SIZE = 20

/** The public page's cards show the newest few, then "Show all". */
export const PROFILE_SHARED_COUNT = 8

/** Below this a "Used by" count is hidden, so it never points at one person. */
export const USED_BY_FLOOR = 3

/**
 * Where an owner's file stands: not shared, waiting for an admin's first
 * check, out for everyone, or taken off sharing by an admin.
 */
export type ShareState = "off" | "waiting" | "on" | "taken_down"

/**
 * Who a shared file is by. `handle` is set only while the owner's public
 * page answers, so the credit can link to it; otherwise the line says "by a
 * member" and names nobody.
 */
export type MediaCredit = { handle: string | null }

export function creditLabel(credit: MediaCredit) {
  return credit.handle ? `by @${credit.handle}` : "by a member"
}

/** A shared file's own page. */
export function sharedFilePath(handle: string, mediaId: string) {
  return `/u/${handle}/files/${mediaId}`
}

export type SharedSort = "newest" | "most_used"

/** Which list a page asks for. */
export type SharedScope = "everyone" | "saved"

/** One shared file as a list or a page draws it. */
export type SharedMediaItem = {
  mediaId: string
  purpose: PomodoroUploadPurpose
  kind: PomodoroUploadKind
  name: string
  tags: string[]
  url: string
  /** A clip's middle frame, or empty. */
  stillUrl: string
  credit: MediaCredit
  /** People with it in their room, or null below `USED_BY_FLOOR`. */
  usedBy: number | null
  /** The viewer saved it with the heart. */
  saved: boolean
  /** The viewer's own file. */
  own: boolean
  sharedAt: string
}

export type SharedMediaPage = {
  items: SharedMediaItem[]
  total: number
  /** Tags on the shared files of this kind, for the filter. */
  tags: string[]
}

/** "You can share 10 files a day. Try again tomorrow." */
export function shareLimitMessage(limit: number) {
  return `You can share ${limit} ${limit === 1 ? "file" : "files"} a day. Try again tomorrow.`
}

/**
 * The refusals a share can meet, read by every place that saves a Share
 * tick. The daily limit carries its number in the code, so it is read
 * separately by `shareRefusal`.
 */
export const SHARE_MESSAGES = {
  SHARE_NOT_CONFIRMED:
    "Tick that you made this or have the right to share it, then try again.",
  SHARE_TAKEN_DOWN:
    "An admin took this file off sharing, so it cannot be shared again.",
  SHARED_MEDIA_NOT_FOUND: "That file is no longer shared.",
  SHARED_MEDIA_LOCKED:
    "Shared sounds and backgrounds are not part of your plan.",
} as const

/** The daily-limit sentence from a thrown error, or null for anything else. */
export function shareRefusal(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const limit = /SHARE_DAILY_LIMIT:(\d+)/.exec(message)
  return limit ? shareLimitMessage(Number(limit[1])) : null
}

/** What the owner's card says while a share waits for an admin. */
export const SHARE_WAITING_LABEL = "Waiting for a check"

/** Which grid a Sounds or Backgrounds page shows. */
export type MediaPageView = "catalogue" | SharedScope

/** The three views as the pill row beside the title names them. */
export const MEDIA_PAGE_VIEWS: { id: MediaPageView; label: string; signedIn?: boolean }[] = [
  { id: "catalogue", label: "Catalogue" },
  { id: "everyone", label: "Shared by members" },
  { id: "saved", label: "Saved", signedIn: true },
]

/** A shared file as the sound player and the Add menu take it. */
export function sharedSound(item: SharedMediaItem): SoundReference {
  return {
    type: "media",
    mediaId: item.mediaId,
    mediaUrl: item.url,
    label: item.name,
    credit: item.own ? null : item.credit,
  }
}

export function sharedBackground(item: SharedMediaItem): BackgroundReference {
  return {
    type: "media",
    mediaId: item.mediaId,
    mediaKind: item.kind === "video" ? "video" : "image",
    mediaUrl: item.url,
    credit: item.own ? null : item.credit,
  }
}
