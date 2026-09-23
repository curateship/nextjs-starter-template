import type { CaptionAnimationId } from "@/lib/video/caption-animations"
import { clipMsAt } from "@/lib/video/clip-playback"

/**
 * What captions are, on both sides of the wire.
 *
 * A caption line is a stretch of speech with the words that were said in it,
 * already moved into timeline time — the editor only has to turn each one into
 * a text clip. Nothing here talks to a provider or a database, so the browser
 * can import it freely.
 */

export type CaptionLine = {
  startMs: number
  endMs: number
  text: string
}

/** The clip the words came out of, as it stood when they were transcribed. */
export type CaptionSource = {
  clipId: string
  trackId: string
  kind: "video" | "audio"
  mediaId: string
  startMs: number
  durationMs: number
  trimStartMs: number
  /** How fast the clip was playing, so the times land in the right place. */
  speed?: number
}

export type CaptionsResult = {
  captions: CaptionLine[]
  source: CaptionSource
}

/**
 * Caption chunks are short on purpose: four words at most, and never more than
 * a second and a half, which is the length a person can read in one glance
 * while the video carries on.
 */
export const CAPTION_MAX_WORDS = 4
export const CAPTION_MAX_MS = 1_500

export const CAPTIONS_NOT_POSSIBLE_MESSAGE =
  "There is nothing on the timeline with sound in it to caption"
export const CAPTIONS_NONE_HEARD_MESSAGE =
  "No speech could be made out in that clip"
export const CAPTIONS_TOO_LONG_MESSAGE =
  "That clip is too long to caption — captioning covers up to 10 minutes"
export const CAPTIONS_FAILED_MESSAGE = "The captions could not be written"

/**
 * Only these reach the screen as they are. Anything else — a provider's own
 * noise, storage internals — is written to the server log and shown as the
 * plain failure message instead.
 *
 * It lives here rather than beside the server code because the browser reads
 * it too, and anything the browser imports out of a server module drags that
 * module's whole world into the page.
 */
export const SAFE_CAPTION_ERRORS = new Set([
  CAPTIONS_NOT_POSSIBLE_MESSAGE,
  CAPTIONS_NONE_HEARD_MESSAGE,
  CAPTIONS_TOO_LONG_MESSAGE,
  CAPTIONS_FAILED_MESSAGE,
])

/** The longest stretch of sound that will be sent off to be transcribed. */
export const CAPTIONS_MAX_SOURCE_MS = 10 * 60_000

/**
 * What one caption clip is called on the timeline. Kept short so a lane full
 * of them still reads.
 */
export function captionClipName(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return "Caption"
  return trimmed.length > 24 ? `${trimmed.slice(0, 23)}…` : trimmed
}

export type CaptionStyleChoice = {
  animation: CaptionAnimationId
  fontId: string
}

/**
 * Moves the times from "into the sound" to "along the timeline", drops
 * anything outside the clip, and keeps them in order and apart.
 */
export function mapCaptionsToTimeline(
  lines: CaptionLine[],
  source: {
    startMs: number
    durationMs: number
    trimStartMs: number
    speed?: number
  }
): CaptionLine[] {
  const clipEndMs = source.startMs + source.durationMs
  const mapped: CaptionLine[] = []
  for (const line of [...lines].sort((a, b) => a.startMs - b.startMs)) {
    // The transcript is timed from the start of the FILE, and the clip may
    // begin further in, so the trim comes off first. A clip playing at 2x
    // reaches a word half as far along the timeline as it sits in the file,
    // which is what `clipMsAt` divides out.
    const startMs = source.startMs + clipMsAt(source, line.startMs)
    const endMs = source.startMs + clipMsAt(source, line.endMs)
    const text = line.text.trim()
    if (!text) continue

    const clamped = {
      startMs: Math.max(source.startMs, Math.round(startMs)),
      endMs: Math.min(clipEndMs, Math.round(endMs)),
      text,
    }
    if (clamped.endMs <= clamped.startMs) continue
    // Never let one caption run into the next.
    const previous = mapped.at(-1)
    if (previous && clamped.startMs < previous.endMs) {
      clamped.startMs = previous.endMs
      if (clamped.endMs <= clamped.startMs) continue
    }
    mapped.push(clamped)
  }
  return mapped
}
