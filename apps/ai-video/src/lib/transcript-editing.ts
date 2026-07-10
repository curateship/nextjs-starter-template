export type TranscriptWord = {
  text: string
  startMs: number
  endMs: number
}

export type TranscriptSource = {
  clipId: string
  trackId: string
  kind: "video" | "audio"
  mediaId: string
  startMs: number
  durationMs: number
  trimStartMs: number
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
  }[]
}

function getTranscriptSourceClips(
  source: TranscriptSource,
  tracks: TranscriptTrack[]
) {
  const sourceTimelineEndMs = source.startMs + source.durationMs
  const sourceMediaEndMs = source.trimStartMs + source.durationMs
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

export function getTranscriptWordPlacement(
  word: TranscriptWord,
  source: TranscriptSource,
  tracks: TranscriptTrack[]
) {
  const sourceStartMs = source.trimStartMs + (word.startMs - source.startMs)
  const sourceEndMs = source.trimStartMs + (word.endMs - source.startMs)
  const clip = getTranscriptSourceClips(source, tracks).find(
    (candidate) =>
      candidate.kind === source.kind &&
      candidate.mediaId === source.mediaId &&
      candidate.trimStartMs <= sourceStartMs &&
      candidate.trimStartMs + candidate.durationMs >= sourceEndMs
  )
  if (!clip) return null

  const clipStartMs = sourceStartMs - clip.trimStartMs
  const clipEndMs = sourceEndMs - clip.trimStartMs
  return {
    clipId: clip.id,
    clipStartMs,
    clipEndMs,
    timelineStartMs: clip.startMs + clipStartMs,
    timelineEndMs: clip.startMs + clipEndMs,
  }
}

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
