import {
  captionText,
  splitCaptionLines,
  type CaptionLook,
} from "@/lib/video/caption-look"
import { captionClipWordTimes } from "@/lib/video/caption-words"
import { captionClipName, type CaptionLine } from "@/lib/video/captions"
import { clipSpeed } from "@/lib/video/clip-playback"
import type { VoiceOrigin } from "@/lib/video/clip-origin"
import { spreadHookAcross } from "@/lib/video/hooks"
import { OPENAI_VOICES, type VoiceSettings } from "@/lib/video/voice"
import {
  MAX_TIMELINE_TRACKS,
  MAX_TRACK_CLIPS,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"

/**
 * Making an AI clip again where it sits (`workspace/docs/regenerate-a-scene.md`).
 * A picture swaps its file in place and a moving clip goes through the
 * moving-shot swap (moving-still.ts); this file holds the voice line's swap,
 * which also has its words to deal with and can come back a different length.
 */

type Tracks = ProjectTimeline["tracks"]
type Track = Tracks[number]
type Clip = Track["clips"][number]

export const REMAKE_NOT_FOUND_MESSAGE =
  "That clip is no longer on the timeline, or the AI did not make it."
export const REMAKE_VOICE_NO_ROOM_MESSAGE = `The new voice line needs a lane of its own, and this project already has ${MAX_TIMELINE_TRACKS} lanes. Delete an empty one, then lay it from the Voices panel.`
export const REMAKE_BUSY_MESSAGE = "This clip is already being made again."
export const REMAKE_START_GONE_MESSAGE =
  "The picture this clip was made from is no longer in Media, so it cannot be made again."
export const REMAKE_ACTOR_GONE_MESSAGE =
  "The actor this clip was made with has been deleted, so it cannot be made again."

/** A new reading of a voice line, as the server hands it back. */
export type SpokenLine = {
  mediaId: string
  url: string
  name: string
  durationMs: number
  captions: CaptionLine[]
  origin: VoiceOrigin
  /** Said when the reading worked but its words could not be timed. */
  notice?: string
}

/** The model OpenAI reads with; its voices have no models to choose between. */
export const OPENAI_VOICE_MODEL = "gpt-4o-mini-tts"

/**
 * The recipe a voice line keeps: who read which words, with which model and
 * settings. The model is the one that actually read it, so an OpenAI voice
 * records OpenAI's model whatever was picked in the window.
 */
export function voiceOrigin(
  tool: VoiceOrigin["tool"],
  read: {
    voiceId: string
    voiceName: string
    modelId: string
    text: string
    settings?: VoiceSettings
  }
): VoiceOrigin {
  const speaker = OPENAI_VOICES.some((voice) => voice.id === read.voiceId)
    ? "openai"
    : "elevenlabs"
  return {
    tool,
    model: speaker === "openai" ? OPENAI_VOICE_MODEL : read.modelId,
    prompt: read.text,
    voice: { id: read.voiceId, name: read.voiceName, speaker },
    ...(read.settings ? { settings: read.settings } : {}),
  }
}

/** The look of a caption, which the captions that replace it keep. */
function captionLook(clip: Clip): Partial<Clip> {
  return {
    fontId: clip.fontId,
    fontSize: clip.fontSize,
    color: clip.color,
    highlightColor: clip.highlightColor,
    strokeColor: clip.strokeColor,
    strokeWidth: clip.strokeWidth,
    wrapWidth: clip.wrapWidth,
    animation: clip.animation,
    activeWordColor: clip.activeWordColor,
    x: clip.x,
    y: clip.y,
  }
}

/** Whether these clips go on this lane without touching anything on it. */
export function clipsFit(track: Track, clips: Clip[]) {
  if (track.clips.length + clips.length > MAX_TRACK_CLIPS) return false
  return clips.every((clip) =>
    track.clips.every(
      (other) =>
        clip.startMs + clip.durationMs <= other.startMs ||
        clip.startMs >= other.startMs + other.durationMs
    )
  )
}

function sorted(clips: Clip[]) {
  return [...clips].sort((a, b) => a.startMs - b.startMs)
}

/**
 * Puts these clips on the lane `laneId` names when they all fit there, or
 * on a lane of their own beside it: below it for the sound, above it for
 * the words. Nothing already on the timeline moves.
 */
function lay(
  tracks: Tracks,
  laneId: string,
  clips: Clip[],
  where: "above" | "below",
  newId: () => string
): { tracks: Tracks; newLane: boolean } {
  const index = tracks.findIndex((track) => track.id === laneId)
  const lane = tracks[index]
  if (clipsFit(lane, clips)) {
    const next = [...tracks]
    next[index] = { ...lane, clips: sorted([...lane.clips, ...clips]) }
    return { tracks: next, newLane: false }
  }
  const own: Track = {
    id: newId(),
    muted: lane.muted,
    ...(lane.duck ? { duck: true } : {}),
    clips: sorted(clips),
  }
  const at = where === "above" ? index : index + 1
  return { tracks: [...tracks.slice(0, at), own, ...tracks.slice(at)], newLane: true }
}

/**
 * Swaps a voice line for a new reading of it, as one change.
 *
 * - The new sound starts where the old one started and runs its own length,
 *   at the clip's own speed. Longer means the clip grows; shorter means it
 *   is the new length.
 * - It keeps its lane when it fits there. When a longer line would run into
 *   the next clip, it goes on a lane of its own just below, at the same
 *   start, so nothing else moves (Tyler, 20 Oct 2026).
 * - Its words go too. From Voice and Another language, the captions it laid
 *   are replaced by the new reading's, in the old ones' look and on their
 *   lane when they fit. A line with no captions left gets none. From Hook,
 *   the new line is shared across the same on-screen words, the way Hook
 *   writes it (Tyler, 20 Oct 2026).
 *
 * Null when the line is gone, or when a lane it needs would pass the most a
 * project holds.
 */
export function landVoiceLine(
  tracks: Tracks,
  remake: {
    clipId: string
    line: SpokenLine
    newId: () => string
    /**
     * The saved caption look. The new captions keep the old ones' own look
     * and place, and take only its words at a time and capitals, which are
     * about how the words are cut and written rather than how they look.
     */
    look: CaptionLook
  }
): { tracks: Tracks; newLane: boolean } | null {
  const lane = tracks.find((track) => track.clips.some((clip) => clip.id === remake.clipId))
  const old = lane?.clips.find((clip) => clip.id === remake.clipId)
  if (!lane || !old || old.kind !== "audio") return null

  const { line } = remake
  const voice: Clip = {
    ...old,
    name: line.name,
    mediaId: line.mediaId,
    url: line.url,
    trimStartMs: 0,
    sourceDurationMs: line.durationMs,
    durationMs: line.durationMs / clipSpeed(old),
    origin: line.origin,
  }
  const words = tracks
    .flatMap((track) => track.clips.map((clip) => ({ clip, laneId: track.id })))
    .filter(({ clip }) => clip.kind === "text" && clip.spokenBy === old.id)
    .sort((a, b) => a.clip.startMs - b.clip.startMs)

  if (line.origin.tool === "hook") {
    const texts = new Map(
      spreadHookAcross(
        words.map(({ clip }) => clip.id),
        line.origin.prompt
      ).map((part) => [part.clipId, part.text])
    )
    const rewritten = tracks.map((track) => ({
      ...track,
      clips: track.clips
        .filter((clip) => clip.id !== old.id)
        .map((clip) => {
          const text = texts.get(clip.id)
          return text === undefined ? clip : { ...clip, text, name: text || clip.name }
        }),
    }))
    const laid = lay(rewritten, lane.id, [voice], "below", remake.newId)
    return laid.tracks.length > MAX_TIMELINE_TRACKS ? null : laid
  }

  const oldWordIds = new Set(words.map(({ clip }) => clip.id))
  const cleared = tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.id !== old.id && !oldWordIds.has(clip.id)),
  }))
  let laid = lay(cleared, lane.id, [voice], "below", remake.newId)
  if (words.length) {
    const look = captionLook(words[0].clip)
    const captions = splitCaptionLines(
      line.captions,
      remake.look.wordsPerCaption
    ).map((caption): Clip => {
      const text = captionText(remake.look, caption.text)
      return {
        ...look,
        id: remake.newId(),
        kind: "text",
        name: captionClipName(text),
        text,
        startMs: voice.startMs + caption.startMs,
        durationMs: caption.endMs - caption.startMs,
        trimStartMs: 0,
        wordTimes: captionClipWordTimes(caption),
        spokenBy: voice.id,
      }
    })
    const placed = lay(laid.tracks, words[0].laneId, captions, "above", remake.newId)
    laid = { tracks: placed.tracks, newLane: laid.newLane || placed.newLane }
  }
  return laid.tracks.length > MAX_TIMELINE_TRACKS ? null : laid
}
