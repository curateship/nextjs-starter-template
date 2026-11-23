/**
 * Brightness, contrast and saturation on a video or picture clip.
 *
 * The three numbers are ffmpeg's own `eq` numbers, stored as they are.
 * Brightness is added to how light every pixel is, 0 changes nothing and 0.1
 * lifts the whole picture by a tenth of the way from black to white. Contrast
 * spreads the light and dark parts apart around the middle grey, 1 changes
 * nothing. Saturation scales how strong the colours are, 1 changes nothing and
 * 0 is black and white.
 *
 * Absent means no change, so every timeline saved before this setting existed
 * reads and renders exactly as it did, and the export adds no filter for it.
 *
 * This module is the one place the three ends agree: the schema takes the
 * limits from here, the export builds its `eq` filter here, and the preview
 * builds the colour matrix that does the same sums in the browser.
 */

export const MIN_CLIP_BRIGHTNESS = -0.5
export const MAX_CLIP_BRIGHTNESS = 0.5
export const MIN_CLIP_CONTRAST = 0.5
export const MAX_CLIP_CONTRAST = 2
export const MIN_CLIP_SATURATION = 0
export const MAX_CLIP_SATURATION = 2
export const CLIP_COLOUR_STEP = 0.01

export type ClipColour = {
  brightness: number
  contrast: number
  saturation: number
}

export const UNTOUCHED_COLOUR: ClipColour = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
}

/** The clip's three numbers, with anything unset reading as no change. */
export function clipColour(clip: {
  brightness?: number
  contrast?: number
  saturation?: number
}): ClipColour {
  return {
    brightness: clip.brightness ?? UNTOUCHED_COLOUR.brightness,
    contrast: clip.contrast ?? UNTOUCHED_COLOUR.contrast,
    saturation: clip.saturation ?? UNTOUCHED_COLOUR.saturation,
  }
}

export function isColourTouched(colour: ClipColour): boolean {
  return (
    colour.brightness !== UNTOUCHED_COLOUR.brightness ||
    colour.contrast !== UNTOUCHED_COLOUR.contrast ||
    colour.saturation !== UNTOUCHED_COLOUR.saturation
  )
}

/**
 * The export's filter, or nothing for a clip left alone. Nothing rather than a
 * filter set to no change, so an untouched clip costs no render time at all.
 *
 * `eq` reads brightness in whole hundredths and cuts rather than rounds, and
 * it holds the number at low precision, so -0.2 arrives as -0.2000000003 and
 * is cut to -0.21. The tiny nudge upwards lands it on the hundredth that was
 * asked for. Measured on every grey level: with the nudge `eq` lands exactly
 * where the matrix below expects, and without it -0.2 lands up to 3 levels
 * darker.
 */
export function colourEqFilter(colour: ClipColour): string | null {
  if (!isColourTouched(colour)) return null
  const brightness = colour.brightness + BRIGHTNESS_NUDGE
  return `eq=brightness=${brightness.toFixed(6)}:contrast=${colour.contrast}:saturation=${colour.saturation}`
}

const BRIGHTNESS_NUDGE = 0.000001

/**
 * The same change as `eq`, written as a colour matrix the browser can apply.
 *
 * `eq` works on the stored form of a video: one channel for how light a pixel
 * is (luma, 16 to 235) and two for its colour (chroma, centred on 128). For
 * settings in these ranges it takes a fast path with whole-number sums, taken
 * from MPlayer, rather than the formula in its documentation:
 *
 *   out = floor(in * k / 4096) + floor(n * 511 / 200) - 128 - floor(k / 32)
 *
 * with `k` the contrast times 4096 cut to a whole number and `n` the
 * brightness in hundredths plus 100. The colour channels go through the same
 * sum with the saturation as `k` and no brightness. Both are straight lines,
 * as is the conversion between that stored form and red, green and blue, so
 * the whole change is one matrix on red, green and blue. The floor loses half
 * a level on average whenever `k` is not a whole multiple of 4096, and the sum
 * leaves the colour channels about one level off centre, which tints very
 * slightly. Both are in the matrix so the preview makes the same tint.
 *
 * Luma mixes red, green and blue with the BT.601 weights. That is what
 * ffmpeg uses when it turns a picture into video, and the export is written
 * without a colour tag, so players read it back with BT.601 too. BT.709
 * weights were tried first and left black and white 17 levels lighter in the
 * preview than in the export on a strong green; BT.601 brings it within a
 * few levels. The result is the 20 numbers an SVG `feColorMatrix` takes: four
 * rows of red, green, blue, alpha and a constant, alpha untouched.
 */
export function colourMatrix(colour: ClipColour): number[] {
  const lumaTouched =
    colour.brightness !== UNTOUCHED_COLOUR.brightness ||
    colour.contrast !== UNTOUCHED_COLOUR.contrast
  const chromaTouched = colour.saturation !== UNTOUCHED_COLOUR.saturation

  // Luma on its 16 to 235 scale: out = slope * in + shift.
  const luma = lumaTouched
    ? eqLine(colour.contrast, Math.round(colour.brightness * 100) + 100)
    : { slope: 1, shift: 0 }
  // Chroma around 128: out - 128 = slope * (in - 128) + drift.
  const chroma = chromaTouched
    ? eqLine(colour.saturation, 100)
    : { slope: 1, shift: 0 }
  const drift = chroma.shift + 128 * chroma.slope - 128

  // Luma from 0 to 1: L' = slope * L + offset.
  const offset = (16 * luma.slope + luma.shift - 16) / LUMA_RANGE
  // A drift of one chroma level moves each of red, green and blue by these
  // amounts, from the BT.601 conversion back to red, green and blue.
  const tint = [
    (1.402 * drift) / CHROMA_RANGE,
    ((-0.344136 - 0.714136) * drift) / CHROMA_RANGE,
    (1.772 * drift) / CHROMA_RANGE,
  ]

  // channel' = L' + chroma.slope * (channel - L) + tint
  const rows = [0, 1, 2].map((channel) => [
    ...LUMA_WEIGHTS.map(
      (weight, column) =>
        (luma.slope - chroma.slope) * weight +
        (column === channel ? chroma.slope : 0)
    ),
    0,
    offset + tint[channel],
  ])
  return [...rows.flat(), 0, 0, 0, 1, 0].map(roundMatrix)
}

const LUMA_WEIGHTS = [0.299, 0.587, 0.114]
const LUMA_RANGE = 219
const CHROMA_RANGE = 224

/** `eq`'s whole-number sum as a line, with the floor's average loss taken in. */
function eqLine(factor: number, hundredths: number) {
  const k = Math.floor(factor * 4096)
  const floorLoss = k % 4096 === 0 ? 0 : 0.5
  return {
    slope: k / 4096,
    shift:
      Math.floor((hundredths * 511) / 200) -
      128 -
      Math.floor(k / 32) -
      floorLoss,
  }
}

function roundMatrix(value: number) {
  return Math.round(value * 1e5) / 1e5
}
