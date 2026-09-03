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
  /**
   * Two points with a line between them. `extendRight` carries the line on
   * past its later point to the right edge of the chart, so the place an
   * alert would fire can be seen. Left out on older rows, which means off.
   */
  | {
      kind: "trendline"
      from: DrawingPoint
      to: DrawingPoint
      extendRight?: boolean
    }

/**
 * The alert a line carries, once somebody has switched it on.
 *
 * The direction is fixed from the live price at the moment the switch goes
 * on, the same rule the purple price alerts use: a line above the price waits
 * for a rise, one below waits for a fall. It fires once. After that the record
 * stays, with `firedAt` set, so the popover can say when it went off, and the
 * switch reads as off. Switching it off by hand removes the record.
 */
export type DrawingAlert = {
  direction: "above" | "below"
  armedAt: number
  firedAt: number | null
}

/** One saved drawing: its id, where it sits, and the alert it carries. */
export type Drawing = { id: string; shape: DrawingShape; alert: DrawingAlert | null }

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
      extendRight: z.boolean().optional(),
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

/**
 * Thrown when there is no price to set the direction from: no live price on
 * the screen yet, or a vertical line with no one price of its own.
 */
export const DRAWING_ALERT_NO_PRICE = "DRAWING_ALERT_NO_PRICE"

/** A stored shape, or null when the row cannot be read. */
export function readDrawingShape(value: unknown): DrawingShape | null {
  const parsed = drawingShapeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const drawingAlertSchema: z.ZodType<DrawingAlert> = z.object({
  direction: z.enum(["above", "below"]),
  armedAt: z.number().int().min(0).max(MAX_TIME_MS),
  firedAt: z.number().int().min(0).max(MAX_TIME_MS).nullable(),
})

/**
 * A stored alert, or null when there is none or it cannot be read. An alert
 * that cannot be read is treated as no alert: the line still draws, and the
 * switch reads off, which is the honest answer for a record nobody can use.
 */
export function readDrawingAlert(value: unknown): DrawingAlert | null {
  if (value === null || value === undefined) return null
  const parsed = drawingAlertSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Switched on and not yet fired. */
export function drawingAlertArmed(alert: DrawingAlert | null): boolean {
  return alert !== null && alert.firedAt === null
}

/**
 * Where a drawing sits at one moment, in dollars.
 *
 * A level is the same price at every moment. A trendline is read along its
 * slope, carried on past either end, so a line drawn through last week still
 * has a price today. Two ends at the same moment make a vertical line, which
 * has no one price, so that answers null.
 */
export function priceAtTime(shape: DrawingShape, time: number): number | null {
  if (shape.kind === "level") return shape.price
  const span = shape.to.time - shape.from.time
  if (span === 0) return null
  const slope = (shape.to.price - shape.from.price) / span
  return shape.from.price + slope * (time - shape.from.time)
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
    ...shape,
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

/**
 * A trendline that draws on to the right edge, or the same drawing when it
 * already does, or is a level, which runs the whole width anyway. Switching
 * an alert on does this, because an alert on a line that stops dead at its
 * second point would be watching a place nobody can see.
 */
export function extendedRight(shape: DrawingShape): DrawingShape {
  return shape.kind === "trendline" && shape.extendRight !== true
    ? { ...shape, extendRight: true }
    : shape
}
