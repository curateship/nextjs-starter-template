/**
 * The shape of the sound drawn along a sound clip on the timeline.
 *
 * The media worker stores one byte per point for each file. This fetches the
 * points once per file, turns them into a single SVG outline shared by every
 * clip using that file, and keeps the result in a small cache. While the
 * points are still being built the route answers 202 with a Retry-After, so
 * this polls rather than failing.
 */

const MAX_STATUS_POLLS = 60
const MAX_CACHED_WAVEFORMS = 50
// Silence still draws a hairline, so a quiet stretch reads as a quiet
// stretch and not as a missing drawing.
const MIN_HALF_HEIGHT = 0.03

export type Waveform = {
  /** SVG path in a box `pointCount` wide and 2 tall; empty when silent. */
  path: string
  pointCount: number
  /** How much of the file the points cover, end to end. */
  durationMs: number
}

const globals = globalThis as typeof globalThis & {
  __videoWaveformCache?: Map<string, Promise<Waveform>>
}
const waveformCache = (globals.__videoWaveformCache ??= new Map<
  string,
  Promise<Waveform>
>())

export function getWaveform(mediaId: string): Promise<Waveform> {
  const cached = waveformCache.get(mediaId)
  if (cached) {
    waveformCache.delete(mediaId)
    waveformCache.set(mediaId, cached)
    return cached
  }
  // A failed load must not stay cached, or every later clip inherits it.
  const promise = loadWaveform(mediaId).catch((error: unknown) => {
    if (waveformCache.get(mediaId) === promise) waveformCache.delete(mediaId)
    throw error
  })
  waveformCache.set(mediaId, promise)
  for (const oldest of waveformCache.keys()) {
    if (waveformCache.size <= MAX_CACHED_WAVEFORMS) break
    waveformCache.delete(oldest)
  }
  return promise
}

async function loadWaveform(mediaId: string): Promise<Waveform> {
  const endpoint = `/api/v1/video/media/${encodeURIComponent(mediaId)}/waveform`
  let response: Response | null = null

  for (let attempt = 0; attempt < MAX_STATUS_POLLS; attempt += 1) {
    response = await fetch(endpoint)
    if (response.status !== 202) break
    const retrySeconds = Number(response.headers.get("Retry-After")) || 2
    await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000))
  }

  if (!response?.ok) {
    throw new Error(`Waveform unavailable (${response?.status ?? 0})`)
  }

  const body = (await response.json()) as {
    peaks: string
    pointCount: number
    durationMs: number
  }
  const peaks = Uint8Array.from(atob(body.peaks), (char) => char.charCodeAt(0))
  if (peaks.length !== body.pointCount) {
    throw new Error("Invalid waveform: point count does not match")
  }
  return {
    path: waveformPath(peaks),
    pointCount: peaks.length,
    durationMs: body.durationMs,
  }
}

/**
 * One closed outline, mirrored top and bottom about the middle line: along
 * the top edge left to right, then back along the bottom. Each point sits in
 * the middle of its own one-unit slot.
 */
export function waveformPath(peaks: Uint8Array) {
  if (!peaks.length) return ""
  const top: string[] = []
  const bottom: string[] = []
  for (let index = 0; index < peaks.length; index += 1) {
    const x = index + 0.5
    const half = Math.max(MIN_HALF_HEIGHT, peaks[index] / 255)
    top.push(`L${x} ${(1 - half).toFixed(2)}`)
    bottom.push(`L${x} ${(1 + half).toFixed(2)}`)
  }
  return `M0 1${top.join("")}L${peaks.length} 1${bottom.reverse().join("")}Z`
}

/**
 * Where the whole file's outline sits relative to a clip's left edge, in
 * pixels. The outline is always drawn at the file's full length and slid left
 * by the trimmed-off part, so trimming the left edge scrolls the shape instead
 * of squashing it.
 */
export function waveformPlacement(
  waveform: Pick<Waveform, "durationMs">,
  clip: { trimStartMs: number; speed: number },
  pxPerSecond: number
) {
  const pxPerSourceMs = pxPerSecond / 1000 / clip.speed
  return {
    left: -clip.trimStartMs * pxPerSourceMs,
    width: waveform.durationMs * pxPerSourceMs,
  }
}
