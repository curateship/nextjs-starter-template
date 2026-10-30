/**
 * Finding the beats in a piece of music, and turning them into places on the
 * timeline that clip edges snap to.
 *
 * The background worker decodes each file marked as music to one channel at
 * `BEAT_SAMPLE_RATE` and hands the samples to `findBeats`. It runs here, with
 * no paid service, in four steps:
 *
 * 1. Cut the sound into frames of 256 samples (23 milliseconds) and measure
 *    how much each frame's loudness jumps from the frame before. A drum hit
 *    is a big jump; a held note is none.
 * 2. Find the tempo: the gap between jumps that repeats most, between 60 and
 *    180 beats a minute, leaning towards 120 so a song is not read at half or
 *    double its speed.
 * 3. Lay a grid of beats at that gap, slid to where it lines up with the most
 *    jumps.
 * 4. Pull each grid beat onto the nearest real jump close by, then fit one
 *    straight line through them, so a gap a hair too long does not drift a
 *    whole beat off by the end of a long song.
 *
 * It assumes a steady tempo, which most music for short videos has. Music
 * with no steady beat (a slow piano piece, speech) comes back with no beats,
 * and snapping simply has none to offer.
 */

import { clipMsAt } from "./clip-playback"

export const BEAT_SAMPLE_RATE = 11_025
const HOP = 256
const MIN_BPM = 60
const MAX_BPM = 180
// The tempo a guess leans towards, and how hard: one octave away counts for
// a little under half as much.
const PRIOR_BPM = 120
const PRIOR_WIDTH_OCTAVES = 1
// How far a grid beat may be pulled to a real jump, in frames (70ms).
const SNAP_FRAMES = 3
// Below this, the repeat is too weak to call a beat at all.
const MIN_CONFIDENCE = 0.15
// A sound whose biggest jumps are smaller than this has nothing to count: a
// held tone, or silence. A drum hit measures several whole units.
const MIN_JUMP = 0.1

export type FoundBeats = {
  /** Milliseconds from the start of the file. */
  beats: number[]
  /** Beats a minute, or null when no steady beat was found. */
  tempo: number | null
}

const NO_BEATS: FoundBeats = { beats: [], tempo: null }

/** How sharply the sound gets louder at each frame, never below zero. */
export function onsetStrength(samples: Float32Array | number[]) {
  const frameCount = Math.floor(samples.length / HOP)
  const energy = new Float64Array(frameCount)
  let previous = 0
  for (let frame = 0; frame < frameCount; frame += 1) {
    let total = 0
    for (let at = frame * HOP; at < (frame + 1) * HOP; at += 1) {
      // The step from the sample before stresses the sharp part of a hit
      // over a low hum that is loud but steady.
      const sample = samples[at]
      const step = sample - previous
      previous = sample
      total += sample * sample + 4 * step * step
    }
    energy[frame] = Math.log1p(1000 * Math.sqrt(total / HOP))
  }
  const onset = new Float64Array(frameCount)
  for (let frame = 1; frame < frameCount; frame += 1) {
    onset[frame] = Math.max(0, energy[frame] - energy[frame - 1])
  }
  return onset
}

/** How big the biggest jumps are: the one a hundredth of the way down. */
function strongestJumps(onset: Float64Array) {
  const sorted = Float64Array.from(onset).sort()
  return sorted[Math.floor(sorted.length * 0.99)] ?? 0
}

/** Each frame blended with two either side, nearest counting most. */
function smoothed(onset: Float64Array) {
  const weights = [0.06, 0.24, 0.4, 0.24, 0.06]
  const out = new Float64Array(onset.length)
  for (let frame = 0; frame < onset.length; frame += 1) {
    let total = 0
    for (let offset = -2; offset <= 2; offset += 1) {
      total += (onset[frame + offset] ?? 0) * weights[offset + 2]
    }
    out[frame] = total
  }
  return out
}

/** The value between two frames, for a gap that is not a whole number of them. */
function sampleAt(values: Float64Array, at: number) {
  const low = Math.floor(at)
  const high = low + 1
  if (low < 0 || high >= values.length) return 0
  const share = at - low
  return values[low] * (1 - share) + values[high] * share
}

export function findBeats(
  samples: Float32Array | number[],
  sampleRate: number = BEAT_SAMPLE_RATE
): FoundBeats {
  const onset = onsetStrength(samples)
  const framesPerSecond = sampleRate / HOP
  if (strongestJumps(onset) < MIN_JUMP) return NO_BEATS
  // Spread each jump over its neighbours, so a beat whose gap is not a whole
  // number of frames (120 a minute is 21.5) still lines up with itself, and
  // is not beaten by twice the gap, which happens to be a whole 43.
  const smooth = smoothed(onset)
  const minLag = Math.floor((60 / MAX_BPM) * framesPerSecond)
  const maxLag = Math.ceil((60 / MIN_BPM) * framesPerSecond)
  if (onset.length < maxLag * 4) return NO_BEATS

  let mean = 0
  for (const value of onset) mean += value
  mean /= onset.length
  let smoothMean = 0
  for (const value of smooth) smoothMean += value
  smoothMean /= smooth.length
  const centred = Float64Array.from(smooth, (value) => value - smoothMean)
  let power = 0
  for (const value of centred) power += value * value
  if (!(power > 0)) return NO_BEATS

  // How well the jumps line up with themselves one gap later, for every gap.
  const repeat = new Float64Array(maxLag + 2)
  for (let lag = minLag - 1; lag <= maxLag + 1; lag += 1) {
    let total = 0
    for (let frame = lag; frame < centred.length; frame += 1) {
      total += centred[frame] * centred[frame - lag]
    }
    repeat[lag] = total / power
  }
  let bestLag = 0
  let bestScore = -Infinity
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const bpm = (60 * framesPerSecond) / lag
    const octaves = Math.log2(bpm / PRIOR_BPM) / PRIOR_WIDTH_OCTAVES
    const score = repeat[lag] * Math.exp(-0.5 * octaves * octaves)
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  if (repeat[bestLag] < MIN_CONFIDENCE) return NO_BEATS

  // The peak between whole frames, from the curve through its neighbours.
  const before = repeat[bestLag - 1]
  const peak = repeat[bestLag]
  const after = repeat[bestLag + 1]
  const bend = before - 2 * peak + after
  const period =
    bend < 0 ? bestLag + (0.5 * (before - after)) / bend : bestLag

  // Slide the grid to where it catches the most jumps.
  let bestPhase = 0
  let bestHits = -Infinity
  for (let phase = 0; phase < period; phase += 0.25) {
    let hits = 0
    for (let at = phase; at < onset.length; at += period) hits += sampleAt(onset, at)
    if (hits > bestHits) {
      bestHits = hits
      bestPhase = phase
    }
  }

  // Pull each grid beat onto a real jump nearby, then fit a straight line
  // through the ones that found one.
  const indexes: number[] = []
  const frames: number[] = []
  let count = 0
  for (let at = bestPhase; at < onset.length; at += period, count += 1) {
    const centre = Math.round(at)
    let best = -1
    let bestValue = mean
    for (
      let frame = Math.max(1, centre - SNAP_FRAMES);
      frame <= Math.min(onset.length - 1, centre + SNAP_FRAMES);
      frame += 1
    ) {
      if (onset[frame] > bestValue) {
        bestValue = onset[frame]
        best = frame
      }
    }
    if (best >= 0) {
      indexes.push(count)
      frames.push(best)
    }
  }
  let step = period
  let start = bestPhase
  if (indexes.length >= 2) {
    const n = indexes.length
    const meanIndex = indexes.reduce((a, b) => a + b, 0) / n
    const meanFrame = frames.reduce((a, b) => a + b, 0) / n
    let covariance = 0
    let variance = 0
    for (let i = 0; i < n; i += 1) {
      covariance += (indexes[i] - meanIndex) * (frames[i] - meanFrame)
      variance += (indexes[i] - meanIndex) ** 2
    }
    if (variance > 0) {
      step = covariance / variance
      start = meanFrame - step * meanIndex
    }
  }

  // A jump measured in a frame happened somewhere inside it: the middle is
  // never more than 12 milliseconds out.
  const frameMs = 1000 / framesPerSecond
  const durationMs = (samples.length / sampleRate) * 1000
  const beats: number[] = []
  for (let index = 0; ; index += 1) {
    const ms = (start + step * index + 0.5) * frameMs
    if (ms >= durationMs) break
    if (ms >= 0) beats.push(Math.round(ms))
  }
  return { beats, tempo: Math.round((60_000 / (step * frameMs)) * 10) / 10 }
}

/**
 * Where a music clip's beats land on the timeline: each beat of the file
 * that is inside the clip's trimmed piece, moved by its start and stretched
 * by its speed, the same sum the waveform is drawn with.
 */
export function beatTimelineTimes(
  clip: {
    startMs: number
    durationMs: number
    trimStartMs: number
    speed?: number
  },
  beats: number[]
) {
  const times: number[] = []
  for (const beat of beats) {
    const intoClip = clipMsAt(clip, beat)
    if (intoClip < 0 || intoClip > clip.durationMs) continue
    times.push(clip.startMs + intoClip)
  }
  return times
}
