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

import { framePlace } from "@/lib/video/filmstrip-sheets"

/**
 * How many frames a clip shows when its caller does not say. The timeline
 * says, from the clip's width on screen, so a long clip zoomed in shows a
 * frame for every one the strip holds (`filmstrip-sheets.ts`).
 */
const DEFAULT_VISIBLE_FRAMES = 30
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
  /** One address per sheet, in order. */
  urls: string[]
  frameCount: number
  frameWidth: number
  frameHeight: number
  columns: number
  rowsPerSheet: number
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
  onBuilding?: () => void,
  /** The most frames the clip has room for. */
  maxFrames: number = DEFAULT_VISIBLE_FRAMES
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
    return framesForWindow(asset, window, maxFrames)
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
  // A strip made before sheets is one picture of as many rows as it needed.
  const sheetCount = optionalHeader(response, "X-Filmstrip-Sheets") ?? 1
  const rowsPerSheet =
    optionalHeader(response, "X-Filmstrip-Rows-Per-Sheet") ??
    Math.ceil(frameCount / columns)
  const blobs = [await response.blob()]
  // The rest of a long strip's sheets, all at once: an hour is six pictures
  // of a few hundred kilobytes each.
  const rest = await Promise.all(
    Array.from({ length: sheetCount - 1 }, async (_, offset) => {
      const sheet = await fetch(`${endpoint}?sheet=${offset + 1}`, { signal })
      if (!sheet.ok) throw new Error(`Filmstrip unavailable (${sheet.status})`)
      return sheet.blob()
    })
  )
  blobs.push(...rest)
  // An address made after the last clip left would never be let go.
  signal.throwIfAborted()
  return {
    urls: blobs.map((blob) => URL.createObjectURL(blob)),
    frameCount,
    frameWidth,
    frameHeight,
    columns,
    rowsPerSheet,
    durationMs,
  }
}

function framesForWindow(
  asset: FilmstripAsset,
  window: ClipWindow,
  maxFrames: number
) {
  const { urls, frameCount, frameWidth, frameHeight, columns, rowsPerSheet, durationMs } =
    asset
  const startMs = Math.min(durationMs, Math.max(0, window.startMs))
  const endMs = Math.min(
    durationMs,
    Math.max(startMs, window.startMs + window.durationMs)
  )
  const spanMs = Math.max(0, endMs - startMs)
  // As many as the strip holds for this stretch, and no more than fit.
  const frameSpacingMs = durationMs / frameCount
  const visibleCount = Math.min(
    Math.max(1, Math.floor(maxFrames)),
    Math.max(1, Math.round(spanMs / frameSpacingMs))
  )
  const indices = new Set<number>()
  for (let index = 0; index < visibleCount; index += 1) {
    const sampleMs = startMs + (spanMs * (index + 0.5)) / visibleCount
    indices.add(
      Math.min(frameCount - 1, Math.floor((sampleMs / durationMs) * frameCount))
    )
  }

  return Array.from(indices, (index) => {
    const place = framePlace(index, { columns, rowsPerSheet })
    return {
      index,
      backgroundImage: `url("${urls[Math.min(place.sheet, urls.length - 1)]}")`,
      column: place.column,
      columns,
      frameAspect: frameWidth / frameHeight,
      row: place.row,
      rows: rowsPerSheet,
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
      (asset) => asset.urls.forEach((url) => URL.revokeObjectURL(url)),
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

/** A header a strip made before sheets does not send. */
function optionalHeader(response: Response, name: string) {
  return response.headers.has(name) ? positiveHeader(response, name) : null
}

function positiveHeader(response: Response, name: string) {
  const value = Number(response.headers.get(name))
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid filmstrip metadata: ${name}`)
  }
  return value
}
