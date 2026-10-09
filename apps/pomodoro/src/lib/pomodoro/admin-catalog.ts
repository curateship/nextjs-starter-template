import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"

/**
 * What the Themes and Sounds dashboards can be asked for, and the rules both
 * the window and the server check, in one browser-safe file. See
 * `workspace/docs/catalog-admin.md`.
 */

export type CatalogKind = "theme" | "sound"

/** The small word under a card's name. */
export const CATALOG_DESCRIPTORS = {
  theme: ["video", "animated", "static"],
  sound: ["music", "ambient", "noise"],
} as const satisfies Record<CatalogKind, readonly string[]>

export const DESCRIPTOR_LABELS: Record<string, string> = {
  video: "Video",
  animated: "Animated",
  static: "Still",
  music: "Music",
  ambient: "Ambient",
  noise: "Noise",
}

export const CATALOG_STATUS_FILTERS = ["all", "live", "draft"] as const
export type CatalogStatusFilter = (typeof CATALOG_STATUS_FILTERS)[number]
export const CATALOG_ACCESS_FILTERS = ["all", "free", "pro"] as const
export type CatalogAccessFilter = (typeof CATALOG_ACCESS_FILTERS)[number]
/** `position` is the order members see, and the only one dragging works in. */
export const CATALOG_SORT_COLUMNS = [
  "position",
  "name",
  "status",
  "chosen",
  "added",
] as const
export type CatalogSortColumn = (typeof CATALOG_SORT_COLUMNS)[number]

export const CATALOG_LICENCES = [
  { value: "bought", label: "Bought" },
  { value: "free", label: "Free to use" },
  { value: "ai", label: "Made with AI" },
  { value: "own", label: "Our own" },
  { value: "other", label: "Other, see the note" },
] as const
export type CatalogLicence = (typeof CATALOG_LICENCES)[number]["value"]

/**
 * Tyler, 8 Oct 2026: every sound runs 2 to 5 minutes, because shuffle moves
 * to the next theme and sound when the sound ends. The browser checks a file
 * before it is sent and the worker checks it again with FFmpeg.
 */
export const SOUND_MIN_SECONDS = 2 * 60
export const SOUND_MAX_SECONDS = 5 * 60

export function soundLengthProblem(seconds: number) {
  if (seconds >= SOUND_MIN_SECONDS && seconds <= SOUND_MAX_SECONDS) return null
  return `This sound is ${formatClock(seconds)}. Sounds need to run 2 to 5 minutes.`
}

/** 48 → "0:48", 185 → "3:05". */
export function formatClock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

/** The most files one "Upload several" press sends. */
export const CATALOG_BULK_MAX = 25

/**
 * Where an upload waits for the worker. The window sends this back with the
 * item, so the server checks it is one this app wrote and not any other object
 * in the bucket.
 */
export const CATALOG_SOURCE_PATTERN =
  /^pomodoro-catalog\/sources\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|mp3|wav|ogg|mp4|webm)$/

/** What each dashboard's file picker offers. */
export const CATALOG_ACCEPT: Record<CatalogKind, string> = {
  sound: "audio/mpeg,audio/wav,audio/ogg",
  theme: "video/mp4,video/webm",
}
export const CATALOG_BULK_ACCEPT: Record<CatalogKind, string> = {
  sound: "audio/mpeg,audio/wav,audio/ogg",
  theme: "image/png,image/jpeg,image/webp,video/mp4,video/webm",
}

/** A sound's length, read by the browser from the file before it is sent. */
export function measureAudioFile(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = "metadata"
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(audio.duration)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("INVALID_FILE_CONTENT"))
    }
    audio.src = url
  })
}

export type CatalogSearch = {
  q?: string
  status?: CatalogStatusFilter
  access?: CatalogAccessFilter
  tag?: string
  sort?: CatalogSortColumn
  direction?: "asc" | "desc"
  page?: number
  open?: string
}

/** The dashboards' address, every value checked before use. */
export function readCatalogSearch(search: Record<string, unknown>): CatalogSearch {
  return {
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    status: readOneOf(search.status, CATALOG_STATUS_FILTERS),
    access: readOneOf(search.access, CATALOG_ACCESS_FILTERS),
    tag:
      typeof search.tag === "string" && /^[a-z0-9][a-z0-9 -]{0,23}$/.test(search.tag)
        ? search.tag
        : undefined,
    sort: readOneOf(search.sort, CATALOG_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}
