const SECONDS_PER_FRAME = 2
const MAX_VISIBLE_FRAMES = 30
const MAX_STATUS_POLLS = 60
const MAX_CACHED_FILMSTRIPS = 50

export type ClipWindow = { startMs: number; durationMs: number }

export type FilmstripFrame = {
  index: number
  backgroundImage: string
  column: number
  columns: number
  frameAspect: number
  row: number
  rows: number
}

type FilmstripAsset = {
  url: string
  frameCount: number
  frameWidth: number
  frameHeight: number
  columns: number
  durationMs: number
}

type FilmstripCacheEntry = {
  promise: Promise<FilmstripAsset>
  references: number
}

const globals = globalThis as typeof globalThis & {
  __aiVideoFilmstripCache?: Map<string, FilmstripCacheEntry>
}
const filmstripCache =
  (globals.__aiVideoFilmstripCache ??= new Map<string, FilmstripCacheEntry>())

// Polls only the small readiness headers. Once ready, every clip that uses the
// same media id points at one browser-cached sprite and paints only the cells
// inside its visible trim window.
export async function getVideoFilmstrip(
  mediaId: string,
  window: ClipWindow,
  signal: AbortSignal
): Promise<FilmstripFrame[]> {
  const entry = acquireFilmstrip(mediaId)
  let released = false
  const release = () => {
    if (released) return
    released = true
    entry.references -= 1
    trimFilmstripCache()
  }
  signal.addEventListener("abort", release, { once: true })

  try {
    const asset = await entry.promise
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    return framesForWindow(asset, window)
  } catch (error) {
    release()
    throw error
  }
}

function acquireFilmstrip(mediaId: string) {
  let entry = filmstripCache.get(mediaId)
  if (entry) {
    filmstripCache.delete(mediaId)
    filmstripCache.set(mediaId, entry)
  } else {
    const promise = loadFilmstrip(mediaId)
    entry = { promise, references: 0 }
    entry.promise = promise.catch((error) => {
      if (filmstripCache.get(mediaId) === entry) {
        filmstripCache.delete(mediaId)
      }
      throw error
    })
    filmstripCache.set(mediaId, entry)
  }
  entry.references += 1
  trimFilmstripCache()
  return entry
}

async function loadFilmstrip(mediaId: string): Promise<FilmstripAsset> {
  const endpoint = `/api/v1/media/${encodeURIComponent(mediaId)}/filmstrip`
  let response: Response | null = null

  for (let attempt = 0; attempt < MAX_STATUS_POLLS; attempt += 1) {
    response = await fetch(endpoint)
    if (response.status !== 202) break
    const retrySeconds = Number(response.headers.get("Retry-After")) || 2
    await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000))
  }

  if (!response?.ok) {
    throw new Error(`Filmstrip unavailable (${response?.status ?? 0})`)
  }

  const frameCount = positiveHeader(response, "X-Filmstrip-Frame-Count")
  const frameWidth = positiveHeader(response, "X-Filmstrip-Frame-Width")
  const frameHeight = positiveHeader(response, "X-Filmstrip-Frame-Height")
  const columns = positiveHeader(response, "X-Filmstrip-Columns")
  const durationMs = positiveHeader(response, "X-Filmstrip-Duration-Ms")
  return {
    url: URL.createObjectURL(await response.blob()),
    frameCount,
    frameWidth,
    frameHeight,
    columns,
    durationMs,
  }
}

function framesForWindow(asset: FilmstripAsset, window: ClipWindow) {
  const { url, frameCount, frameWidth, frameHeight, columns, durationMs } = asset
  const rows = Math.ceil(frameCount / columns)
  const startMs = Math.min(durationMs, Math.max(0, window.startMs))
  const endMs = Math.min(
    durationMs,
    Math.max(startMs, window.startMs + window.durationMs)
  )
  const spanMs = Math.max(0, endMs - startMs)
  const visibleCount = Math.min(
    MAX_VISIBLE_FRAMES,
    Math.max(1, Math.round(spanMs / (SECONDS_PER_FRAME * 1000)))
  )
  const indices = new Set<number>()
  for (let index = 0; index < visibleCount; index += 1) {
    const sampleMs = startMs + (spanMs * (index + 0.5)) / visibleCount
    indices.add(
      Math.min(frameCount - 1, Math.floor((sampleMs / durationMs) * frameCount))
    )
  }

  return Array.from(indices, (index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    return {
      index,
      backgroundImage: `url("${url}")`,
      column,
      columns,
      frameAspect: frameWidth / frameHeight,
      row,
      rows,
    }
  })
}

export function filmstripFrameStyle(
  frame: FilmstripFrame,
  cellAspect: number
) {
  const scaleByWidth = cellAspect >= frame.frameAspect
  const x = scaleByWidth
    ? gridPosition(frame.column, frame.columns)
    : coverPosition(
        frame.column,
        frame.columns,
        frame.frameAspect / cellAspect
      )
  const y = scaleByWidth
    ? coverPosition(frame.row, frame.rows, cellAspect / frame.frameAspect)
    : gridPosition(frame.row, frame.rows)
  return {
    backgroundImage: frame.backgroundImage,
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: scaleByWidth
      ? `${frame.columns * 100}% auto`
      : `auto ${frame.rows * 100}%`,
  }
}

function gridPosition(index: number, count: number) {
  return count === 1 ? 0 : (index / (count - 1)) * 100
}

function coverPosition(index: number, count: number, scale: number) {
  if (Math.abs(scale - 1) < 0.000001) return gridPosition(index, count)
  return ((index * scale + (scale - 1) / 2) / (count * scale - 1)) * 100
}

function trimFilmstripCache() {
  if (filmstripCache.size <= MAX_CACHED_FILMSTRIPS) return
  for (const [mediaId, entry] of filmstripCache) {
    if (filmstripCache.size <= MAX_CACHED_FILMSTRIPS) return
    if (entry.references > 0) continue
    filmstripCache.delete(mediaId)
    entry.promise.then(
      (asset) => URL.revokeObjectURL(asset.url),
      () => undefined
    )
  }
}

function positiveHeader(response: Response, name: string) {
  const value = Number(response.headers.get(name))
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid filmstrip metadata: ${name}`)
  }
  return value
}
