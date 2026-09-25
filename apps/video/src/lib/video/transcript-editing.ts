/**
 * Turning "delete these words" into "cut this piece out of that clip".
 *
 * The transcript is a list of words with times against the original recording.
 * The timeline holds clips of that recording, which may have been trimmed,
 * split and moved. This works out which clip a word actually lives in and
 * where inside it, so crossing a word out in the transcript cuts the right
 * piece of the right clip.
 *
 * Everything is a plain function on plain data — no store, no screen — so the
 * awkward cases can be checked without an editor open.
 */

import { clipMsAt, sourceEndMs, sourceMsAt } from "@/lib/video/clip-playback"

export type TranscriptWord = {
  text: string
  startMs: number
  endMs: number
}

/** The clip the words were transcribed from, as it stood at the time. */
export type TranscriptSource = {
  clipId: string
  trackId: string
  kind: "video" | "audio"
  mediaId: string
  startMs: number
  durationMs: number
  trimStartMs: number
  /** How fast it was playing, so clip time and file time can be told apart. */
  speed?: number
}

type TranscriptTrack = {
  id: string
  clips: {
    id: string
    kind: string
    mediaId?: string
    startMs: number
    durationMs: number
    trimStartMs: number
    speed?: number
  }[]
}

/**
 * The clips that came from the transcribed stretch of recording. Splitting the
 * original leaves several, all pointing back at the same file and the same run
 * of it.
 */
function getTranscriptSourceClips(
  source: TranscriptSource,
  tracks: TranscriptTrack[]
) {
  const sourceTimelineEndMs = source.startMs + source.durationMs
  const sourceMediaEndMs = sourceEndMs(source)
  return (
    tracks
      .find((track) => track.id === source.trackId)
      ?.clips.filter(
        (clip) =>
          clip.kind === source.kind &&
          clip.mediaId === source.mediaId &&
          clip.startMs >= source.startMs &&
          clip.startMs < sourceTimelineEndMs &&
          clip.trimStartMs >= source.trimStartMs &&
          clip.trimStartMs < sourceMediaEndMs
      ) ?? []
  )
}

/**
 * Where one word is now: which clip holds it, where it sits inside that clip,
 * and where that lands on the timeline. Nothing at all if the word has since
 * been cut away.
 */
export function getTranscriptWordPlacement(
  word: TranscriptWord,
  source: TranscriptSource,
  tracks: TranscriptTrack[]
) {
  // The word's times are along the timeline; the piece of recording it names
  // is found by walking into the file at the clip's own speed.
  const wordSourceStartMs = sourceMsAt(source, word.startMs - source.startMs)
  const wordSourceEndMs = sourceMsAt(source, word.endMs - source.startMs)
  const clip = getTranscriptSourceClips(source, tracks).find(
    (candidate) =>
      candidate.kind === source.kind &&
      candidate.mediaId === source.mediaId &&
      candidate.trimStartMs <= wordSourceStartMs &&
      sourceEndMs(candidate) >= wordSourceEndMs
  )
  if (!clip) return null

  const clipStartMs = clipMsAt(clip, wordSourceStartMs)
  const clipEndMs = clipMsAt(clip, wordSourceEndMs)
  return {
    clipId: clip.id,
    clipStartMs,
    clipEndMs,
    timelineStartMs: clip.startMs + clipStartMs,
    timelineEndMs: clip.startMs + clipEndMs,
  }
}

/**
 * A run of crossed-out words, as the cut to make.
 *
 * Both ends have to be in the same clip: a selection that spans a join has no
 * single piece to remove, and guessing would silently cut the wrong thing.
 * Everything after the cut on that track shuffles back, which is what
 * `rippleClipIds` names.
 */
export function mapTranscriptWordSpanToClipRemoval(
  words: TranscriptWord[],
  fromIndex: number,
  toIndex: number,
  source: TranscriptSource,
  tracks: TranscriptTrack[]
) {
  const startIndex = Math.min(fromIndex, toIndex)
  const endIndex = Math.max(fromIndex, toIndex)
  const first = words[startIndex]
  const last = words[endIndex]
  if (!first || !last) return null

  const start = getTranscriptWordPlacement(first, source, tracks)
  const end = getTranscriptWordPlacement(last, source, tracks)
  if (!start || !end || start.clipId !== end.clipId) return null
  const selectedClip = getTranscriptSourceClips(source, tracks).find(
    (clip) => clip.id === start.clipId
  )
  if (!selectedClip) return null

  return {
    clipId: start.clipId,
    removals: [{ clipStartMs: start.clipStartMs, clipEndMs: end.clipEndMs }],
    rippleClipIds: getTranscriptSourceClips(source, tracks)
      .filter((clip) => clip.startMs > selectedClip.startMs)
      .map((clip) => clip.id),
  }
}
