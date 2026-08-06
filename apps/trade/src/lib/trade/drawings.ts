import { z } from "zod"

/**
 * What a drawing on the chart is.
 *
 * Two shapes today — a horizontal level and a trendline — and the chart knows
 * about neither. It offers coordinates and a place to draw; everything in this
 * file and the paint components is the consumer of that surface. An alert or
 * an order attached to a line later is another consumer, not a change here.
 *
 * A drawing is stored in market coordinates — time in epoch milliseconds and a
 * price — never in pixels. That is what lets the same line come back at any
 * zoom, on any timeframe, after any reload.
 */

/** Anywhere on the chart: when, and at what price. */
export type DrawingPoint = { time: number; price: number }

export type DrawingShape =
  /** A price, drawn all the way across. Time means nothing to it. */
  | { kind: "level"; price: number }
  /** Two points with a line between them. */
  | { kind: "trendline"; from: DrawingPoint; to: DrawingPoint }

/** One saved drawing: its id, and where it sits. */
export type Drawing = { id: string; shape: DrawingShape }

// Bounds that keep a stored row sane rather than expressing a trading rule.
// Times run from the epoch to the year 2100; a price is any real number,
// because a chart whose price axis has been dragged below zero can genuinely
// be clicked there and refusing the click silently would be worse.
const MAX_TIME_MS = 4_102_444_800_000

const pointSchema = z.object({
  time: z.number().int().min(0).max(MAX_TIME_MS),
  price: z.number().finite(),
})

/**
 * The one gate a shape passes through, in both directions. Coming in it stops
 * a hand-made request writing junk into the row; going out it stops a row
 * written by an older build being drawn as something it is not — an
 * unreadable row is dropped, never guessed at.
 */
export const drawingShapeSchema: z.ZodType<DrawingShape> = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("level"), price: z.number().finite() }),
    z.object({
      kind: z.literal("trendline"),
      from: pointSchema,
      to: pointSchema,
    }),
  ]
)

/**
 * How many drawings one market may hold for one person. Marking bases is
 * hand work, so this is generosity rather than a limit anybody meets — it is
 * here because this is the only door into the table and an unbounded one
 * would let a stuck loop fill it.
 */
export const MAX_DRAWINGS_PER_MARKET = 200

/**
 * What the server throws when that cap is reached, and the code the toast
 * looks for. It lives here rather than beside the code that throws it because
 * the sentence is built in the browser: importing a value out of `@/server/*`
 * drags the database driver into the browser bundle, where it fails on the
 * first thing it touches that only Node has.
 */
export const DRAWINGS_FULL = "DRAWINGS_FULL"

/** A stored shape, or null when the row cannot be read. */
export function readDrawingShape(value: unknown): DrawingShape | null {
  const parsed = drawingShapeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** What a screen reader is told about a drawing. */
export function describeDrawing(
  shape: DrawingShape,
  formatPrice: (price: number) => string
): string {
  return shape.kind === "level"
    ? `Level at ${formatPrice(shape.price)}`
    : `Trendline from ${formatPrice(shape.from.price)} to ${formatPrice(shape.to.price)}`
}

/** The same drawing, moved by a difference in time and in price. */
export function moveShape(
  shape: DrawingShape,
  byTime: number,
  byPrice: number
): DrawingShape {
  if (shape.kind === "level") {
    return { kind: "level", price: shape.price + byPrice }
  }
  return {
    kind: "trendline",
    from: {
      time: Math.round(shape.from.time + byTime),
      price: shape.from.price + byPrice,
    },
    to: {
      time: Math.round(shape.to.time + byTime),
      price: shape.to.price + byPrice,
    },
  }
}
