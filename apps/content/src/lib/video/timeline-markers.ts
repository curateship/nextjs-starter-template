import { z } from "zod"

/**
 * Pins on the timeline (`workspace/docs/timeline-markers.md`): M drops one at
 * the playhead, a name makes it a chapter in an export's Chapters card, and a
 * dragged clip edge snaps to it.
 *
 * They belong to one video's timeline, beside its lanes, and are undone with
 * them. Nothing here touches the browser or a server.
 */

export const MAX_TIMELINE_MARKERS = 100
export const MARKER_NAME_MAX = 100

export const timelineMarkerSchema = z
  .object({
    id: z.string().min(1).max(64),
    atMs: z.number().finite().min(0),
    // Empty until it is named. Only a named marker is a chapter.
    name: z.string().max(MARKER_NAME_MAX),
  })
  .strict()

export type TimelineMarker = z.infer<typeof timelineMarkerSchema>

export const MARKERS_FULL_MESSAGE = `A video holds at most ${MAX_TIMELINE_MARKERS} markers. Delete one to drop another.`

/** In time order, so the ruler and the chapter list read left to right. */
export function sortMarkers(markers: TimelineMarker[]) {
  return [...markers].sort((a, b) => a.atMs - b.atMs)
}

/**
 * A new pin at `atMs`, or null when the video is full. A second press on the
 * same millisecond is not a second pin.
 */
export function addMarker(
  markers: TimelineMarker[],
  marker: TimelineMarker
): TimelineMarker[] | null {
  if (markers.some((existing) => existing.atMs === marker.atMs)) return markers
  if (markers.length >= MAX_TIMELINE_MARKERS) return null
  return sortMarkers([...markers, { ...marker, atMs: Math.max(0, marker.atMs) }])
}

export function changeMarker(
  markers: TimelineMarker[],
  id: string,
  patch: Partial<Pick<TimelineMarker, "atMs" | "name">>
): TimelineMarker[] {
  return sortMarkers(
    markers.map((marker) =>
      marker.id === id
        ? {
            ...marker,
            ...(patch.atMs !== undefined ? { atMs: Math.max(0, patch.atMs) } : {}),
            ...(patch.name !== undefined
              ? { name: patch.name.trim().slice(0, MARKER_NAME_MAX) }
              : {}),
          }
        : marker
    )
  )
}

export function removeMarker(markers: TimelineMarker[], id: string) {
  return markers.filter((marker) => marker.id !== id)
}

/**
 * Every pin from `fromMs` on, moved later by `byMs`, the way the teaser at
 * the start moves the whole video along (teaser.md).
 */
export function shiftMarkers(
  markers: TimelineMarker[],
  fromMs: number,
  byMs: number
) {
  return markers.map((marker) =>
    marker.atMs >= fromMs ? { ...marker, atMs: marker.atMs + byMs } : marker
  )
}

/** The pins inside an exported stretch, counted from its start. */
export function markersInStretch(
  markers: TimelineMarker[],
  startMs: number,
  endMs: number
) {
  return markers
    .filter((marker) => marker.atMs >= startMs && marker.atMs < endMs)
    .map((marker) => ({ ...marker, atMs: marker.atMs - startMs }))
}
