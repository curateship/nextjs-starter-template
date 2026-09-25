import {
  detectFillerRanges,
  type FillerConfidence,
  type FillerWord,
} from "@/lib/video/filler-words"
import { MIN_CLIP_MS } from "@/lib/video/timeline-utils"

/**
 * Working out what to cut out of a clip.
 *
 * Two kinds of cut, from two very different sources:
 *
 * - **Dead air** — the quiet bits. Found by listening to the sound itself, so
 *   it needs no AI and no key at all.
 * - **Filler words** — the "um"s. Found in a transcript, so it needs one.
 *
 * Both end up as the same thing: a list of stretches somebody can look at,
 * keep or throw away one by one, and then apply in one go. Nothing here talks
 * to a provider or a database, so every awkward case is checkable on its own.
 */

export type JumpCutSensitivity = "gentle" | "balanced" | "tight"
export type JumpCutConfidence = FillerConfidence
export type JumpCutMode = "dead-air" | "filler"

export type JumpCutRange = { startMs: number; endMs: number }

export type JumpCutSuggestion = {
  id: string
  /** Where it sits inside the clip, which is what a cut is made from. */
  clipStartMs: number
  clipEndMs: number
  /** Where it sits on the timeline, which is what a person sees. */
  timelineStartMs: number
  timelineEndMs: number
  reason: string
  confidence: JumpCutConfidence
  removedDurationMs: number
}

/** Nothing shorter than this is worth cutting — you would not notice it. */
const MIN_REMOVAL_MS = 250
/** Two cuts this close together are really one cut. */
const MERGE_GAP_MS = 150

/**
 * How keen to be. A bigger gap means fewer, safer cuts; the padding is how
 * much of the quiet to leave at each end so speech never gets clipped.
 */
export const JUMP_CUT_SENSITIVITIES: {
  id: JumpCutSensitivity
  label: string
  note: string
}[] = [
  { id: "gentle", label: "Gentle", note: "Only long pauses" },
  { id: "balanced", label: "Balanced", note: "A sensible middle" },
  { id: "tight", label: "Tight", note: "Every gap it can find" },
]

const SENSITIVITY_CONFIG: Record<
  JumpCutSensitivity,
  { minGapMs: number; paddingMs: number }
> = {
  gentle: { minGapMs: 700, paddingMs: 120 },
  balanced: { minGapMs: 500, paddingMs: 90 },
  tight: { minGapMs: 350, paddingMs: 60 },
}

/** The biggest file and the longest stretch this will look at. */
export const JUMP_CUT_MAX_MEDIA_BYTES = 100 * 1024 * 1024
export const JUMP_CUT_MAX_WINDOW_MS = 10 * 60_000

export const JUMP_CUT_NO_CLIP_MESSAGE =
  "Pick a clip with sound in it on the timeline first"
export const JUMP_CUT_TOO_BIG_MESSAGE =
  "That clip's file is too big to look through — up to 100MB"
export const JUMP_CUT_TOO_LONG_MESSAGE =
  "That clip is too long to look through — up to 10 minutes"
export const JUMP_CUT_BUSY_MESSAGE =
  "One clip is already being looked through — let it finish first"
export const JUMP_CUT_FAILED_MESSAGE = "That clip could not be looked through"

export const SAFE_JUMP_CUT_ERRORS = new Set([
  JUMP_CUT_NO_CLIP_MESSAGE,
  JUMP_CUT_TOO_BIG_MESSAGE,
  JUMP_CUT_TOO_LONG_MESSAGE,
  JUMP_CUT_BUSY_MESSAGE,
  JUMP_CUT_FAILED_MESSAGE,
])

type JumpCutCandidate = JumpCutRange & { speech: boolean; silence: boolean }

/**
 * Reads the quiet stretches out of what ffmpeg printed while listening.
 *
 * It reports a start and, later, an end. A start with no end is a stretch that
 * ran to the end of the file — there is nothing to cut without knowing where
 * it stops, so it is dropped.
 */
export function parseSilencedetectOutput(output: string): JumpCutRange[] {
  const ranges: JumpCutRange[] = []
  let startMs: number | null = null
  for (const line of output.split("\n")) {
    const start = line.match(/silence_start:\s*(-?[0-9.]+)/)
    if (start) {
      startMs = Math.round(Number(start[1]) * 1000)
      continue
    }
    const end = line.match(/silence_end:\s*([0-9.]+)/)
    if (end && startMs !== null) {
      const endMs = Math.round(Number(end[1]) * 1000)
      if (endMs > startMs) ranges.push({ startMs, endMs })
      startMs = null
    }
  }
  return ranges
}

/** The gaps between spoken words that are longer than `minGapMs`. */
export function findSpeechGapRanges(
  words: FillerWord[],
  minGapMs: number
): JumpCutRange[] {
  const sorted = words
    .filter((word) => word.endMs > word.startMs)
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
  const ranges: JumpCutRange[] = []
  let previousEndMs: number | null = null
  for (const word of sorted) {
    if (previousEndMs !== null && word.startMs - previousEndMs >= minGapMs) {
      ranges.push({ startMs: previousEndMs, endMs: word.startMs })
    }
    previousEndMs =
      previousEndMs === null ? word.endMs : Math.max(previousEndMs, word.endMs)
  }
  return ranges
}

type ClipWindow = { startMs: number; durationMs: number; trimStartMs: number }

/**
 * The dead air worth cutting.
 *
 * Quiet found by listening and gaps found between words are the same thing
 * seen two ways, so they are thrown together, trimmed by the padding, joined
 * up where they nearly touch, and anything too short to notice is dropped.
 */
export function buildJumpCutSuggestions({
  clip,
  sensitivity,
  words,
  silenceRanges,
}: {
  clip: ClipWindow
  sensitivity: JumpCutSensitivity
  words: FillerWord[]
  silenceRanges: JumpCutRange[]
}): JumpCutSuggestion[] {
  const config = SENSITIVITY_CONFIG[sensitivity]
  const candidates: JumpCutCandidate[] = [
    ...findSpeechGapRanges(words, config.minGapMs).map((range) => ({
      ...range,
      speech: true,
      silence: false,
    })),
    ...silenceRanges
      .filter((range) => range.endMs - range.startMs >= config.minGapMs)
      .map((range) => ({ ...range, speech: false, silence: true })),
  ]
    .map((range) => ({
      ...range,
      startMs: Math.max(0, range.startMs + config.paddingMs),
      endMs: Math.min(clip.durationMs, range.endMs - config.paddingMs),
    }))
    .filter((range) => range.endMs - range.startMs >= MIN_REMOVAL_MS)

  return absorbSmallKeptSegments(mergeCandidates(candidates), clip.durationMs)
    .filter((range) => range.endMs - range.startMs >= MIN_REMOVAL_MS)
    .map((range, index) => toSuggestion(clip, range, `dead-air-${index + 1}`, {
      reason: reasonForCandidate(range),
      confidence: confidenceForCandidate(range),
    }))
}

/**
 * How far a cut may be nudged outwards to reach real quiet. Enough to swallow
 * a word whose timing was guessed a little early or late; not enough to eat
 * the sentence around it.
 */
const SNAP_REACH_MS = 400

/**
 * Nudges each cut out to the quiet either side of it.
 *
 * The times a word was said come back as an estimate, and an estimate that is
 * 100ms short leaves a scrap of the word behind — you hear the start of an
 * "um" that was supposed to be gone. The quiet, though, is measured rather
 * than guessed: it comes from listening to the sound.
 *
 * So each cut is stretched outwards until it meets quiet on both sides, up to
 * a limit. What is left is the whole sound of the word and nothing either side
 * of it.
 */
export function snapRangesToSilence(
  ranges: JumpCutRange[],
  silences: JumpCutRange[],
  durationMs: number
): JumpCutRange[] {
  if (!silences.length) return ranges
  const sorted = [...silences].sort((a, b) => a.startMs - b.startMs)
  return ranges.map((range) => {
    // The quiet the cut already sits inside, or the nearest quiet before it.
    const before = sorted.filter((quiet) => quiet.endMs <= range.startMs).at(-1)
    const after = sorted.find((quiet) => quiet.startMs >= range.endMs)
    const startMs =
      before && range.startMs - before.endMs <= SNAP_REACH_MS
        ? before.endMs
        : range.startMs
    const endMs =
      after && after.startMs - range.endMs <= SNAP_REACH_MS
        ? after.startMs
        : range.endMs
    return {
      startMs: Math.max(0, Math.min(startMs, durationMs)),
      endMs: Math.max(0, Math.min(endMs, durationMs)),
    }
  })
}

/** One cut per filler word heard, so each can be kept or dropped on its own. */
export function buildFillerWordSuggestions({
  clip,
  words,
  terms,
  silenceRanges = [],
}: {
  clip: ClipWindow
  words: FillerWord[]
  terms: string[]
  /** What was measured by listening, used to tidy up the guessed times. */
  silenceRanges?: JumpCutRange[]
}): JumpCutSuggestion[] {
  const found = detectFillerRanges(words, terms)
  const snapped = snapRangesToSilence(found, silenceRanges, clip.durationMs)
  return found
    .map((range, index) => ({
      ...range,
      startMs: snapped[index].startMs,
      endMs: snapped[index].endMs,
    }))
    .map((range) => ({
      ...range,
      startMs: Math.max(0, Math.min(range.startMs, clip.durationMs)),
      endMs: Math.max(0, Math.min(range.endMs, clip.durationMs)),
    }))
    .filter((range) => range.endMs - range.startMs >= MIN_CLIP_MS)
    .map((range, index) =>
      toSuggestion(clip, range, `filler-${index + 1}`, {
        reason: `“${range.term}”`,
        confidence: range.confidence,
      })
    )
}

function toSuggestion(
  clip: ClipWindow,
  range: JumpCutRange,
  id: string,
  words: { reason: string; confidence: JumpCutConfidence }
): JumpCutSuggestion {
  return {
    id,
    clipStartMs: range.startMs,
    clipEndMs: range.endMs,
    timelineStartMs: clip.startMs + range.startMs,
    timelineEndMs: clip.startMs + range.endMs,
    reason: words.reason,
    confidence: words.confidence,
    removedDurationMs: range.endMs - range.startMs,
  }
}

function mergeCandidates(candidates: JumpCutCandidate[]) {
  const sorted = candidates
    .filter((range) => range.endMs > range.startMs)
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
  const merged: JumpCutCandidate[] = []
  for (const candidate of sorted) {
    const previous = merged.at(-1)
    if (previous && candidate.startMs <= previous.endMs + MERGE_GAP_MS) {
      previous.endMs = Math.max(previous.endMs, candidate.endMs)
      previous.speech ||= candidate.speech
      previous.silence ||= candidate.silence
    } else {
      merged.push({ ...candidate })
    }
  }
  return merged
}

/**
 * A scrap of video left between two cuts, too short to be worth keeping, is
 * swallowed into the cut beside it. Otherwise applying the cuts leaves a
 * flicker of a frame nobody asked for.
 */
function absorbSmallKeptSegments(
  ranges: JumpCutCandidate[],
  durationMs: number
) {
  const adjusted = ranges.map((range) => ({ ...range }))
  for (let index = 0; index < adjusted.length; index += 1) {
    const range = adjusted[index]
    const previousEndMs = index === 0 ? 0 : adjusted[index - 1].endMs
    const nextStartMs =
      index === adjusted.length - 1 ? durationMs : adjusted[index + 1].startMs
    const before = range.startMs - previousEndMs
    const after = nextStartMs - range.endMs
    if (before > 0 && before < MIN_CLIP_MS) range.startMs = previousEndMs
    if (after > 0 && after < MIN_CLIP_MS) range.endMs = nextStartMs
  }
  return mergeCandidates(adjusted)
}

function reasonForCandidate(candidate: JumpCutCandidate) {
  if (candidate.silence && candidate.speech) return "Quiet, and a pause"
  if (candidate.silence) return "Quiet"
  return "A pause"
}

function confidenceForCandidate(
  candidate: JumpCutCandidate
): JumpCutConfidence {
  if (candidate.silence && candidate.speech) return "high"
  if (candidate.silence) return "medium"
  return "low"
}
