/**
 * How loud and how fast one clip plays, and what that does to its file.
 *
 * Two numbers on a clip. `volume` scales its own sound, 0 silent and 1 the
 * file as recorded. `speed` scales time, 2 playing it in half the room it used
 * to take and 0.5 in twice.
 *
 * Speed is the reason this is a module rather than two clamps. Everywhere in
 * the app that turns "this far into the clip" into "this far into the file"
 * has to go through the speed, or a split, a caption or a cut lands on the
 * wrong moment. Those two conversions live here, once, and every caller uses
 * them instead of adding `trimStartMs` by hand.
 */

export const MIN_CLIP_VOLUME = 0
/**
 * Full is as loud as this goes. The browser's own player cannot play a file
 * louder than it was recorded, and the footage in the preview comes from the
 * storage bucket on another address, which rules out the second audio system
 * that could. A slider that promised more would be silently wrong in the
 * preview and right only in the export, so it stops where both agree.
 */
export const MAX_CLIP_VOLUME = 1
export const DEFAULT_CLIP_VOLUME = 1

export const MIN_CLIP_SPEED = 0.25
export const MAX_CLIP_SPEED = 4
export const DEFAULT_CLIP_SPEED = 1

/** Enough for 5% steps on volume and the speeds people actually pick. */
export const CLIP_VOLUME_STEP = 0.05
export const CLIP_SPEED_STEP = 0.05

/** Anything with the two playback settings on it, absent meaning normal. */
export type PlaybackClip = {
  volume?: number
  speed?: number
}

/** Where a clip sits in its file: everything the two conversions below need. */
export type ClipWindow = PlaybackClip & {
  durationMs: number
  trimStartMs: number
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

export function clipVolume(clip: PlaybackClip): number {
  return clampNumber(
    clip.volume,
    MIN_CLIP_VOLUME,
    MAX_CLIP_VOLUME,
    DEFAULT_CLIP_VOLUME
  )
}

export function clipSpeed(clip: PlaybackClip): number {
  return clampNumber(
    clip.speed,
    MIN_CLIP_SPEED,
    MAX_CLIP_SPEED,
    DEFAULT_CLIP_SPEED
  )
}

/**
 * How much of the file a clip uses up. A clip holding 4 seconds of timeline at
 * 2x eats 8 seconds of recording.
 */
export function sourceSpanMs(clip: ClipWindow): number {
  return clip.durationMs * clipSpeed(clip)
}

/** Where the file ends up when a clip has run its course. */
export function sourceEndMs(clip: ClipWindow): number {
  return clip.trimStartMs + sourceSpanMs(clip)
}

/** This far into the clip is that far into the file. */
export function sourceMsAt(clip: ClipWindow, clipOffsetMs: number): number {
  return clip.trimStartMs + clipOffsetMs * clipSpeed(clip)
}

/** That far into the file is this far into the clip. */
export function clipMsAt(clip: ClipWindow, sourceMs: number): number {
  return (sourceMs - clip.trimStartMs) / clipSpeed(clip)
}

/**
 * The value to store, or nothing when it is the normal one.
 *
 * A timeline saved before these settings existed has neither, and a clip left
 * at normal must save the same way, so the two are the same file. Rounded
 * because a slider hands back values like 0.30000000000000004.
 */
export function storedPlaybackValue(
  value: number,
  normal: number
): number | undefined {
  const rounded = Math.round(value * 100) / 100
  return rounded === normal ? undefined : rounded
}

/**
 * The ffmpeg filter that changes an audio stream's speed.
 *
 * `atempo` only accepts 0.5 to 2, so anything beyond that is two of them
 * multiplied together. Nothing comes back at normal speed, where no filter is
 * wanted at all.
 */
export function atempoFilters(speed: number): string[] {
  if (speed === 1) return []
  const stages: string[] = []
  let remaining = speed
  while (remaining > 2) {
    stages.push("atempo=2")
    remaining /= 2
  }
  while (remaining < 0.5) {
    stages.push("atempo=0.5")
    remaining *= 2
  }
  stages.push(`atempo=${remaining.toFixed(6)}`)
  return stages
}
