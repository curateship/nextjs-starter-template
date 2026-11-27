// Shared timeline math and constants for the studio editor.

// Zoom bounds for the horizontal scale (pixels per second of timeline). The
// default is a conservative pre-measure value; the timeline fits it to the
// visible width on mount. Fully zoomed out, an hour is 72 pixels, so a
// project of up to about sixteen hours fits a 1,200-pixel timeline
// (workspace/docs/big-files.md, "A whole hour on the timeline").
export const MIN_PX_PER_SECOND = 0.02
export const MAX_PX_PER_SECOND = 90

/**
 * Seconds between the ruler's labels: the shortest of these that leaves at
 * least 54 pixels between two labels, which is where three-second labels
 * sat at the old furthest zoom.
 */
const RULER_LABEL_STEPS = [1, 2, 3, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400]
const RULER_LABEL_MIN_PX = 54

export function rulerLabelStep(pxPerSecond: number) {
  return (
    RULER_LABEL_STEPS.find((step) => step * pxPerSecond >= RULER_LABEL_MIN_PX) ??
    RULER_LABEL_STEPS[RULER_LABEL_STEPS.length - 1]
  )
}

/** "45s" under a minute, then "10:00" and "1:05:00". */
export function rulerLabel(second: number) {
  if (second < 60) return `${second}s`
  const hours = Math.floor(second / 3600)
  const minutes = Math.floor((second % 3600) / 60)
  const seconds = String(second % 60).padStart(2, "0")
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`
}
export const DEFAULT_PX_PER_SECOND = 30

// Shortest a clip can get when trimming or splitting.
export const MIN_CLIP_MS = 100

// Text clips default to 3 seconds when added.
export const DEFAULT_TEXT_DURATION_MS = 3_000

// Image clips default to 4 seconds when added (they have no length of their
// own).
export const DEFAULT_IMAGE_DURATION_MS = 4_000

// Scissors cursor for the cut tool — white casing under black strokes so it
// reads against any clip colour. Hotspot at the blade crossing.
const CUT_CURSOR_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='white' stroke-width='4'><circle cx='6' cy='6' r='3'/><path d='M8.12 8.12 12 12'/><path d='M20 4 8.12 15.88'/><circle cx='6' cy='18' r='3'/><path d='M14.8 14.8 20 20'/></g><g stroke='black' stroke-width='1.8'><circle cx='6' cy='6' r='3'/><path d='M8.12 8.12 12 12'/><path d='M20 4 8.12 15.88'/><circle cx='6' cy='18' r='3'/><path d='M14.8 14.8 20 20'/></g></svg>`
export const CUT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(CUT_CURSOR_SVG)}") 11 11, crosshair`

// Text sizes are authored against a 1080px-tall design space and scaled to
// whatever size the preview stage happens to be.
export const DESIGN_HEIGHT = 1080

// Convert a timeline position or length in ms to pixels at the given zoom.
export function msToPx(ms: number, pxPerSecond: number) {
  return (ms / 1000) * pxPerSecond
}

// Convert pixels back to ms at the given zoom.
export function pxToMs(px: number, pxPerSecond: number) {
  return (px / pxPerSecond) * 1000
}

/**
 * Every length and time Video shows: "0:34", "12:00", or "1:05:04" once
 * there are hours, rounded to the nearest second. One rule, so a project
 * reads the same length on the list, the Exports page and the Export window
 * (33.7 seconds is 0:34 everywhere), and 59.996 seconds is 1:00, never 0:60.
 */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`
}

// A decorative audio waveform as a CSS background data-URL. `color` is a raw
// CSS colour (e.g. "#16a34a"); it is encoded once here — a pre-encoded value
// would be escaped twice and render as an invalid fill.
export function waveformDataUrl(color: string) {
  const width = 168
  const height = 44
  const mid = height / 2
  let rects = ""
  for (let x = 2; x < width; x += 4) {
    const s = Math.sin(x * 0.42) * Math.cos(x * 0.17) + Math.sin(x * 0.11) * 0.4
    const h = Math.max(3, (0.3 + Math.abs(s) * 0.62) * height * 0.92)
    rects += `<rect x='${x}' y='${(mid - h / 2).toFixed(1)}' width='2' height='${h.toFixed(1)}' rx='1' fill='${color}'/>`
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>${rects}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// Unique ids for clips and tracks created in the browser.
export function editorId() {
  return crypto.randomUUID()
}

/** How long a file gets to say how long it runs before the wait is given up. */
export const MEDIA_DURATION_TIMEOUT_MS = 30_000

/** A file whose length could not be read. Its message is written to be shown. */
export class MediaDurationError extends Error {}

// Load just enough metadata to read how long a video or audio file runs. The
// length is never stored server-side — it is read here, once, as the clip lands
// on the timeline.
//
// A browser that never answers would otherwise leave the drop waiting forever
// with nothing on screen, so the wait ends after 30 seconds with a message.
// Either way the player made here lets go of the file, so a detached player is
// not left holding a connection open.
export function loadMediaDurationMs(url: string, kind: "video" | "audio") {
  const what = kind === "video" ? "video" : "sound file"
  return new Promise<number>((resolve, reject) => {
    const element = document.createElement(kind)
    const finish = () => {
      clearTimeout(timer)
      element.onloadedmetadata = null
      element.onerror = null
      element.removeAttribute("src")
      element.load()
    }
    const timer = setTimeout(() => {
      finish()
      reject(
        new MediaDurationError(
          `This ${what} took more than 30 seconds to open, so it was not added. Try again.`
        )
      )
    }, MEDIA_DURATION_TIMEOUT_MS)
    element.preload = "metadata"
    element.onloadedmetadata = () => {
      const ms = Math.round(element.duration * 1000)
      finish()
      // A stream can report Infinity or NaN — fall back to something usable.
      resolve(Number.isFinite(ms) && ms > 0 ? ms : 5000)
    }
    element.onerror = () => {
      finish()
      reject(
        new MediaDurationError(
          `This ${what} could not be opened, so it was not added.`
        )
      )
    }
    element.src = url
  })
}
