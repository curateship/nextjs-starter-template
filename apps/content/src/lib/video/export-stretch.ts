/**
 * Exporting part of a project: from a start to an end, the whole project
 * unless the Export window says otherwise.
 *
 * The part is cut out of the timeline before the render sees it, the way the
 * editor's own split cuts a clip: a clip under the start loses the stretch
 * before it and its fades in, a clip under the end loses the stretch after it
 * and its fades out, and everything moves back so the file starts at the
 * part's start. The render then draws an ordinary, shorter timeline, so
 * everything an export does works the same on a part.
 *
 * Nothing here touches a server, so the browser can use it to check what was
 * typed.
 */

import { LEFT_OF_CUT, RIGHT_OF_CUT } from "@/lib/video/clip-fades"
import { sourceMsAt } from "@/lib/video/clip-playback"
import { markersInStretch, type TimelineMarker } from "@/lib/video/timeline-markers"

export const STRETCH_INVALID_MESSAGE =
  "Write the start and the end as minutes and seconds, such as 10:00"
export const STRETCH_ORDER_MESSAGE = "The end has to come after the start"
export const STRETCH_PAST_END_MESSAGE =
  "The end is after the project finishes. Leave it at the project's end, or earlier."
/** Shortest part worth a file. */
const STRETCH_MIN_MS = 1000
export const STRETCH_TOO_SHORT_MESSAGE = "The part to export has to be at least a second long"

/**
 * "10:00" as milliseconds. Takes seconds alone ("45"), minutes and seconds
 * ("10:00", "90:30") or hours too ("1:05:00"). Anything else is null.
 */
export function parseClockText(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+(:\d{1,2}){0,2}$/.test(trimmed)) return null
  const parts = trimmed.split(":").map(Number)
  if (parts.slice(1).some((part) => part >= 60)) return null
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  return seconds * 1000
}

/**
 * Why this part cannot be exported, or null when it can. The end may be the
 * project's own end to the millisecond, which a whole-second box rounds up
 * to, so the project's length counts as up to the next whole second.
 */
export function stretchRefusal(
  startMs: number,
  endMs: number,
  projectMs: number
): string | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0) {
    return STRETCH_INVALID_MESSAGE
  }
  if (endMs <= startMs) return STRETCH_ORDER_MESSAGE
  if (endMs > Math.ceil(projectMs / 1000) * 1000) return STRETCH_PAST_END_MESSAGE
  if (Math.min(endMs, projectMs) - startMs < STRETCH_MIN_MS) return STRETCH_TOO_SHORT_MESSAGE
  return null
}

type StretchClip = {
  startMs: number
  durationMs: number
  trimStartMs: number
  speed?: number
  transition?: unknown
  wordTimes?: { startMs: number; endMs: number }[]
}

/**
 * The timeline from `startMs` to `endMs`, moved back to start at nought.
 * Clips wholly outside it are left out.
 */
export function timelineStretch<
  Clip extends StretchClip,
  Track extends { clips: Clip[] },
  Timeline extends { tracks: Track[]; markers?: TimelineMarker[] },
>(timeline: Timeline, startMs: number, endMs: number): Timeline {
  return {
    ...timeline,
    // The pins inside the part, counted from its start, so the export's
    // chapters start where its file does (timeline-markers.md).
    ...(timeline.markers
      ? { markers: markersInStretch(timeline.markers, startMs, endMs) }
      : {}),
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.flatMap((clip) => {
        const clipEndMs = clip.startMs + clip.durationMs
        if (clipEndMs <= startMs || clip.startMs >= endMs) return []
        let piece: Clip = { ...clip }
        if (piece.startMs < startMs) {
          const offset = startMs - piece.startMs
          piece = {
            ...piece,
            ...RIGHT_OF_CUT,
            startMs,
            durationMs: piece.durationMs - offset,
            trimStartMs: sourceMsAt(clip, offset),
            // Its edge is now a cut through one piece of footage, which
            // cannot blend in from the clip before.
            transition: undefined,
            // A caption's word times count from its own start.
            ...(clip.wordTimes
              ? {
                  wordTimes: clip.wordTimes.map((word) => ({
                    ...word,
                    startMs: word.startMs - offset,
                    endMs: word.endMs - offset,
                  })),
                }
              : {}),
          }
        }
        if (piece.startMs + piece.durationMs > endMs) {
          piece = { ...piece, ...LEFT_OF_CUT, durationMs: endMs - piece.startMs }
        }
        return [{ ...piece, startMs: piece.startMs - startMs }]
      }),
    })),
  }
}
