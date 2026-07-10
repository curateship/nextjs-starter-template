import type { ProjectTimeline } from "./timeline-schema.ts"

// Hook A/B variants: pure timeline logic for finding a project's opening hook
// (the discrete voice clip at the start plus the text clips spoken over it)
// and swapping it for a rewritten line's new audio + karaoke captions. Kept
// dependency-free (timeline types only) so the node test runner can import it
// directly, like voice-settings.ts.

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

// Matches CaptionLine from the captions/voiceover modules without importing
// server code: line times are clip-relative ms, `words` are line-relative.
export type HookCaptionLine = {
  startMs: number
  endMs: number
  text: string
  words?: { text: string; startMs: number; endMs: number }[]
}

export type HookDetection = {
  audioTrackId: string
  audioClip: Clip
  // Every karaoke line spoken during the hook — all get replaced.
  textClips: { trackId: string; clipId: string }[]
  // Earliest hook text clip: donor for font/size/color/position.
  styleSource: Clip
  textTrackId: string
  hookText: string
}

export type HookVariantInput = {
  text: string
  // `url` keeps the new clip playable in the editor without a reload.
  audio: { mediaId: string; durationMs: number; url: string }
  captions: HookCaptionLine[]
}

// A hook voice clip must start right at the top…
const HOOK_AUDIO_MAX_START_MS = 1000
// …and be a discrete line, not a full-video audio bed.
const HOOK_AUDIO_MAX_DURATION_MS = 8000

const HOOK_TEXT_MAX_CHARS = 500

// Speaking pace used to budget the rewritten line (~2.8 words/second, same
// constant as the script writer).
const WORDS_PER_SECOND = 2.8

export const HOOK_NO_AUDIO_MESSAGE =
  "No voice clip found at the start of this video"
export const HOOK_AUDIO_SPANS_VIDEO_MESSAGE =
  "The opening voice audio spans the video. Split the hook into its own audio clip first."
export const HOOK_NO_TEXT_MESSAGE =
  "No hook text found over the opening voice clip"

export function hookWordBudget(audioDurationMs: number): number {
  return Math.max(3, Math.round((audioDurationMs / 1000) * WORDS_PER_SECOND))
}

// Total ms of text-clip time overlapping the audio clip's span — used to pick
// the voice clip (captions sit on it) over e.g. a short sound effect at 0.
function textOverlapMs(timeline: ProjectTimeline, audio: Clip): number {
  const audioEnd = audio.startMs + audio.durationMs
  let overlap = 0
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== "text") continue
      overlap +=
        Math.max(
          0,
          Math.min(clip.startMs + clip.durationMs, audioEnd) -
            Math.max(clip.startMs, audio.startMs)
        )
    }
  }
  return overlap
}

export function detectHook(timeline: ProjectTimeline): HookDetection {
  // Anchor on the audio: discrete voice clips starting at the top.
  const startCandidates: { trackId: string; clip: Clip }[] = []
  for (const track of timeline.tracks) {
    if (track.muted) continue
    for (const clip of track.clips) {
      if (clip.kind !== "audio") continue
      if (clip.startMs > HOOK_AUDIO_MAX_START_MS) continue
      if (clip.muted) continue
      startCandidates.push({ trackId: track.id, clip })
    }
  }
  if (startCandidates.length === 0) {
    throw new Error(HOOK_NO_AUDIO_MESSAGE)
  }

  const discrete = startCandidates.filter(
    ({ clip }) => clip.durationMs <= HOOK_AUDIO_MAX_DURATION_MS
  )
  if (discrete.length === 0) {
    // Only full-length beds (e.g. a template's "Original Audio") start here.
    throw new Error(HOOK_AUDIO_SPANS_VIDEO_MESSAGE)
  }

  // Prefer the clip the captions sit on; tie-break on length.
  let best = discrete[0]
  let bestOverlap = textOverlapMs(timeline, best.clip)
  for (const candidate of discrete.slice(1)) {
    const overlap = textOverlapMs(timeline, candidate.clip)
    if (
      overlap > bestOverlap ||
      (overlap === bestOverlap && candidate.clip.durationMs > best.clip.durationMs)
    ) {
      best = candidate
      bestOverlap = overlap
    }
  }
  const audioClip = best.clip
  const audioEnd = audioClip.startMs + audioClip.durationMs

  // Hook text = every text clip whose midpoint falls inside the voice clip's
  // span. Midpoint (not overlap) keeps the next sentence's captions out.
  const found: { trackId: string; clip: Clip }[] = []
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== "text") continue
      const midMs = clip.startMs + clip.durationMs / 2
      if (midMs >= audioClip.startMs && midMs < audioEnd) {
        found.push({ trackId: track.id, clip })
      }
    }
  }
  if (found.length === 0) {
    throw new Error(HOOK_NO_TEXT_MESSAGE)
  }

  found.sort((a, b) => a.clip.startMs - b.clip.startMs)
  const hookText = found
    .map(({ clip }) => clip.text ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, HOOK_TEXT_MAX_CHARS)
  if (!hookText) {
    throw new Error(HOOK_NO_TEXT_MESSAGE)
  }

  return {
    audioTrackId: best.trackId,
    audioClip,
    textClips: found.map(({ trackId, clip }) => ({ trackId, clipId: clip.id })),
    styleSource: found[0].clip,
    textTrackId: found[0].trackId,
    hookText,
  }
}

// Swaps the detected hook for the variant's new voice + captions. Never moves
// any other clip: the new audio sits at the old clip's start (clamped to the
// next clip on its track) and caption lines past that end are dropped.
export function applyHookVariant(
  timeline: ProjectTimeline,
  variant: HookVariantInput,
  newId: () => string
): ProjectTimeline {
  const hook = detectHook(timeline)
  const audioStart = hook.audioClip.startMs

  // Room on the audio track before the next clip (Infinity when it's last).
  const audioTrack = timeline.tracks.find(
    (track) => track.id === hook.audioTrackId
  )!
  let nextStartMs = Infinity
  for (const clip of audioTrack.clips) {
    if (clip.id === hook.audioClip.id) continue
    if (clip.startMs > audioStart && clip.startMs < nextStartMs) {
      nextStartMs = clip.startMs
    }
  }
  const audioDurationMs = Math.min(
    variant.audio.durationMs,
    nextStartMs - audioStart
  )

  const nameSnippet = variant.text.replace(/\s+/g, " ").trim().slice(0, 30)
  const newAudioClip: Clip = {
    id: newId(),
    kind: "audio",
    name: nameSnippet ? `Hook — ${nameSnippet}` : "Hook",
    startMs: audioStart,
    durationMs: audioDurationMs,
    trimStartMs: 0,
    mediaId: variant.audio.mediaId,
    url: variant.audio.url,
    sourceDurationMs: variant.audio.durationMs,
  }

  // One text clip per caption line, styled like the original hook text.
  const style = hook.styleSource
  const newTextClips: Clip[] = []
  for (const line of variant.captions) {
    const startMs = line.startMs
    const endMs = Math.min(line.endMs, audioDurationMs)
    if (endMs <= startMs || startMs >= audioDurationMs) continue
    newTextClips.push({
      id: newId(),
      kind: "text",
      name: style.name || "Caption",
      text: line.text,
      words: line.words,
      fontId: style.fontId,
      fontSize: style.fontSize,
      color: style.color,
      highlightColor: style.highlightColor,
      x: style.x,
      y: style.y,
      trimStartMs: 0,
      startMs: audioStart + startMs,
      durationMs: endMs - startMs,
    })
  }

  const removedTextIds = new Set(hook.textClips.map(({ clipId }) => clipId))
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => {
      let clips = track.clips.filter((clip) => !removedTextIds.has(clip.id))
      if (track.id === hook.audioTrackId) {
        clips = clips.map((clip) =>
          clip.id === hook.audioClip.id ? newAudioClip : clip
        )
      }
      if (track.id === hook.textTrackId) {
        clips = [...clips, ...newTextClips]
      }
      return { ...track, clips }
    }),
  }
}
