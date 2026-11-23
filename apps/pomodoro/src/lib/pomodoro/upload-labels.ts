import { MAX_ITEM_TAGS, normalizeTag } from "@/lib/pomodoro/media-pool"
import type { PomodoroUploadKind } from "@/lib/pomodoro/media-limits"

/**
 * The name, tags and trim a member gives an upload in the upload window, in
 * one browser-safe file. The window checks these before anything is sent and
 * the server checks them again, so the two can never disagree. See "The
 * upload window" in `workspace/docs/own-media-uploads.md`.
 *
 * Tags follow the catalogue's rules (`normalizeTag` in `media-pool.ts`):
 * lower case, at most eight, each up to 24 characters.
 */

/** The longest name a card shows, matching the `name` column. */
export const UPLOAD_NAME_MAX = 80
/** How many files the window takes at once. */
export const MAX_UPLOAD_FILES = 10
/** The shortest a trimmed sound or clip may be. */
export const MIN_TRIM_MS = 1000
/**
 * The longest file a trim can describe. Far past any file the size limits
 * allow, and well inside an `integer` column.
 */
export const MAX_TRIM_MS = 6 * 60 * 60 * 1000
/** How often the worker takes the next file (`media-worker.ts`). */
const WORKER_PASS_SECONDS = 15

/** "IMG_4021.mp4" → "IMG_4021": the Name field's first value. */
export function nameFromFileName(fileName: string) {
  const bare = fileName.replace(/\.[^./\\]+$/, "").trim()
  return (bare || fileName.trim()).slice(0, UPLOAD_NAME_MAX)
}

/**
 * An AI file's name: its prompt, cut to 80 characters at a word break, the
 * same rule migration 0136 used on the ones made before. A prompt with no
 * break in the first 80 characters is cut at 80.
 */
export function nameFromPrompt(prompt: string) {
  const clean = prompt.trim().replace(/\s+/g, " ")
  if (clean.length <= UPLOAD_NAME_MAX) return clean
  const head = clean.slice(0, UPLOAD_NAME_MAX + 1)
  const cut = head.replace(/\s+\S*$/, "")
  // No break to cut at, or nothing before the first one: a plain cut.
  return cut === head || !cut ? clean.slice(0, UPLOAD_NAME_MAX) : cut
}

/** How long a deleted file waits in the bin before it goes for good. */
export const BIN_DAYS = 30

/** The day a file in the bin goes for good, said the way a person says it. */
export function binEndsOn(deletedAt: Date) {
  const ends = new Date(deletedAt.getTime() + BIN_DAYS * 24 * 60 * 60 * 1000)
  return ends.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/** The share of the plan's space that makes the bell warn. */
export const STORAGE_WARNING_SHARE = 0.9

/** "Rain, Night ,rain" → ["rain", "night"]. Words that cannot be a tag are kept aside. */
export function parseTagText(text: string) {
  const words = text
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean)
  const tags: string[] = []
  const unusable: string[] = []
  for (const word of words) {
    const tag = normalizeTag(word)
    if (tag === null) unusable.push(word)
    else if (!tags.includes(tag)) tags.push(tag)
  }
  return { tags, unusable }
}

export type UploadLabelProblem =
  | "UPLOAD_NAME_EMPTY"
  | "UPLOAD_NAME_TOO_LONG"
  | "UPLOAD_TAGS_TOO_MANY"
  | "UPLOAD_TAG_INVALID"

/** What each refusal says, in the window and from the server alike. */
export const UPLOAD_LABEL_MESSAGES: Record<UploadLabelProblem, string> = {
  UPLOAD_NAME_EMPTY: "Give it a name.",
  UPLOAD_NAME_TOO_LONG: `A name can be up to ${UPLOAD_NAME_MAX} characters.`,
  UPLOAD_TAGS_TOO_MANY: `Up to ${MAX_ITEM_TAGS} tags.`,
  UPLOAD_TAG_INVALID:
    "A tag can use letters, numbers, spaces and dashes, up to 24 characters.",
}

/**
 * The name trimmed and the tags cleaned, or the first thing wrong with them.
 * Tags arrive as typed words; anything `normalizeTag` cannot read is refused
 * rather than dropped, so a member never loses a tag without being told.
 */
export function checkUploadLabels(input: { name: string; tags: string[] }):
  | { ok: true; name: string; tags: string[] }
  | { ok: false; problem: UploadLabelProblem } {
  const name = input.name.trim().replace(/\s+/g, " ")
  if (!name) return { ok: false, problem: "UPLOAD_NAME_EMPTY" }
  if (name.length > UPLOAD_NAME_MAX)
    return { ok: false, problem: "UPLOAD_NAME_TOO_LONG" }
  const tags: string[] = []
  for (const raw of input.tags) {
    const tag = normalizeTag(raw)
    if (tag === null) return { ok: false, problem: "UPLOAD_TAG_INVALID" }
    if (!tags.includes(tag)) tags.push(tag)
  }
  if (tags.length > MAX_ITEM_TAGS)
    return { ok: false, problem: "UPLOAD_TAGS_TOO_MANY" }
  return { ok: true, name, tags }
}

export type UploadTrim = { startMs: number; endMs: number }

/** Whether a trim is one the worker can cut: whole milliseconds, at least a second long. */
export function isValidTrim(trim: UploadTrim) {
  return (
    Number.isSafeInteger(trim.startMs) &&
    Number.isSafeInteger(trim.endMs) &&
    trim.startMs >= 0 &&
    trim.endMs <= MAX_TRIM_MS &&
    trim.endMs - trim.startMs >= MIN_TRIM_MS
  )
}

/**
 * "1:05.3", for the trim strip's start and end. Tenths, because the handles
 * move a tenth of a second per arrow press and each press should show.
 */
export function formatClock(ms: number) {
  const tenths = Math.max(0, Math.round(ms / 100))
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`
}

/**
 * What the window says once a file is up. A picture is finished at once. A
 * sound or clip waits for the worker, which takes one file every fifteen
 * seconds, so the wait is counted from the files ahead of it.
 */
export function uploadedMessage(kind: PomodoroUploadKind, ahead: number) {
  if (kind === "image") return "Your picture is ready."
  const noun = kind === "video" ? "clip" : "sound"
  const seconds = (ahead + 1) * WORKER_PASS_SECONDS
  const when =
    seconds < 40
      ? "in under a minute"
      : seconds <= 90
        ? "in about a minute"
        : `in about ${Math.round(seconds / 60)} minutes`
  const queue =
    ahead === 0
      ? `Nothing is ahead of it, so it should be ready ${when}.`
      : `${ahead} ${ahead === 1 ? "file is" : "files are"} ahead of it, so it should be ready ${when}.`
  return `Your ${noun} is being prepared. ${queue} The bell will tell you.`
}
