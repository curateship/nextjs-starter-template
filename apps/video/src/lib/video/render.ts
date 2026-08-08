/**
 * The facts about an export that both the browser and the server need.
 *
 * They live in browser-safe code on purpose: anything the browser reads out of
 * `src/server/*` drags that whole module, and the password hashing it imports,
 * into the page.
 */

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

/** Where a render has got to. */
export type RenderStatus = "queued" | "running" | "ready" | "error" | "cancelled"

/** The longest project this will render. */
export const MAX_TIMELINE_MS = 10 * 60_000

export const RENDER_NOT_FOUND_MESSAGE = "Export not found"
export const NOTHING_TO_EXPORT_MESSAGE = "There is nothing to export yet"
export const TIMELINE_TOO_LONG_MESSAGE =
  "This project is longer than ten minutes, which is as much as one export can take"
export const NO_QUEUED_EXPORT_MESSAGE = "There is no waiting export to stop"
export const QUEUE_FULL_MESSAGE =
  "Too many exports waiting already — let some finish first"
export const EXPORT_TITLE_MAX = 200
export const EXPORT_DESCRIPTION_MAX = 2000
