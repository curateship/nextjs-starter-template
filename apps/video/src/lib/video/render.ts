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

/** The longest project this will render. */
export const MAX_TIMELINE_MS = 10 * 60_000

export const RENDER_NOT_FOUND_MESSAGE = "Export not found"
export const NOTHING_TO_EXPORT_MESSAGE = "There is nothing to export yet"
export const TIMELINE_TOO_LONG_MESSAGE =
  "This project is longer than ten minutes, which is as much as one export can take"
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
