import {
  resolveIncomingTransition,
  type ClipTransition,
} from "./clip-transitions"

/**
 * Fading a clip in and out, for its sound and for its picture.
 *
 * Four numbers on a clip, each in milliseconds and absent meaning no fade:
 *
 * - `fadeInMs` and `fadeOutMs` are the sound. `fadeOutMs` is the name the
 *   music fade was saved under before the other three existed, so a project
 *   saved with the old "Fade out at the end" switch keeps its two seconds.
 * - `pictureFadeInMs` and `pictureFadeOutMs` are the picture, which fades to
 *   see-through. On the bottom lane that is a fade to black; over another
 *   clip it shows the clip underneath.
 *
 * The preview and the export both read the fades through this file, so they
 * clamp the same way and ramp the same way: a straight line from nothing to
 * full, which is what ffmpeg's `afade` and `fade` draw by default.
 */

/** The slider's shortest fade and its longest, in tenths of a second. */
export const MIN_FADE_MS = 200
export const MAX_FADE_MS = 5_000
export const FADE_STEP_MS = 100

export type FadeClip = {
  kind: string
  durationMs: number
  fadeInMs?: number
  fadeOutMs?: number
  pictureFadeInMs?: number
  pictureFadeOutMs?: number
}

/** How long a fade in and a fade out really play on one clip. */
export type FadePair = { inMs: number; outMs: number }

export const NO_FADES: FadePair = { inMs: 0, outMs: 0 }

function fadeLength(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0
}

/**
 * Two fades that together would be longer than the clip are both shortened
 * by the same share, so they meet in the middle rather than one swallowing
 * the other. A 3 second fade in and a 3 second fade out on a 4 second clip
 * play as 2 and 2. A single fade is only ever cut to the clip's own length.
 *
 * The stored values are left alone, so trimming the clip longer again brings
 * the full fades back.
 */
export function fitFadePair(
  inMs: number | undefined,
  outMs: number | undefined,
  durationMs: number
): FadePair {
  const length = Math.max(0, durationMs)
  const fadeIn = fadeLength(inMs)
  const fadeOut = fadeLength(outMs)
  const total = fadeIn + fadeOut
  if (total <= length) return { inMs: fadeIn, outMs: fadeOut }
  const share = length / total
  return { inMs: fadeIn * share, outMs: fadeOut * share }
}

/** The sound fades as they play. Only video and sound clips have sound. */
export function soundFades(clip: FadeClip): FadePair {
  if (clip.kind !== "video" && clip.kind !== "audio") return NO_FADES
  return fitFadePair(clip.fadeInMs, clip.fadeOutMs, clip.durationMs)
}

/**
 * How far up a fade pair is at one moment of the clip, 0 to 1. Before the
 * clip and after it count as faded all the way, the same as ffmpeg.
 */
export function fadeLevelAt(
  fades: FadePair,
  durationMs: number,
  clipMs: number
): number {
  let level = 1
  if (fades.inMs > 0) level = Math.min(level, clipMs / fades.inMs)
  if (fades.outMs > 0) {
    level = Math.min(level, (durationMs - clipMs) / fades.outMs)
  }
  return Math.min(1, Math.max(0, level))
}

/** How loud the clip's own sound is at this point, as a share of its volume. */
export function soundFadeGain(clip: FadeClip, clipMs: number): number {
  return fadeLevelAt(soundFades(clip), clip.durationMs, clipMs)
}

type LaneClip = FadeClip & {
  id: string
  startMs: number
  transition?: ClipTransition
}

/**
 * The picture fades as they play, once the clip's neighbours on its lane have
 * had their say.
 *
 * A transition at a seam wins over a picture fade at that same end. The seam
 * is one moment between two clips, and the transition was set for it on
 * purpose. Doing both would make the two clips see-through at once in the
 * middle of a crossfade, which shows black or the lane underneath: a dip
 * nobody asked for. So a clip blending in from the one before it ignores its
 * own picture fade in, and a clip the next one blends in over ignores its
 * picture fade out. The far end of each clip still fades.
 */
export function pictureFades(
  clip: LaneClip,
  previous: LaneClip | null,
  next: LaneClip | null
): FadePair {
  if (clip.kind !== "video" && clip.kind !== "image" && clip.kind !== "text") {
    return NO_FADES
  }
  const blendsIn = !!resolveIncomingTransition(clip, previous)
  const blendsOut = !!next && !!resolveIncomingTransition(next, clip)
  return fitFadePair(
    blendsIn ? 0 : clip.pictureFadeInMs,
    blendsOut ? 0 : clip.pictureFadeOutMs,
    clip.durationMs
  )
}

/** Whether a transition at either end overrules a picture fade set there. */
export function pictureFadesOverruled(
  clip: LaneClip,
  previous: LaneClip | null,
  next: LaneClip | null
): { in: boolean; out: boolean } {
  return {
    in: !!clip.pictureFadeInMs && !!resolveIncomingTransition(clip, previous),
    out:
      !!clip.pictureFadeOutMs &&
      !!next &&
      !!resolveIncomingTransition(next, clip),
  }
}

/**
 * What a split hands each half. The left half keeps the fades at the start
 * and the right half the fades at the end, because the new edge between them
 * is the middle of the footage, where a fade would be a dip.
 */
export const LEFT_OF_CUT = {
  fadeOutMs: undefined,
  pictureFadeOutMs: undefined,
} as const
export const RIGHT_OF_CUT = {
  fadeInMs: undefined,
  pictureFadeInMs: undefined,
} as const

/**
 * The ffmpeg sound stages for a clip whose input starts at 0 and runs for
 * its own length.
 */
export function soundFadeFilters(clip: FadeClip): string[] {
  const { inMs, outMs } = soundFades(clip)
  const stages: string[] = []
  if (inMs > 0) stages.push(`afade=t=in:st=0:d=${seconds(inMs)}`)
  if (outMs > 0) {
    stages.push(
      `afade=t=out:st=${seconds(clip.durationMs - outMs)}:d=${seconds(outMs)}`
    )
  }
  return stages
}

/**
 * The ffmpeg picture stages for a layer whose frames are already stamped in
 * timeline time, so the fades start where the clip does on the timeline. The
 * picture gets an alpha channel first, which the fade then takes down.
 */
export function pictureFadeFilters(
  fades: FadePair,
  startMs: number,
  durationMs: number
): string[] {
  if (!(fades.inMs > 0) && !(fades.outMs > 0)) return []
  const stages = ["format=yuva420p"]
  if (fades.inMs > 0) {
    stages.push(
      `fade=t=in:st=${seconds(startMs)}:d=${seconds(fades.inMs)}:alpha=1`
    )
  }
  if (fades.outMs > 0) {
    stages.push(
      `fade=t=out:st=${seconds(startMs + durationMs - fades.outMs)}:d=${seconds(fades.outMs)}:alpha=1`
    )
  }
  return stages
}

function seconds(ms: number) {
  return (ms / 1000).toFixed(3)
}

// --- The slider -------------------------------------------------------------

/**
 * The inspector's slider runs in tenths of a second. Its first stop, one
 * tenth, is "off", and the stops after it run from 0.2 to 5 seconds.
 */
export const FADE_SLIDER_OFF = FADE_STEP_MS / 1000
export const FADE_SLIDER_MAX = MAX_FADE_MS / 1000
export const FADE_SLIDER_STEP = FADE_STEP_MS / 1000

/** Where the slider sits for a stored fade. */
export function fadeSliderValue(ms: number | undefined): number {
  if (!(typeof ms === "number" && ms > 0)) return FADE_SLIDER_OFF
  const tenths = Math.round(ms / FADE_STEP_MS) / 10
  return Math.min(FADE_SLIDER_MAX, Math.max(MIN_FADE_MS / 1000, tenths))
}

/** What a slider position saves. Off saves nothing at all. */
export function storedFade(sliderValue: number): number | undefined {
  const ms = Math.round(sliderValue * 10) * FADE_STEP_MS
  if (ms < MIN_FADE_MS) return undefined
  return Math.min(MAX_FADE_MS, ms)
}

export function formatFade(sliderValue: number): string {
  return storedFade(sliderValue) === undefined
    ? "Off"
    : `${sliderValue.toFixed(1)}s`
}
