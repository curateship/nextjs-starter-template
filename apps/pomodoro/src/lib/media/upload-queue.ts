import * as React from "react"

import { uploadMedia, type MediaItem } from "@/lib/api/media/media"
import { VIDEO_MIME_TYPES } from "@/lib/media/media-upload"
import {
  createPauseGate,
  uploadCancelledError,
  type PauseGate,
} from "@/lib/media/upload-in-parts"
import {
  createUploadSpeedMeter,
  type UploadSpeedMeter,
} from "@/lib/media/upload-speed"

/**
 * The app's one list of uploads in progress.
 *
 * It lives in the browser tab, outside every page, so an upload started in
 * the Media library or the editor carries on while somebody moves around the
 * app. The upload line (`src/components/media/upload-line.tsx`) draws it on
 * every signed-in page, with Pause and Cancel. Closing the tab still ends it;
 * a video picks back up from its last finished piece when the same file is
 * picked again (`upload-resume.ts`).
 */

export type QueuedUpload = {
  id: string
  name: string
  size: number
  /** From 0 to 1. Pictures and sound go in one request and stay at 0 until done. */
  fraction: number
  /** True only for videos, the one kind that goes in pieces and can wait. */
  pausable: boolean
  paused: boolean
  /** Bytes a second over the last 30 seconds, or null while it is too early to say. */
  bytesPerSecond: number | null
}

type Control = {
  stop: AbortController
  gate: PauseGate
  meter: UploadSpeedMeter
  unsubscribe: () => void
}

let uploads: QueuedUpload[] = []
const controls = new Map<string, Control>()
const listeners = new Set<() => void>()
let nextId = 1

function publish(next: QueuedUpload[]) {
  uploads = next
  for (const listener of listeners) listener()
}

function update(id: string, change: Partial<QueuedUpload>) {
  publish(uploads.map((upload) => (upload.id === id ? { ...upload, ...change } : upload)))
}

const EMPTY: QueuedUpload[] = []

/** Every upload in progress, redrawn as each one moves. */
export function useQueuedUploads() {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => uploads,
    () => EMPTY
  )
}

/**
 * Adds one file to the library through the app-wide list. Resolves with the
 * new library item, or rejects as `uploadMedia` does; a cancel rejects with
 * the cancelled error, whichever page pressed it. `signal` lets a page cancel
 * its own batch too.
 */
export function queueUpload(
  file: File,
  { altText, signal }: { altText?: string; signal?: AbortSignal } = {}
): Promise<MediaItem> {
  const id = String(nextId++)
  const stop = new AbortController()
  const gate = createPauseGate()
  const meter = createUploadSpeedMeter()
  const forward = () => stop.abort()
  signal?.addEventListener("abort", forward)
  controls.set(id, {
    stop,
    gate,
    meter,
    unsubscribe: () => signal?.removeEventListener("abort", forward),
  })
  publish([
    ...uploads,
    {
      id,
      name: file.name,
      size: file.size,
      fraction: 0,
      pausable: VIDEO_MIME_TYPES.includes(file.type),
      paused: false,
      bytesPerSecond: null,
    },
  ])

  if (signal?.aborted) {
    finish(id)
    return Promise.reject(uploadCancelledError())
  }

  let shownPercent = -1
  let shownAt = 0
  return uploadMedia(file, altText, {
    signal: stop.signal,
    gate,
    onProgress: (fraction) => {
      const atMs = performance.now()
      meter.record(atMs, fraction * file.size)
      // Redrawn when the whole percent moves, or once a second for the time
      // left: 1% of a 100GB file can take minutes. Anything more often would
      // redraw thousands of times per file on a fast connection.
      const percent = Math.floor(fraction * 100)
      if (percent === shownPercent && atMs - shownAt < 1000) return
      shownPercent = percent
      shownAt = atMs
      update(id, { fraction, bytesPerSecond: meter.bytesPerSecond() })
    },
  }).finally(() => finish(id))
}

function finish(id: string) {
  controls.get(id)?.unsubscribe()
  controls.delete(id)
  publish(uploads.filter((upload) => upload.id !== id))
}

export function pauseUpload(id: string) {
  const control = controls.get(id)
  if (!control) return
  control.gate.pause()
  update(id, { paused: true, bytesPerSecond: null })
}

export function resumeUpload(id: string) {
  const control = controls.get(id)
  if (!control) return
  // The time spent paused is not slowness, so the speed starts again.
  control.meter.reset()
  control.gate.resume()
  update(id, { paused: false })
}

export function cancelUpload(id: string) {
  controls.get(id)?.stop.abort()
}
