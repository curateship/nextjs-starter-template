/**
 * Film looks on a video or picture clip (workspace/docs/colour-looks.md).
 *
 * A look is one colour file, a LUT: for every colour that goes in, the colour
 * that comes out. Each look here is written as two steps, so the same look
 * can be drawn exactly the same way in two places:
 *
 * 1. A colour mix: each of red, green and blue out is a sum of the three in,
 *    plus a constant. This is where colour is taken away (black and white,
 *    faded) or pushed further (vivid).
 * 2. A curve for each of red, green and blue on its own, given as its value
 *    at 9 evenly spaced points from black to white, joined by straight lines.
 *    This is where the shadows go one colour and the highlights another, and
 *    where the blacks are lifted.
 *
 * The preview draws these two steps as an SVG `feColorMatrix` and an
 * `feComponentTransfer` table, which is exactly a 9-point straight-line curve.
 * The export writes the same two steps out as a `.cube` LUT of 33 by 33 by 33
 * colours and hands it to ffmpeg's `lut3d`, which joins its points the same
 * straight way. Both clamp to black and white between the steps. The looks
 * are Video's own sums, so there is no licence to keep beside them.
 *
 * The look goes on before the brightness, contrast and saturation sliders,
 * in both places, so the sliders adjust the look rather than the other way.
 */

export const FILM_LOOK_IDS = [
  "warm",
  "cool",
  "teal-orange",
  "faded",
  "vintage",
  "noir",
  "bleach",
  "vivid",
] as const
export type FilmLookId = (typeof FILM_LOOK_IDS)[number]

/** How many points along each curve. An SVG table of this many values. */
export const CURVE_POINTS = 9
/** The export's LUT has this many steps along each of red, green and blue. */
export const LUT_SIZE = 33

type Curve = (x: number) => number
type Mix = number[][] // three rows of [r, g, b, constant]

// BT.601, the weights the export's video is written with (clip-colour.ts).
const LUMA = [0.299, 0.587, 0.114]

/** A colour mix that sets how strong the colours are: 0 grey, 1 unchanged. */
function saturationMix(amount: number): Mix {
  return [0, 1, 2].map((row) => [
    ...LUMA.map((weight, column) => (1 - amount) * weight + (row === column ? amount : 0)),
    0,
  ])
}

const straight: Curve = (x) => x

/** An S: darker shadows and brighter highlights by `amount`, middle grey kept. */
function sCurve(amount: number): Curve {
  return (x) => x - amount * Math.sin(2 * Math.PI * x)
}

/** Black lifted to `floor` and white brought down to `ceiling`. */
function faded(floor: number, ceiling: number, inner: Curve = straight): Curve {
  return (x) => floor + (ceiling - floor) * inner(x)
}

/** Pushes the shadows by `shadows` and the highlights by `highlights`. */
function splitTone(shadows: number, highlights: number, inner: Curve = straight): Curve {
  return (x) => inner(x) + shadows * (1 - x) ** 2 + highlights * x ** 2
}

type LookDefinition = {
  label: string
  description: string
  mix: Mix
  curves: [Curve, Curve, Curve]
}

const LOOKS: Record<FilmLookId, LookDefinition> = {
  warm: {
    label: "Warm",
    description: "Golden, late-afternoon light",
    mix: saturationMix(1.05),
    curves: [splitTone(0.01, 0.05), splitTone(0, 0.015), splitTone(-0.02, -0.06)],
  },
  cool: {
    label: "Cool",
    description: "Clean blue daylight",
    mix: saturationMix(0.95),
    curves: [splitTone(-0.02, -0.04), straight, splitTone(0.03, 0.05)],
  },
  "teal-orange": {
    label: "Teal and orange",
    description: "Blockbuster: teal shadows, warm skin",
    mix: saturationMix(1.1),
    curves: [
      splitTone(-0.06, 0.06, sCurve(0.04)),
      splitTone(0.02, 0.01, sCurve(0.04)),
      splitTone(0.08, -0.08, sCurve(0.04)),
    ],
  },
  faded: {
    label: "Faded film",
    description: "Milky blacks, soft colour",
    mix: saturationMix(0.8),
    curves: [faded(0.08, 0.95), faded(0.08, 0.95), faded(0.1, 0.93)],
  },
  vintage: {
    label: "Vintage",
    description: "Warm, faded, a little green in the shadows",
    mix: saturationMix(0.75),
    curves: [
      faded(0.07, 0.97, splitTone(0, 0.06)),
      faded(0.09, 0.95, splitTone(0.03, 0)),
      faded(0.06, 0.88, splitTone(0, -0.06)),
    ],
  },
  noir: {
    label: "Noir",
    description: "Black and white with deep shadows",
    mix: saturationMix(0),
    curves: [sCurve(0.12), sCurve(0.12), sCurve(0.12)],
  },
  bleach: {
    label: "Bleach bypass",
    description: "Silvery, low colour, hard contrast",
    mix: saturationMix(0.45),
    curves: [sCurve(0.1), sCurve(0.1), sCurve(0.1)],
  },
  vivid: {
    label: "Vivid",
    description: "Punchy colour for the feed",
    mix: saturationMix(1.35),
    curves: [sCurve(0.05), sCurve(0.05), sCurve(0.05)],
  },
}

export const FILM_LOOKS = FILM_LOOK_IDS.map((id) => ({
  id,
  label: LOOKS[id].label,
  description: LOOKS[id].description,
}))

/** The clip's look, or null for none or anything unknown. */
export function clipLook(clip: { look?: string }): FilmLookId | null {
  return (FILM_LOOK_IDS as readonly string[]).includes(clip.look ?? "")
    ? (clip.look as FilmLookId)
    : null
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

/** Each curve as its 9 points, rounded the way both ends use them. */
export function lookCurveTables(id: FilmLookId): [number[], number[], number[]] {
  return LOOKS[id].curves.map((curve) =>
    Array.from({ length: CURVE_POINTS }, (_, index) =>
      round(clamp01(curve(index / (CURVE_POINTS - 1))))
    )
  ) as [number[], number[], number[]]
}

/** The colour mix as the 20 numbers an SVG `feColorMatrix` takes. */
export function lookMatrixValues(id: FilmLookId): number[] {
  return [
    ...LOOKS[id].mix.flatMap(([r, g, b, constant]) => [r, g, b, 0, constant]),
    0, 0, 0, 1, 0,
  ].map(round)
}

/** A 9-point straight-line curve read at `x`, the way SVG reads a table. */
function readTable(table: number[], x: number) {
  const scaled = clamp01(x) * (table.length - 1)
  const below = Math.min(table.length - 2, Math.floor(scaled))
  const between = scaled - below
  return table[below] + (table[below + 1] - table[below]) * between
}

/** One colour through the look, each channel 0 to 1. */
export function applyLook(id: FilmLookId, rgb: [number, number, number]): [number, number, number] {
  const matrix = lookMatrixValues(id)
  const tables = lookCurveTables(id)
  const mixed = [0, 1, 2].map((row) =>
    clamp01(
      matrix[row * 5] * rgb[0] +
        matrix[row * 5 + 1] * rgb[1] +
        matrix[row * 5 + 2] * rgb[2] +
        matrix[row * 5 + 4]
    )
  )
  return [0, 1, 2].map((channel) => clamp01(readTable(tables[channel], mixed[channel]))) as [
    number,
    number,
    number,
  ]
}

/** The look as a `.cube` LUT for ffmpeg's `lut3d`: red changes fastest. */
export function lookCube(id: FilmLookId) {
  const lines = [`TITLE "${LOOKS[id].label}"`, `LUT_3D_SIZE ${LUT_SIZE}`, ""]
  for (let b = 0; b < LUT_SIZE; b++) {
    for (let g = 0; g < LUT_SIZE; g++) {
      for (let r = 0; r < LUT_SIZE; r++) {
        const out = applyLook(id, [r / (LUT_SIZE - 1), g / (LUT_SIZE - 1), b / (LUT_SIZE - 1)])
        lines.push(out.map((value) => value.toFixed(6)).join(" "))
      }
    }
  }
  return `${lines.join("\n")}\n`
}

function round(value: number) {
  return Math.round(value * 1e5) / 1e5
}
