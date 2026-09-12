import { z } from "zod"

import {
  CANDLE_INTERVALS,
  type CandleInterval,
} from "@/lib/protocols/contracts"

/**
 * What a drawing on the chart is.
 *
 * Levels, trendlines and fibs are shapes, and the chart knows
 * about none of them. It offers coordinates and a place to draw; everything in this
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
 * What every shape carries besides its geometry: a description typed in the
 * line's window, shown beside the line and said in the notice instead of a
 * price. The stored key stays `name` so drawings saved before the field was
 * renamed remain readable. Left out when the line has no description.
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
  | ({ kind: "fib"; from: DrawingPoint; to: DrawingPoint } & Named)

/** Enough room for a useful sentence without accepting unbounded browser input. */
export const MAX_DRAWING_DESCRIPTION_LENGTH = 240

/**
 * The largest break buffer that can be stored, as a percentage. Far past
 * anything anybody would type; it is here because this is a number arriving
 * from a browser and every one of those needs a ceiling.
 */
export const MAX_DRAWING_BUFFER_PCT = 100

/** The first break buffer before the account has saved a different choice. */
export const DEFAULT_DRAWING_BUFFER_PCT = 1

/**
 * How many times its recent average a candle's volume has to be before a
 * volume-confirmed break counts, when the account has not chosen a number.
 */
export const DEFAULT_DRAWING_VOLUME_MULTIPLE = 1.5

/**
 * The largest volume multiple that can be stored. Far past anything anybody
 * would ask for; it is here because this is a number arriving from a browser.
 */
export const MAX_DRAWING_VOLUME_MULTIPLE = 100

/**
 * How many finished candles before the breaking one the average is taken
 * over. Twenty is what the task settled on, and the whole twenty are
 * required: an average over three candles is not an average.
 */
export const DRAWING_VOLUME_LOOKBACK = 20

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
  /** Absolute expiry in epoch milliseconds. Missing means never. */
  expiresAt?: number
  expiresAtLineEnd?: true
  /**
   * Where the line was at the moment it fired, so the chart can put a dot
   * there. Left out on rows fired before the dot existed.
   */
  firedPrice?: number
  /** The actual buffered threshold used by the firing pass. */
  firedThreshold?: number
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
  /**
   * **Which finished candle has to close past the line**, instead of firing
   * the moment a live price touches it. Left out is a touch, which is what
   * every line did before this and what every line still does until somebody
   * asks for a close.
   *
   * A close on the far side is what most people mean by a break. Firing on the
   * touch means being woken by every wick.
   */
  closeInterval?: CandleInterval
  /**
   * **How many times its recent average the breaking candle's volume has to
   * be.** Left out is no volume condition at all.
   *
   * Only ever read alongside `closeInterval`, because a pushed price carries
   * no volume of its own.
   */
  volumeMultiple?: number
}

export const MAX_DRAWING_EXPIRY_DAYS = 36500
export const DRAWING_EXPIRY_DAY_MS = 86_400_000

export const drawingExpirySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("never") }),
  z.object({
    mode: z.literal("days"),
    days: z.number().int().min(1).max(MAX_DRAWING_EXPIRY_DAYS),
  }),
  z.object({ mode: z.literal("line-end") }),
])
export type DrawingExpiry = z.infer<typeof drawingExpirySchema>

export function drawingAlertExpired(alert: DrawingAlert, now: number): boolean {
  return alert.expiresAt !== undefined && alert.expiresAt <= now
}

export function expiringAlert(
  alert: DrawingAlert,
  shape: DrawingShape,
  expiry: DrawingExpiry,
  now: number
): DrawingAlert {
  const next = { ...alert }
  delete next.expiresAt
  delete next.expiresAtLineEnd
  if (expiry.mode === "never") return next
  let expiresAt: number
  if (expiry.mode === "days") {
    expiresAt = now + expiry.days * DRAWING_EXPIRY_DAY_MS
  } else {
    if (shape.kind !== "trendline")
      throw new Error("DRAWING_ALERT_LINE_END_UNAVAILABLE")
    expiresAt = shape.to.time
    if (expiresAt <= now) throw new Error("DRAWING_ALERT_LINE_END_PAST")
  }
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > MAX_TIME_MS
  ) {
    throw new Error("DRAWING_ALERT_INVALID_EXPIRY")
  }
  next.expiresAt = expiresAt
  if (expiry.mode === "line-end") next.expiresAtLineEnd = true
  return next
}

/** One saved drawing: its id, where it sits, and the alert it carries. */
export type Drawing = {
  id: string
  shape: DrawingShape
  alert: DrawingAlert | null
}

// Bounds that keep a stored row sane rather than expressing a trading rule.
// Times run from the epoch to the year 2100; a price is any real number,
// because a chart whose price axis has been dragged below zero can genuinely
// be clicked there and refusing the click silently would be worse.
const MAX_TIME_MS = 4_102_444_800_000

const pointSchema = z.object({
  time: z.number().int().min(0).max(MAX_TIME_MS),
  price: z.number().finite(),
})

// Trimmed before it is measured, so a description of nothing but spaces is
// refused rather than stored as text that draws as blank and reads as blank.
const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_DRAWING_DESCRIPTION_LENGTH)
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
      kind: z.literal("fib"),
      from: pointSchema,
      to: pointSchema,
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
  expiresAt: z.number().int().min(0).max(MAX_TIME_MS).optional(),
  expiresAtLineEnd: z.literal(true).optional(),
  firedPrice: z.number().finite().optional(),
  firedThreshold: z.number().finite().optional(),
  buffer: z.number().positive().max(MAX_DRAWING_BUFFER_PCT).optional(),
  closeInterval: z.enum(CANDLE_INTERVALS).optional(),
  volumeMultiple: z
    .number()
    .positive()
    .max(MAX_DRAWING_VOLUME_MULTIPLE)
    .optional(),
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
 * A volume multiple typed into the line's window. Blank is none, which is
 * null, and means the line fires on the close whatever the volume was. Text
 * that is not a multiple above zero answers `false`, which marks the field and
 * saves nothing rather than storing a guess. A trailing "x" is taken off,
 * because that is what a person types.
 */
export function readDrawingVolumeMultiple(raw: string): number | null | false {
  const text = raw.trim().replace(/x$/i, "").trim()
  if (text === "") return null
  const multiple = Number(text)
  if (!Number.isFinite(multiple) || multiple <= 0) return false
  return multiple > MAX_DRAWING_VOLUME_MULTIPLE ? false : multiple
}

/**
 * What a line is waiting for, as one word: a price touching it, or a finished
 * candle closing past it.
 */
export function drawingAlertFiresOn(
  alert: DrawingAlert | null
): "touch" | "close" {
  return alert?.closeInterval === undefined ? "touch" : "close"
}

/**
 * The same alert with its close timeframe and volume multiple set, or with
 * either taken off.
 *
 * Both are written together because the window always knows both, which
 * removes the whole question of what a half-sent rule means. A key is deleted
 * rather than stored as null, so a line that never asked for a close reads
 * exactly as it always did.
 */
export function ruledAlert(
  alert: DrawingAlert,
  rules: {
    closeInterval: CandleInterval | null
    volumeMultiple: number | null
  }
): DrawingAlert {
  const next = { ...alert }
  if (rules.closeInterval === null) delete next.closeInterval
  else next.closeInterval = rules.closeInterval
  if (rules.volumeMultiple === null) delete next.volumeMultiple
  else next.volumeMultiple = rules.volumeMultiple
  return next
}

/**
 * A fresh alert wearing the rules the last one on this line carried: the break
 * buffer, the close timeframe and the volume multiple.
 *
 * Arming a line that has already fired watches it the same way as before,
 * rather than quietly dropping back to a touch. Only what the person set
 * travels; the direction and the armed time are read fresh, because those
 * describe this arming and not the last one. A line switched off by hand has
 * no record left to carry, which is what switching it off means.
 */
export function rearmedAlert(
  fresh: DrawingAlert,
  previous: DrawingAlert | null,
  fallbackBuffer: number | null
): DrawingAlert {
  const buffered = bufferedAlert(
    fresh,
    previous ? (previous.buffer ?? null) : fallbackBuffer
  )
  return ruledAlert(buffered, {
    closeInterval: previous?.closeInterval ?? null,
    volumeMultiple: previous?.volumeMultiple ?? null,
  })
}

/**
 * Whether a breaking candle's volume clears its recent average, or null when
 * there is no honest answer and the line must keep waiting.
 *
 * Null, not false, in two cases, because neither is a quiet break — both are
 * the app not knowing:
 *
 * - **Fewer than the full lookback.** A coin listed yesterday has three
 *   candles, and three candles are not an average.
 * - **An average of nothing.** Markets with no borrowable history get minute
 *   bars built from watched prices, and a price carries no volume, so every
 *   one of those bars is zero. Without this the comparison would be "at least
 *   1.5 times nothing", which every candle passes, and the filter would read
 *   as working while doing the opposite of what it says.
 */
export function volumeConfirmsBreak(input: {
  breaking: number
  previous: readonly number[]
  multiple: number
}): boolean | null {
  if (input.previous.length < DRAWING_VOLUME_LOOKBACK) return null
  const recent = input.previous.slice(-DRAWING_VOLUME_LOOKBACK)
  const average = recent.reduce((sum, one) => sum + one, 0) / recent.length
  if (!(average > 0)) return null
  return input.breaking >= average * input.multiple
}

/**
 * Where a drawing sits at one moment, in dollars.
 *
 * A level is the same price at every moment. A trendline is read along its
 * slope, carried on past either end, so a line drawn through last week still
 * has a price today. Two ends at the same moment make a vertical line, which
 * has no one price, so that answers null. Fibs also answer null
 * because a fib does not support an alert.
 */
export function priceAtTime(shape: DrawingShape, time: number): number | null {
  if (shape.kind === "level") return shape.price
  if (shape.kind !== "trendline") return null
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
      : `${shape.kind === "fib" ? "fib retracement" : shape.kind} from ${formatPrice(shape.from.price)} to ${formatPrice(shape.to.price)}`
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

/** Seven levels between the first price and the second, in drag order. */
export function fibLevels(shape: Extract<DrawingShape, { kind: "fib" }>) {
  return [0, 23.6, 38.2, 50, 61.8, 78.6, 100].map((percent) => ({
    percent,
    price:
      shape.from.price * (1 - percent / 100) + shape.to.price * (percent / 100),
  }))
}
