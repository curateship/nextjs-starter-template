// Audio ducking envelope math — pure and unit-testable. Given the time ranges
// where "voice" (audio on non-ducked tracks) plays, produce a volume envelope
// for a ducked ("music") track: full volume, dropping to a ducked level just
// before each voice range, held through it, and restored just after.
//
// The envelope math (intervals → keyframes) is renderer/UI-agnostic so it can
// back both the export renderer and the editor preview. `sampleEnvelope` reads
// a gain at a time; `duckEnvelopeToVolumeExpr` formats the envelope as an
// ffmpeg `volume` expression for the export renderer.

export type Interval = { startMs: number; endMs: number }
export type GainKeyframe = { tMs: number; gain: number }

// Workspace default and fade timings (see the task spec). dB is a reduction, so
// the default is negative; 0 dB means no ducking.
export const DEFAULT_DUCK_DB = -12
export const DUCK_DB_MIN = -60
export const DUCK_DB_MAX = 0
export const DUCK_FADE_IN_MS = 150
export const DUCK_FADE_OUT_MS = 300

// Decibels → linear amplitude multiplier (0 dB = 1.0, −12 dB ≈ 0.251).
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

// Merge overlapping or touching intervals into a sorted, non-overlapping set.
// Zero/negative-length inputs are dropped.
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

// Coalesce regions whose gap is too small to ramp back to full and down again
// (fade-out after one plus fade-in before the next) — staying ducked across the
// gap avoids a brief volume pop between two close voice clips.
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

// Voice intervals → a volume envelope for the ducked track. Gain is a linear
// multiplier (1 = full, `duckGain` = ducked); consumers interpolate linearly
// between adjacent keyframes. Returns [] when nothing overlaps, so the track
// renders at full volume (i.e. exactly as today).
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
    // Clamping can collapse two keyframes onto the same instant (e.g. a region
    // starting at t=0): keep the later, more-ducked value.
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

// Linear gain at a given time, interpolating between adjacent keyframes and
// holding the endpoint values beyond the first/last. Empty envelope = full.
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
  const a = keyframes[low]
  const b = keyframes[high]
  return a.gain + (b.gain - a.gain) * ((tMs - a.tMs) / (b.tMs - a.tMs))
}

// Format the envelope as an ffmpeg `volume` expression in terms of `t`
// (seconds), for `volume=eval=frame:volume='<expr>'`. Piecewise-linear between
// keyframes, holding the endpoints outside the range. Empty envelope = "1".
export function duckEnvelopeToVolumeExpr(keyframes: GainKeyframe[]): string {
  if (keyframes.length === 0) return "1"
  const points = keyframes.map((k) => ({ t: k.tMs / 1000, g: k.gain }))
  const num = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(5)

  let expr = num(points[points.length - 1].g) // t >= last keyframe
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i]
    const b = points[i + 1]
    const segment =
      a.g === b.g
        ? num(a.g)
        : `(${num(a.g)}+${num(b.g - a.g)}*(t-${num(a.t)})/${num(b.t - a.t)})`
    expr = `if(lt(t,${num(b.t)}),${segment},${expr})`
  }
  return `if(lt(t,${num(points[0].t)}),${num(points[0].g)},${expr})`
}
