import { voiceCostCents } from "./ai-estimates"
import { clipSpeed } from "./clip-playback"
import { MIN_CLIP_MS } from "./timeline-utils"
import { shiftMarkers, type TimelineMarker } from "./timeline-markers"
import { soundLaneIndex } from "./sound-lanes"

/**
 * Fix a word you said wrong (`workspace/docs/fix-a-word.md`): pick words in
 * the transcript, type the right ones, and they are said again in a copy of
 * that speaker's voice, swapped into the sound at that spot. Tyler, 4 Nov
 * 2026: "Copy of the speaker".
 *
 * Only the sound of the chosen words changes. The picture under them stays,
 * slowed or shortened so it lasts exactly as long as the new words, and
 * everything after moves along by the difference, captions included.
 */

/** The richest of the voice models, so the copy sounds most like the speaker. */
export const FIX_WORD_MODEL = "eleven_multilingual_v2"
export const FIX_WORD_TEXT_MAX = 200
/** About a minute of the recording is sent to make the copy of the voice. */
export const VOICE_COPY_SAMPLE_SECONDS = 60
/** Less speech than this makes a copy that sounds like nobody. */
export const VOICE_COPY_MIN_SECONDS = 10
/** The short fade either side of the new words, so the swap doesn't click. */
export const FIX_WORD_FADE_MS = 40
/** Slower than this and the held picture visibly stutters. */
export const FIX_WORD_MIN_SPEED = 0.25

export const FIX_WORD_NO_TEXT_MESSAGE = "Type what should be said instead"
export const FIX_WORD_NOT_SOUND_MESSAGE = "Pick a clip with its own sound, a video or a recording, to fix a word in."
export const FIX_WORD_SAMPLE_TOO_SHORT_MESSAGE = `The recording needs at least ${VOICE_COPY_MIN_SECONDS} seconds of sound to copy the voice from.`
export const FIX_WORD_FAILED_MESSAGE = "The words couldn't be said again this time. Try again."
export const FIX_WORD_SPLIT_MESSAGE =
  "Those words are no longer in one piece of the clip. Pick a shorter run."
export const FIX_WORD_TOO_LONG_MESSAGE =
  "The new words would take more than four times as long as the old ones. Pick more of the old words, or type fewer."

/**
 * What saying the new words costs: ElevenLabs charges by the character, and
 * making the copy of the voice is part of the plan, so it adds nothing.
 */
export function fixWordCostCents(text: string) {
  return voiceCostCents(FIX_WORD_MODEL, Math.max(1, text.trim().length))
}

type FixClip = {
  id: string
  kind: string
  startMs: number
  durationMs: number
  trimStartMs: number
  speed?: number
  muted?: boolean
  fadeInMs?: number
  fadeOutMs?: number
  text?: string
  wordTimes?: { startMs: number; endMs: number }[]
  [key: string]: unknown
}
type FixTrack<C extends FixClip> = { id: string; clips: C[]; [key: string]: unknown }

export type NewWords = {
  mediaId: string
  url: string
  name: string
  durationMs: number
}

/**
 * The timeline with the words between `clipStartMs` and `clipEndMs` of one
 * clip said again. The clip is cut in three; the middle keeps its picture
 * with its own sound silenced and lasts exactly as long as the new words,
 * which go on a sound lane under it. Everything starting after the old words
 * moves by the difference, and a caption saying the old words says the new
 * ones. A refusal comes back as a sentence.
 */
export function fixSpokenWords<C extends FixClip, T extends FixTrack<C>>(
  tracks: T[],
  markers: TimelineMarker[],
  {
    clipId,
    clipStartMs,
    clipEndMs,
    oldText,
    newText,
    words,
    makeId,
  }: {
    clipId: string
    clipStartMs: number
    clipEndMs: number
    oldText: string
    newText: string
    words: NewWords
    makeId: () => string
  }
): { tracks: T[]; markers: TimelineMarker[] } | { refusal: string } {
  const trackIndex = tracks.findIndex((track) => track.clips.some((clip) => clip.id === clipId))
  const clip = tracks[trackIndex]?.clips.find((one) => one.id === clipId)
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) return { refusal: FIX_WORD_NOT_SOUND_MESSAGE }
  const from = Math.max(0, Math.round(clipStartMs))
  const to = Math.min(clip.durationMs, Math.round(clipEndMs))
  const oldMs = to - from
  if (oldMs < MIN_CLIP_MS / 2) return { refusal: FIX_WORD_SPLIT_MESSAGE }
  const newMs = Math.max(MIN_CLIP_MS, Math.round(words.durationMs))
  const middleSpeed = (clipSpeed(clip) * oldMs) / newMs
  if (middleSpeed < FIX_WORD_MIN_SPEED) return { refusal: FIX_WORD_TOO_LONG_MESSAGE }
  const delta = newMs - oldMs
  const atMs = clip.startMs + from
  const oldEndMs = clip.startMs + to

  // Everything that starts once the old words are over moves by the
  // difference, on every lane, so captions and music cues stay with it.
  const shifted = tracks.map((track) => ({
    ...track,
    clips: track.clips.map((other) =>
      other.id !== clipId && other.startMs >= oldEndMs ? { ...other, startMs: other.startMs + delta } : other
    ),
  }))

  const speed = clipSpeed(clip)
  const pieces: C[] = []
  if (from >= MIN_CLIP_MS / 2) {
    pieces.push({ ...clip, durationMs: from, fadeOutMs: FIX_WORD_FADE_MS })
  }
  pieces.push({
    ...clip,
    id: makeId(),
    startMs: atMs,
    durationMs: newMs,
    trimStartMs: clip.trimStartMs + from * speed,
    speed: Math.round(middleSpeed * 10000) / 10000,
    muted: true,
    fadeInMs: undefined,
    fadeOutMs: undefined,
    transition: undefined,
  })
  if (clip.durationMs - to >= MIN_CLIP_MS / 2) {
    pieces.push({
      ...clip,
      id: makeId(),
      startMs: atMs + newMs,
      durationMs: clip.durationMs - to,
      trimStartMs: clip.trimStartMs + to * speed,
      fadeInMs: FIX_WORD_FADE_MS,
      transition: undefined,
    })
  }
  const withPieces = shifted.map((track, index) =>
    index === trackIndex
      ? {
          ...track,
          clips: [...track.clips.filter((other) => other.id !== clipId), ...pieces].sort(
            (a, b) => a.startMs - b.startMs
          ),
        }
      : track
  )

  const sound = {
    id: makeId(),
    kind: "audio",
    name: words.name,
    mediaId: words.mediaId,
    url: words.url,
    sourceDurationMs: newMs,
    startMs: atMs,
    durationMs: newMs,
    trimStartMs: 0,
    fadeInMs: FIX_WORD_FADE_MS,
    fadeOutMs: FIX_WORD_FADE_MS,
  } as unknown as C
  const lane = soundLaneIndex(withPieces as Parameters<typeof soundLaneIndex>[0], atMs, newMs)
  const placed =
    lane >= 0
      ? withPieces.map((track, index) =>
          index === lane
            ? { ...track, clips: [...track.clips, sound].sort((a, b) => a.startMs - b.startMs) }
            : track
        )
      : [...withPieces, { id: makeId(), muted: false, clips: [sound] } as unknown as T]

  return {
    tracks: placed.map((track) => ({
      ...track,
      clips: track.clips.map((other) => rewordedCaption(other, atMs, oldEndMs, delta, oldText, newText)),
    })),
    markers: shiftMarkers(markers, oldEndMs, delta),
  }
}

/**
 * A caption laid over the old words, saying the new ones. Its words after
 * them move by the difference and the new words share out the new words'
 * time evenly. A caption that doesn't hold the old words is left as it is.
 */
function rewordedCaption<C extends FixClip>(
  clip: C,
  atMs: number,
  oldEndMs: number,
  delta: number,
  oldText: string,
  newText: string
): C {
  if (clip.kind !== "text" || !clip.text) return clip
  const endMs = clip.startMs + clip.durationMs
  if (clip.startMs > atMs || endMs < oldEndMs) return clip
  const words = clip.text.split(/\s+/).filter(Boolean)
  const old = oldText.split(/\s+/).filter(Boolean)
  const fresh = newText.trim().split(/\s+/).filter(Boolean)
  const strip = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "")
  const at = words.findIndex((_, index) =>
    old.every((word, offset) => strip(words[index + offset] ?? "") === strip(word))
  )
  if (at < 0) return clip
  const text = [...words.slice(0, at), ...fresh, ...words.slice(at + old.length)].join(" ")
  const times = clip.wordTimes
  if (!times || times.length !== words.length) {
    return { ...clip, text, durationMs: clip.durationMs + delta, wordTimes: undefined }
  }
  const fromMs = atMs - clip.startMs
  const share = (oldEndMs - atMs + delta) / Math.max(1, fresh.length)
  const wordTimes = [
    ...times.slice(0, at),
    ...fresh.map((_, index) => ({
      startMs: fromMs + index * share,
      endMs: fromMs + (index + 1) * share,
    })),
    ...times.slice(at + old.length).map((time) => ({
      startMs: time.startMs + delta,
      endMs: time.endMs + delta,
    })),
  ]
  return { ...clip, text, durationMs: clip.durationMs + delta, wordTimes }
}
