/**
 * The facts about an export that both the browser and the server need.
 *
 * They live in browser-safe code on purpose: anything the browser reads out of
 * `src/server/*` drags that whole module, and the password hashing it imports,
 * into the page.
 */

import type { AspectRatio } from "./timeline-schema"

/** How big a file to make, traded against how good it looks. */
export type RenderQuality = "high" | "medium" | "low"

export const RENDER_QUALITIES: {
  id: RenderQuality
  label: string
  note: string
}[] = [
  { id: "high", label: "Best", note: "Full size — for posting" },
  { id: "medium", label: "Good", note: "Two thirds the size" },
  { id: "low", label: "Small", note: "Quickest, for a check" },
]

/**
 * The shapes one press of Export can make, in the order the dialog lists them.
 * Every shape a project can be is here, so the project's own is always ticked.
 */
export const EXPORT_SHAPES: {
  id: AspectRatio
  label: string
  note: string
}[] = [
  { id: "9:16", label: "Tall 9:16", note: "Reels, Shorts, TikTok and stories" },
  { id: "1:1", label: "Square 1:1", note: "A post in the feed" },
  { id: "16:9", label: "Wide 16:9", note: "YouTube and websites" },
  { id: "4:3", label: "Classic 4:3", note: "Older screens and slides" },
]

/** Where a render has got to. */
export type RenderStatus = "queued" | "running" | "ready" | "error" | "cancelled"

/**
 * The longest project this will render. Thirty minutes of the heaviest shape
 * and quality makes a file of about 1.2 GB, which the server reads whole
 * before storing it. `workspace/docs/long-exports.md` says why that sets the
 * limit.
 */
const MAX_TIMELINE_MINUTES = 30
export const MAX_TIMELINE_MS = MAX_TIMELINE_MINUTES * 60_000

/**
 * Seconds of server time one minute of project takes to export, from the
 * download of its clips to the file landing in storage. Every number is a
 * render timed on 24 Sep 2026 on a Mac, written up in
 * `workspace/docs/long-exports.md`. Exports are rendered on the Hetzner
 * server, so these are stand-ins until they are timed there. Evening out the sound is two more passes
 * over the whole file. At ten minutes they took the same time in every shape
 * and quality, so they are kept apart and added only when switched on. On a
 * thirty-minute Best file they took far longer, so the estimate runs short
 * there.
 */
const EXPORT_SECONDS_PER_MINUTE: Record<
  RenderQuality,
  Record<AspectRatio, number>
> = {
  high: { "16:9": 9.4, "9:16": 9.2, "1:1": 6.9, "4:3": 8.4 },
  medium: { "16:9": 4.8, "9:16": 5.8, "1:1": 3.9, "4:3": 4.5 },
  low: { "16:9": 4.8, "9:16": 3.4, "1:1": 3.1, "4:3": 3.1 },
}
const EVEN_SOUND_SECONDS_PER_MINUTE = 3.2

/**
 * About how long these exports will take once they start, one after another.
 * The time spent waiting behind other exports is not in it.
 */
export function estimateExportSeconds({
  projectMs,
  quality,
  aspects,
  normalizeLoudness,
}: {
  projectMs: number
  quality: RenderQuality
  aspects: AspectRatio[]
  normalizeLoudness: boolean
}) {
  const minutes = projectMs / 60_000
  const sound = normalizeLoudness ? EVEN_SOUND_SECONDS_PER_MINUTE : 0
  return aspects.reduce(
    (total, aspect) =>
      total + minutes * (EXPORT_SECONDS_PER_MINUTE[quality][aspect] + sound),
    0
  )
}

/**
 * What the export window says about the wait, or null when it would be under a
 * minute and not worth a line.
 */
export function exportEstimateSentence(seconds: number, shapeCount: number) {
  if (seconds < 60) return null
  const minutes = Math.round(seconds / 60)
  const time = minutes === 1 ? "about a minute" : `about ${minutes} minutes`
  return shapeCount > 1
    ? `Making all ${shapeCount} takes ${time}, one after another.`
    : `Making it takes ${time}.`
}

export const RENDER_NOT_FOUND_MESSAGE = "Export not found"
export const NOTHING_TO_EXPORT_MESSAGE = "There is nothing to export yet"
export const TIMELINE_TOO_LONG_MESSAGE = `This project is longer than ${MAX_TIMELINE_MINUTES} minutes, which is as much as one export can take`
export const NO_ACTIVE_EXPORT_MESSAGE = "There is no export to stop"
export const QUEUE_FULL_MESSAGE =
  "Too many exports waiting already — let some finish first"
export const NO_SHAPE_MESSAGE = "Tick at least one shape to export"
export const ONLY_FAILED_RETRY_MESSAGE =
  "Only an export that failed can be tried again"

/** Refuses a second export of one project in a shape already on its way. */
export function shapeBusyMessage(aspect: AspectRatio) {
  return `A ${aspect} export of this project is already being made. Wait for it to finish, or stop it first.`
}

export const EXPORT_TITLE_MAX = 200
export const EXPORT_DESCRIPTION_MAX = 2000
