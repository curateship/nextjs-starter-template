/**
 * "Duck under voice": a lane marked as background music drops in volume
 * whenever anything on another lane is making a sound, and comes back up
 * afterwards.
 *
 * All of the working out is here, as plain maths over time ranges, so the
 * editor's preview and (later) the renderer can both drop the music by exactly
 * the same amount at exactly the same moments.
 */

export type Interval = { startMs: number; endMs: number }
export type GainKeyframe = { tMs: number; gain: number }

// How far the music drops, and how long it takes to get there and back. A
// reduction, so the number is negative; 0 would mean no ducking at all.
export const DEFAULT_DUCK_DB = -12
export const DUCK_FADE_IN_MS = 150
export const DUCK_FADE_OUT_MS = 300

// Decibels to a plain volume multiplier (0 dB = 1, −12 dB ≈ 0.25).
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

// Merge overlapping or touching ranges into a sorted, non-overlapping set.
// A range with no length is dropped.
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.endMs > interval.startMs)
    .sort((a, b) => a.startMs - b.startMs)
  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, interval.endMs)
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

// Join two ranges whose gap is too short to come all the way back up and go
// down again. Staying quiet across that gap is better than an audible bump
// between two lines of speech.
function coalesceForFades(
  regions: Interval[],
  fadeInMs: number,
  fadeOutMs: number
): Interval[] {
  const out: Interval[] = []
  for (const region of regions) {
    const last = out[out.length - 1]
    if (last && region.startMs - last.endMs <= fadeInMs + fadeOutMs) {
      last.endMs = Math.max(last.endMs, region.endMs)
    } else {
      out.push({ ...region })
    }
  }
  return out
}

/**
 * The volume curve for a ducked lane, given when everything else is making a
 * sound. Gain is a plain multiplier (1 = full, `duckGain` = quiet); readers
 * slide evenly between neighbouring points. Nothing overlapping gives an empty
 * curve, which means "leave the volume alone".
 */
export function computeDuckEnvelope(params: {
  voiceIntervals: Interval[]
  durationMs: number
  duckGain: number
  fullGain?: number
  fadeInMs?: number
  fadeOutMs?: number
}): GainKeyframe[] {
  const {
    voiceIntervals,
    durationMs,
    duckGain,
    fullGain = 1,
    fadeInMs = DUCK_FADE_IN_MS,
    fadeOutMs = DUCK_FADE_OUT_MS,
  } = params

  const regions = coalesceForFades(
    mergeIntervals(voiceIntervals),
    fadeInMs,
    fadeOutMs
  )
  if (!regions.length) return []

  const keyframes: GainKeyframe[] = []
  const add = (tMs: number, gain: number) => {
    const t = Math.max(0, Math.min(durationMs, tMs))
    const last = keyframes[keyframes.length - 1]
    // Clamping can land two points on the same instant (a range starting at
    // zero, say): keep the quieter, later one.
    if (last && last.tMs === t) last.gain = gain
    else keyframes.push({ tMs: t, gain })
  }

  for (const region of regions) {
    add(region.startMs - fadeInMs, fullGain)
    add(region.startMs, duckGain)
    add(region.endMs, duckGain)
    add(region.endMs + fadeOutMs, fullGain)
  }
  return keyframes
}

// The volume at one moment, sliding between the two points either side and
// holding the ends beyond them. An empty curve is full volume.
export function sampleEnvelope(keyframes: GainKeyframe[], tMs: number): number {
  if (keyframes.length === 0) return 1
  const first = keyframes[0]
  const last = keyframes[keyframes.length - 1]
  if (tMs <= first.tMs) return first.gain
  if (tMs >= last.tMs) return last.gain
  let low = 0
  let high = keyframes.length - 1
  while (low + 1 < high) {
    const middle = (low + high) >> 1
    if (keyframes[middle].tMs <= tMs) low = middle
    else high = middle
  }
  const before = keyframes[low]
  const after = keyframes[high]
  return (
    before.gain +
    (after.gain - before.gain) *
      ((tMs - before.tMs) / (after.tMs - before.tMs))
  )
}
