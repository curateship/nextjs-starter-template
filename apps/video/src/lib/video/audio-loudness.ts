/**
 * Levelling a finished export to the loudness every platform plays videos at.
 *
 * The maths and the parsing live here, away from anything that runs ffmpeg, so
 * they can be checked without it.
 *
 * It takes two passes over the rendered file. The first listens to the whole
 * mix and reports how loud it is; the second applies one fixed correction. One
 * pass alone can only ride the level moment by moment, which fights the ducking
 * the editor applied and lands further from the target anyway.
 *
 * Neither pass re-encodes the picture: measuring reads the sound only, and the
 * correction copies the video stream through untouched.
 */

/**
 * −14 LUFS is what YouTube, Spotify and the short-form apps level to, and
 * −1.5 dBTP leaves room for the squashing they do on the way in.
 *
 * The range target is deliberately wide. The filter stops applying one fixed
 * gain and starts compressing whenever the measured range is wider than this,
 * and a ducked mix genuinely is wide — a 12 dB duck measures around 11 to 12 on
 * its own, so the usual 7 to 11 would flatten the very ducking that was asked
 * for. Twenty leaves ordinary edits alone and still catches the wild ones.
 */
export const LOUDNESS_TARGET_LUFS = -14
export const LOUDNESS_TRUE_PEAK_DBTP = -1.5
export const LOUDNESS_RANGE_LU = 20

/** Exports are levelled unless somebody turns it off. */
export const DEFAULT_NORMALIZE_LOUDNESS = true

// The filter always outputs 192 kHz, which the sound encoder cannot take.
const EXPORT_SAMPLE_RATE = 48000

/** What the first pass reports about the mix. */
export type LoudnessMeasurement = {
  inputI: number
  inputTp: number
  inputLra: number
  inputThresh: number
  targetOffset: number
}

const TARGETS = `I=${LOUDNESS_TARGET_LUFS}:TP=${LOUDNESS_TRUE_PEAK_DBTP}:LRA=${LOUDNESS_RANGE_LU}`

/** Pass one: listen only. The numbers come back on the error stream. */
export function loudnormMeasureFilter() {
  return `loudnorm=${TARGETS}:print_format=json`
}

/** Pass two: apply what was measured, back at the export's sample rate. */
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

/**
 * Pull the measurement out of ffmpeg's output. Nothing comes back when the
 * block is missing or any number is not a number — a silent mix reports "-inf",
 * and there is no loudness there to correct.
 */
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

// Every value is printed as text ("-23.45", "-inf").
function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}
