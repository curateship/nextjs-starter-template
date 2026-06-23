// Shared timeline math and constants for the video editor.

// Width of the sticky per-track controls gutter (must match Tailwind w-24 = 96px).
export const TIMELINE_GUTTER_PX = 96

// Zoom bounds for the horizontal scale (pixels per second of timeline).
// The default is a conservative pre-measure value; the timeline fits the
// default window to the visible width on mount.
export const MIN_PX_PER_SECOND = 4
export const MAX_PX_PER_SECOND = 160
export const DEFAULT_PX_PER_SECOND = 12

// Shortest a clip can get when trimming/splitting.
export const MIN_CLIP_MS = 100

// Height of one timeline track row (kept as a constant so drag math can
// translate vertical pointer movement into track-index deltas).
export const TRACK_HEIGHT_PX = 64

// Text clips default to 3 seconds when added.
export const DEFAULT_TEXT_DURATION_MS = 3_000

// Image clips default to 4 seconds when added (no intrinsic duration).
export const DEFAULT_IMAGE_DURATION_MS = 4_000

// Scissors cursor for the cut tool — white casing under black strokes so it
// reads against any clip color. Hotspot at the blade crossing.
const CUT_CURSOR_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='white' stroke-width='4'><circle cx='6' cy='6' r='3'/><path d='M8.12 8.12 12 12'/><path d='M20 4 8.12 15.88'/><circle cx='6' cy='18' r='3'/><path d='M14.8 14.8 20 20'/></g><g stroke='black' stroke-width='1.8'><circle cx='6' cy='6' r='3'/><path d='M8.12 8.12 12 12'/><path d='M20 4 8.12 15.88'/><circle cx='6' cy='18' r='3'/><path d='M14.8 14.8 20 20'/></g></svg>`
export const CUT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(CUT_CURSOR_SVG)}") 11 11, crosshair`

// Text sizes are authored against a 1080px-tall design space and scaled to
// the actual preview stage size.
export const DESIGN_HEIGHT = 1080

// Snap a vertical pointer delta to whole track rows, clamped to the list.
export function clampRowDelta(
  dy: number,
  trackIndex: number,
  trackCount: number
) {
  return Math.min(
    Math.max(Math.round(dy / TRACK_HEIGHT_PX), -trackIndex),
    trackCount - 1 - trackIndex
  )
}

// Convert a timeline position/duration in ms to pixels at the given zoom.
export function msToPx(ms: number, pxPerSecond: number) {
  return (ms / 1000) * pxPerSecond
}

// Convert pixels back to ms at the given zoom.
export function pxToMs(px: number, pxPerSecond: number) {
  return (px / pxPerSecond) * 1000
}

export type SlotReflowClip = {
  id: string
  startMs: number
  durationMs: number
  replaceable?: boolean
}

export function getSlotReflowPlacements<T extends SlotReflowClip>({
  movingClip,
  targetClips,
  trackClips,
  desiredStartMs,
}: {
  movingClip: T
  targetClips: T[]
  trackClips: SlotReflowClip[]
  desiredStartMs: number
}) {
  if (!movingClip.replaceable) return null
  if (targetClips.some((clip) => !clip.replaceable)) return null

  const desired = Math.max(0, desiredStartMs)
  const insertAt = targetClips.findIndex(
    (clip) => desired < clip.startMs + clip.durationMs / 2
  )
  const reordered = [...targetClips]
  reordered.splice(insertAt === -1 ? reordered.length : insertAt, 0, movingClip)

  let cursor = trackClips.length
    ? Math.min(...trackClips.map((clip) => clip.startMs))
    : desired

  return reordered.map((clip) => {
    const startMs = cursor
    cursor += clip.durationMs
    return { clip, startMs }
  })
}

// Format ms as "m:ss.cc" for the transport readout (33_700 -> "0:33.70").
export function formatTimecode(ms: number) {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
}

// Unique ids for clips/tracks created in the browser session.
export function editorId() {
  return crypto.randomUUID()
}

// Load just enough metadata to read the duration of a video/audio URL.
// Used when adding media to the timeline and when replacing template slots.
export function loadMediaDurationMs(url: string, kind: "video" | "audio") {
  return new Promise<number>((resolve, reject) => {
    const el = document.createElement(kind)
    el.preload = "metadata"
    el.onloadedmetadata = () => {
      const ms = Math.round(el.duration * 1000)
      // Streams can report Infinity/NaN — fall back to a usable default.
      resolve(Number.isFinite(ms) && ms > 0 ? ms : 5000)
    }
    el.onerror = () => reject(new Error(`Could not load ${kind} metadata`))
    el.src = url
  })
}
