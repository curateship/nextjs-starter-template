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

/**
 * What every shape carries besides its geometry: a short name typed in the
 * line's window, shown beside the line and said in the notice instead of a
 * price. Left out when the line has none.
 */
type Named = { name?: string }

export type DrawingShape =
  /** A price, drawn all the way across. Time means nothing to it. */
  | ({ kind: "level"; price: number } & Named)
  /**
   * Two points with a line between them. `extendRight` carries the line on
   * past its later point to the right edge of the chart, so the place an
   * alert would fire can be seen. Left out on older rows, which means off.
   */
  | ({
      kind: "trendline"
      from: DrawingPoint
      to: DrawingPoint
      extendRight?: boolean
    } & Named)

/** How long a line's name may be. Enough for "4h base" or "weekly low". */
export const MAX_DRAWING_NAME_LENGTH = 24

/**
 * The largest break buffer that can be stored, as a percentage. Far past
 * anything anybody would type; it is here because this is a number arriving
 * from a browser and every one of those needs a ceiling.
 */
export const MAX_DRAWING_BUFFER_PCT = 100

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
  /**
   * Where the line was at the moment it fired, so the chart can put a dot
   * there. Left out on rows fired before the dot existed.
   */
  firedPrice?: number
  /**
   * How far past the line the price has to go before this fires, as a
   * percentage of where the line is. Left out for none, which is the line
   * itself.
   *
   * A percentage rather than dollars, in Tyler's words on 3 Sep 2026: "It
   * should be percentage. NOt price". Dollars only work on one coin. The same
   * "$50 past it" that is a sensible break on Bitcoin is meaningless on a coin
   * at twenty cents, and one line on that coin was armed with a $50 buffer it
   * could never reach. A percentage is the same instruction on every coin.
   *
   * The key keeps the name it had while it briefly held dollars. The name says
   * nothing about the unit, and renaming it would leave the one row already
   * carrying a number unreadable, which would quietly stop that line firing.
   */
  buffer?: number
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

// Trimmed before it is measured, so a name of nothing but spaces is refused
// rather than stored as a name that draws as blank and reads as blank.
const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_DRAWING_NAME_LENGTH)
  .optional()

/**
 * The one gate a shape passes through, in both directions. Coming in it stops
 * a hand-made request writing junk into the row; going out it stops a row
 * written by an older build being drawn as something it is not — an
 * unreadable row is dropped, never guessed at.
 */
export const drawingShapeSchema: z.ZodType<DrawingShape> = z.discriminatedUnion(
  "kind",
  [
    z.object({
      kind: z.literal("level"),
      price: z.number().finite(),
      name: nameSchema,
    }),
    z.object({
      kind: z.literal("trendline"),
      from: pointSchema,
      to: pointSchema,
      extendRight: z.boolean().optional(),
      name: nameSchema,
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

/**
 * Thrown when a buffer is sent for a line whose alert is off or has already
 * rung. The window only offers the field on an armed line, so this is a
 * window left open while the engine fired the alert underneath it.
 */
export const DRAWING_ALERT_NOT_ARMED = "DRAWING_ALERT_NOT_ARMED"

/** A stored shape, or null when the row cannot be read. */
export function readDrawingShape(value: unknown): DrawingShape | null {
  const parsed = drawingShapeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const drawingAlertSchema: z.ZodType<DrawingAlert> = z.object({
  direction: z.enum(["above", "below"]),
  armedAt: z.number().int().min(0).max(MAX_TIME_MS),
  firedAt: z.number().int().min(0).max(MAX_TIME_MS).nullable(),
  firedPrice: z.number().finite().optional(),
  buffer: z.number().positive().max(MAX_DRAWING_BUFFER_PCT).optional(),
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
 * Where an alert actually fires: the line's price at that moment, moved that
 * percentage onto the side the alert is waiting for. Without a buffer it is
 * the line itself.
 *
 * One place, because the engine compares against it and the line's window
 * says it out loud. Two copies of this sum would be two answers.
 *
 * Measured off the size of the price rather than the price itself, so a line
 * dragged below zero still moves the way the words say. A chart whose axis
 * has been pulled under zero can genuinely be clicked there.
 */
export function alertFirePrice(
  linePrice: number,
  direction: "above" | "below",
  bufferPct: number | null | undefined
): number {
  const past = Math.abs(linePrice) * ((bufferPct ?? 0) / 100)
  return direction === "above" ? linePrice + past : linePrice - past
}

/**
 * A break buffer typed into the line's window, as a percentage. Blank is
 * none, which is null. Text that is not a percentage above zero answers
 * `false`, which marks the field and saves nothing rather than storing a
 * guess. A trailing percent sign is taken off, because that is what a person
 * types.
 */
export function readDrawingBuffer(raw: string): number | null | false {
  const text = raw.trim().replace(/%$/, "").trim()
  if (text === "") return null
  const pct = Number(text)
  if (!Number.isFinite(pct) || pct <= 0) return false
  return pct > MAX_DRAWING_BUFFER_PCT ? false : pct
}

/** The same alert with its buffer set, or with none once it is cleared. */
export function bufferedAlert(
  alert: DrawingAlert,
  buffer: number | null
): DrawingAlert {
  if (buffer !== null) return { ...alert, buffer }
  if (alert.buffer === undefined) return alert
  const without = { ...alert }
  delete without.buffer
  return without
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

/**
 * Where a drawing is, in words, ready to sit inside a longer sentence:
 * "level at $100", or "4h base, level at $100" once it has a name.
 */
export function describeDrawingInline(
  shape: DrawingShape,
  formatPrice: (price: number) => string
): string {
  const where =
    shape.kind === "level"
      ? `level at ${formatPrice(shape.price)}`
      : `trendline from ${formatPrice(shape.from.price)} to ${formatPrice(shape.to.price)}`
  return shape.name ? `${shape.name}, ${where}` : where
}

/**
 * What a screen reader is told about a drawing, standing on its own: its name
 * first when it has one, then what and where it is.
 *
 * Only the leading word is ever changed. Lowering the whole sentence to fit a
 * name in front of it also lowered the name somebody typed, so a line called
 * "This is a test" was read back as "this is a test".
 */
export function describeDrawing(
  shape: DrawingShape,
  formatPrice: (price: number) => string
): string {
  const said = describeDrawingInline(shape, formatPrice)
  return shape.name ? said : said.charAt(0).toUpperCase() + said.slice(1)
}

/**
 * The same drawing with its name set, or with no name when the text is
 * blank. The key is dropped rather than saved empty, so an unnamed line's
 * row reads the same whether it was ever named or not.
 */
export function namedShape(shape: DrawingShape, raw: string): DrawingShape {
  const name = raw.trim()
  if (name !== "") return { ...shape, name }
  if (shape.name === undefined) return shape
  const unnamed = { ...shape }
  delete unnamed.name
  return unnamed
}

/** The same drawing, moved by a difference in time and in price. */
export function moveShape(
  shape: DrawingShape,
  byTime: number,
  byPrice: number
): DrawingShape {
  if (shape.kind === "level") {
    return { ...shape, price: shape.price + byPrice }
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
