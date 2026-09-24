/**
 * The strip of frames drawn along a video clip on the timeline.
 *
 * The worker from the media foundation builds one tiled sprite per media file;
 * this fetches it once, keeps it in a small cache shared by every clip using
 * the same file, and works out which cells of the sprite fall inside a clip's
 * trim window. While the sprite is still being built the route answers 202 with
 * a Retry-After, so this polls at the pace the route asks for, for as long as
 * at least one clip is waiting, and stops the moment the last one goes. A
 * strip that failed answers 422 and becomes a `FilmstripFailedError`.
 */

const SECONDS_PER_FRAME = 2
const MAX_VISIBLE_FRAMES = 30
const MAX_CACHED_FILMSTRIPS = 50

/** The worker tried the strip three times and gave up. */
export class FilmstripFailedError extends Error {
  constructor() {
    super("Filmstrip failed")
    this.name = "FilmstripFailedError"
  }
}

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

type FilmstripProgress = {
  /** The route has answered "still building" at least once. */
  building: boolean
  buildingListeners: Set<() => void>
  controller: AbortController
}

type FilmstripCacheEntry = {
  promise: Promise<FilmstripAsset>
  references: number
  settled: boolean
  progress: FilmstripProgress
}

const globals = globalThis as typeof globalThis & {
  __videoFilmstripCache?: Map<string, FilmstripCacheEntry>
}
const filmstripCache = (globals.__videoFilmstripCache ??= new Map<
  string,
  FilmstripCacheEntry
>())

// Every clip using the same media id points at one browser-cached sprite and
// paints only the cells inside its visible trim window. `onBuilding` is called
// once the route says the strip is still being made, straight away if it
// already has; a strip that is ready never calls it, so a clip opened on a
// finished file never flashes a "getting ready" marker.
export async function getVideoFilmstrip(
  mediaId: string,
  window: ClipWindow,
  signal: AbortSignal,
  onBuilding?: () => void
): Promise<FilmstripFrame[]> {
  const entry = acquireFilmstrip(mediaId)
  const { progress } = entry
  if (onBuilding) {
    if (progress.building) onBuilding()
    else progress.buildingListeners.add(onBuilding)
  }
  let released = false
  const release = () => {
    if (released) return
    released = true
    entry.references -= 1
    if (onBuilding) progress.buildingListeners.delete(onBuilding)
    // Nobody is waiting for a strip still on its way: stop asking, and let
    // the next clip that wants it start afresh. Checked a moment later, so a
    // clip that lets go and takes hold again in one render (a trim, say) keeps
    // the wait it already had instead of asking again at once.
    queueMicrotask(() => {
      if (entry.settled || entry.references > 0) return
      progress.controller.abort()
      if (filmstripCache.get(mediaId) === entry) filmstripCache.delete(mediaId)
    })
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
    const progress: FilmstripProgress = {
      building: false,
      buildingListeners: new Set(),
      controller: new AbortController(),
    }
    const promise = loadFilmstrip(mediaId, progress).then(
      (asset) => {
        created.settled = true
        return asset
      },
      (error: unknown) => {
        created.settled = true
        // A failed load must not stay cached, or every later clip inherits it.
        if (filmstripCache.get(mediaId) === created) {
          filmstripCache.delete(mediaId)
        }
        throw error
      }
    )
    // Every clip may have gone before a failure lands; that is not an error
    // anybody needs to hear about.
    promise.catch(() => undefined)
    const created: FilmstripCacheEntry = {
      promise,
      references: 0,
      settled: false,
      progress,
    }
    entry = created
    filmstripCache.set(mediaId, entry)
  }
  entry.references += 1
  trimFilmstripCache()
  return entry
}

async function loadFilmstrip(
  mediaId: string,
  progress: FilmstripProgress
): Promise<FilmstripAsset> {
  const endpoint = `/api/v1/video/media/${encodeURIComponent(mediaId)}/filmstrip`
  const { signal } = progress.controller
  let response = await fetch(endpoint, { signal })
  while (response.status === 202) {
    if (!progress.building) {
      progress.building = true
      for (const listener of progress.buildingListeners) listener()
      progress.buildingListeners.clear()
    }
    const retrySeconds = Number(response.headers.get("Retry-After")) || 2
    await wait(retrySeconds * 1000, signal)
    response = await fetch(endpoint, { signal })
  }

  if (response.status === 422) throw new FilmstripFailedError()
  if (!response.ok) {
    throw new Error(`Filmstrip unavailable (${response.status})`)
  }

  const frameCount = positiveHeader(response, "X-Filmstrip-Frame-Count")
  const frameWidth = positiveHeader(response, "X-Filmstrip-Frame-Width")
  const frameHeight = positiveHeader(response, "X-Filmstrip-Frame-Height")
  const columns = positiveHeader(response, "X-Filmstrip-Columns")
  const durationMs = positiveHeader(response, "X-Filmstrip-Duration-Ms")
  const blob = await response.blob()
  // An address made after the last clip left would never be let go.
  signal.throwIfAborted()
  return {
    url: URL.createObjectURL(blob),
    frameCount,
    frameWidth,
    frameHeight,
    columns,
    durationMs,
  }
}

function framesForWindow(asset: FilmstripAsset, window: ClipWindow) {
  const { url, frameCount, frameWidth, frameHeight, columns, durationMs } =
    asset
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

// Position one cell of the sprite inside a timeline-sized box, cropping rather
// than squashing whichever way the two aspects differ.
export function filmstripFrameStyle(frame: FilmstripFrame, cellAspect: number) {
  const scaleByWidth = cellAspect >= frame.frameAspect
  const x = scaleByWidth
    ? gridPosition(frame.column, frame.columns)
    : coverPosition(frame.column, frame.columns, frame.frameAspect / cellAspect)
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

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true }
    )
  })
}

// A strip put back in the queue from the Media panel. A clip that showed it
// as failed starts waiting for it again.
const requeuedFilmstrips = new EventTarget()

export function announceFilmstripRequeued(mediaId: string) {
  requeuedFilmstrips.dispatchEvent(new CustomEvent(mediaId))
}

export function onFilmstripRequeued(mediaId: string, listener: () => void) {
  requeuedFilmstrips.addEventListener(mediaId, listener)
  return () => requeuedFilmstrips.removeEventListener(mediaId, listener)
}

function positiveHeader(response: Response, name: string) {
  const value = Number(response.headers.get(name))
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid filmstrip metadata: ${name}`)
  }
  return value
}
