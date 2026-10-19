import type { CaptionAnimationId } from "@/lib/video/caption-animations"
import type { CaptionWordTime } from "@/lib/video/caption-words"
import { clipMsAt } from "@/lib/video/clip-playback"
import { TRANSCRIBE_MAX_SOURCE_MS } from "@/lib/video/transcripts"

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
  /** When each word of `text` is said, in the same time as the line. */
  words?: CaptionWordTime[]
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

export const CAPTIONS_NOT_POSSIBLE_MESSAGE =
  "There is nothing on the timeline with sound in it to caption"
export const CAPTIONS_NONE_HEARD_MESSAGE =
  "No speech could be made out in that clip"
export const CAPTIONS_TOO_LONG_MESSAGE =
  "That recording is too long to caption. Captioning covers up to 30 minutes"
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

/**
 * The longest recording that will be captioned. Longer than ten minutes is
 * sent in pieces (`src/lib/video/transcripts.ts`).
 */
export const CAPTIONS_MAX_SOURCE_MS = TRANSCRIBE_MAX_SOURCE_MS

/**
 * What one caption clip is called on the timeline. Kept short so a lane full
 * of them still reads.
 */
export function captionClipName(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return "Caption"
  return trimmed.length > 24 ? `${trimmed.slice(0, 23)}…` : trimmed
}

type CaptionSourceClip = {
  id: string
  kind: string
  mediaId?: string
  startMs: number
  durationMs: number
  trimStartMs: number
  speed?: number
  sourceDurationMs?: number
}

/**
 * Which clip gets captioned: the longest piece of sound on a lane that is not
 * muted, and failing that the longest piece of video on one. That is almost
 * always the talking, and picking it automatically saves an extra question.
 *
 * The server picks with this when it writes the captions, and the browser
 * with the same rule when it prices them before the press.
 */
export function findCaptionSource<Clip extends CaptionSourceClip>(
  tracks: readonly { id: string; muted?: boolean; clips: readonly Clip[] }[]
): { clip: Clip; trackId: string } | null {
  let bestAudio: { clip: Clip; trackId: string } | null = null
  let bestVideo: { clip: Clip; trackId: string } | null = null
  for (const track of tracks) {
    if (track.muted) continue
    for (const clip of track.clips ?? []) {
      if (!clip.mediaId || !clip.durationMs) continue
      if (clip.kind === "audio") {
        if (!bestAudio || clip.durationMs > bestAudio.clip.durationMs) {
          bestAudio = { clip, trackId: track.id }
        }
      } else if (clip.kind === "video") {
        if (!bestVideo || clip.durationMs > bestVideo.clip.durationMs) {
          bestVideo = { clip, trackId: track.id }
        }
      }
    }
  }
  return bestAudio ?? bestVideo
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

    const clamped: CaptionLine = {
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
    // The words move the same way, and stay inside the line they belong to.
    if (line.words?.length) {
      const inLine = (ms: number) =>
        Math.min(
          clamped.endMs,
          Math.max(
            clamped.startMs,
            Math.round(source.startMs + clipMsAt(source, ms))
          )
        )
      clamped.words = line.words.map((word) => ({
        startMs: inLine(word.startMs),
        endMs: inLine(word.endMs),
      }))
    }
    mapped.push(clamped)
  }
  return mapped
}
