import { z } from "zod"

import { captionClipStyle, type CaptionLook } from "@/lib/video/caption-look"
import { captionClipWordTimes } from "@/lib/video/caption-words"
import { captionClipName, type CaptionLine } from "@/lib/video/captions"
import {
  MAX_TIMELINE_TRACKS,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { editorId } from "@/lib/video/timeline-utils"

/**
 * The voiceover shelf, on both sides of the wire.
 *
 * Every voiceover read aloud is kept with the words it said, the voice that
 * said them and the captions that came back with it. Laying one down again,
 * fresh or from the shelf, goes through `voiceoverClips`, so a reused
 * voiceover arrives exactly the way a new one does.
 */

type TimelineTrack = ProjectTimeline["tracks"][number]
type TimelineClip = TimelineTrack["clips"][number]

export type SavedVoiceover = {
  mediaId: string
  url: string
  /** The clip's name on the timeline, from `voiceoverName`. */
  name: string
  script: string
  voiceName: string
  durationMs: number
  captions: CaptionLine[]
}

/** Enough for anyone's shelf; a search reaches the older ones. */
export const VOICEOVER_SHELF_LIMIT = 100
export const VOICEOVER_SEARCH_MAX = 200

export const VOICEOVER_NO_ROOM_MESSAGE = `This project already has ${MAX_TIMELINE_TRACKS} tracks, the most it can hold. Delete an empty track to make room.`

/** A short name for the library and the timeline, taken from what was said. */
export function voiceoverName(script: string) {
  const words = script.replace(/\s+/g, " ").trim()
  return words.length > 40 ? `${words.slice(0, 39)}…` : words || "Voiceover"
}

const captionLinesSchema = z.array(
  z.object({
    startMs: z.number(),
    endMs: z.number(),
    text: z.string(),
    words: z
      .array(z.object({ startMs: z.number(), endMs: z.number() }))
      .optional(),
  })
)

/**
 * The captions kept with a voiceover. Only this app writes them, so a value
 * that does not fit is a fault worth hearing about, not something to skip.
 */
export function readSavedCaptions(value: unknown): CaptionLine[] {
  return captionLinesSchema.parse(value)
}

/**
 * A voiceover as timeline clips: the sound starting at `atMs` and each
 * caption line moved along with it, styled from the brand kit's look.
 */
export function voiceoverClips(
  voiceover: {
    mediaId: string
    url: string
    name: string
    durationMs: number
    captions: CaptionLine[]
  },
  atMs: number,
  look: CaptionLook
): { audio: TimelineClip; captions: TimelineClip[] } {
  const startMs = Math.max(0, Math.round(atMs))
  return {
    audio: {
      id: editorId(),
      kind: "audio",
      name: voiceover.name,
      mediaId: voiceover.mediaId,
      url: voiceover.url,
      startMs,
      durationMs: voiceover.durationMs,
      trimStartMs: 0,
      sourceDurationMs: voiceover.durationMs,
    },
    captions: voiceover.captions.map((line) => ({
      id: editorId(),
      kind: "text" as const,
      name: captionClipName(line.text),
      text: line.text,
      startMs: startMs + line.startMs,
      durationMs: line.endMs - line.startMs,
      trimStartMs: 0,
      wordTimes: captionClipWordTimes(line),
      ...captionClipStyle(look),
    })),
  }
}

/**
 * Why a voiceover cannot be laid down, or null when it can. The sound takes a
 * lane of its own and the captions another, and a save refuses a project with
 * more than `MAX_TIMELINE_TRACKS`. Asked before the edit, so the person hears
 * the reason instead of the press doing nothing.
 */
export function voiceoverRefusal(
  tracks: TimelineTrack[],
  captions: unknown[]
): string | null {
  const lanes = captions.length ? 2 : 1
  return tracks.length + lanes > MAX_TIMELINE_TRACKS
    ? VOICEOVER_NO_ROOM_MESSAGE
    : null
}
