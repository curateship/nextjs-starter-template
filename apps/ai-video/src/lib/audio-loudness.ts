// Export loudness normalization — the ffmpeg `loudnorm` targets and the
// measurement parsing, kept pure so they can be unit-tested without ffmpeg.
//
// Two passes over the rendered file (see video-render.ts): the first measures
// the finished mix, the second applies the correction as one fixed gain
// (`linear=true`). Single-pass loudnorm was rejected for v1 — with nothing
// measured it can only ride the level frame by frame, which fights the ducking
// envelope and lands further from the target. Where the mix has no true-peak
// headroom for the gain it needs, ffmpeg falls back to its dynamic mode by
// itself; that still hits the target and, at this range target, still leaves
// the ducking audible.
//
// Measuring decodes audio only and the correction copies the video stream, so
// neither pass re-encodes video.

// -14 LUFS integrated is the streaming-platform convention (YouTube, Spotify,
// and what TikTok/Reels level to); -1.5 dBTP leaves headroom for the lossy
// re-encodes those platforms run.
//
// The range target is deliberately wide. loudnorm drops out of linear mode and
// compresses whenever the measured range exceeds it, and a ducked mix has a
// genuinely wide range — a -12 dB duck measures around 11-12 LU on its own, so
// the usual 7-11 LU target would squash the very ducking the editor applied
// (measured: an 11.6 dB duck came out at 6.6 dB). 20 LU leaves normal edits
// linear and still catches pathological material.
export const LOUDNESS_TARGET_LUFS = -14
export const LOUDNESS_TRUE_PEAK_DBTP = -1.5
export const LOUDNESS_RANGE_LU = 20

// Exports normalize unless the user turns it off (workspace default).
export const DEFAULT_NORMALIZE_LOUDNESS = true

// loudnorm always outputs 192 kHz, which the AAC encoder cannot take.
const EXPORT_SAMPLE_RATE = 48000

// What the measurement pass reports about the rendered mix, in LUFS/dBTP/LU.
export type LoudnessMeasurement = {
  inputI: number
  inputTp: number
  inputLra: number
  inputThresh: number
  targetOffset: number
}

const TARGETS = `I=${LOUDNESS_TARGET_LUFS}:TP=${LOUDNESS_TRUE_PEAK_DBTP}:LRA=${LOUDNESS_RANGE_LU}`

// Pass 1: analyse only — the JSON block lands on stderr.
export function loudnormMeasureFilter() {
  return `loudnorm=${TARGETS}:print_format=json`
}

// Pass 2: the measured correction, resampled back to the export rate.
export function loudnormApplyFilter(measurement: LoudnessMeasurement) {
  const loudnorm = [
    `loudnorm=${TARGETS}`,
    `measured_I=${measurement.inputI}`,
    `measured_TP=${measurement.inputTp}`,
    `measured_LRA=${measurement.inputLra}`,
    `measured_thresh=${measurement.inputThresh}`,
    `offset=${measurement.targetOffset}`,
    "linear=true",
  ].join(":")
  return `${loudnorm},aresample=${EXPORT_SAMPLE_RATE}`
}

// Pulls the measurement out of an ffmpeg stderr tail. Returns null when the
// block is missing or any value is non-finite — loudnorm reports "-inf" for a
// silent mix, which has no loudness to correct.
export function parseLoudnormMeasurement(
  stderr: string
): LoudnessMeasurement | null {
  const blocks = stderr.match(/\{[^{}]*\}/g)
  const block = blocks
    ?.reverse()
    .find((candidate) => candidate.includes('"input_i"'))
  if (!block) return null

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(block) as Record<string, unknown>
  } catch {
    return null
  }

  const inputI = toFiniteNumber(raw.input_i)
  const inputTp = toFiniteNumber(raw.input_tp)
  const inputLra = toFiniteNumber(raw.input_lra)
  const inputThresh = toFiniteNumber(raw.input_thresh)
  const targetOffset = toFiniteNumber(raw.target_offset)
  if (
    inputI === null ||
    inputTp === null ||
    inputLra === null ||
    inputThresh === null ||
    targetOffset === null
  ) {
    return null
  }
  return { inputI, inputTp, inputLra, inputThresh, targetOffset }
}

// loudnorm prints every value as a string ("-23.45", "-inf").
function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}
