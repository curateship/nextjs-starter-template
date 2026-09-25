// Shared timeline math and constants for the studio editor.

// Zoom bounds for the horizontal scale (pixels per second of timeline). The
// default is a conservative pre-measure value; the timeline fits it to the
// visible width on mount.
export const MIN_PX_PER_SECOND = 18
export const MAX_PX_PER_SECOND = 90
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

// "m:ss.cc" — the precise form the whole-second one below is cut down from.
function formatTimecode(ms: number) {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
}

// Whole-second "m:ss" form for chips and status readouts (33_700 -> "0:33").
export function formatClock(ms: number) {
  return formatTimecode(ms).replace(/\.\d+$/, "")
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

// Load just enough metadata to read how long a video or audio file runs. The
// length is never stored server-side — it is read here, once, as the clip lands
// on the timeline.
export function loadMediaDurationMs(url: string, kind: "video" | "audio") {
  return new Promise<number>((resolve, reject) => {
    const element = document.createElement(kind)
    element.preload = "metadata"
    element.onloadedmetadata = () => {
      const ms = Math.round(element.duration * 1000)
      // A stream can report Infinity or NaN — fall back to something usable.
      resolve(Number.isFinite(ms) && ms > 0 ? ms : 5000)
    }
    element.onerror = () => reject(new Error(`Could not load ${kind} metadata`))
    element.src = url
  })
}
