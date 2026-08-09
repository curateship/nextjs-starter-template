import type { CandleBar } from "@/lib/protocols/contracts"

/**
 * What an indicator is, in this app.
 *
 * One module per indicator: it says what it is called, what can be set on it,
 * and what it draws over a list of candles. Nothing else. It never reaches the
 * chart, the database or a screen — the chart is handed shapes and the settings
 * menu is built from the same field list the settings are read through, so a
 * value that is stored and a value that is drawn can never disagree.
 *
 * That last part is the whole trick. There is no second schema: `fields` below
 * is the form AND the validator. Adding a setting is one entry in one list.
 */

/** The parts of a candle every indicator works from. */
export type IndicatorCandle = Pick<
  CandleBar,
  "openTime" | "high" | "low" | "close"
>

/**
 * Which way a shape reads — up is a floor and a green arrow under the candle,
 * down is a ceiling and a red arrow over it.
 *
 * Deliberately about drawing rather than about trading: the layer that paints
 * these knows how to draw an arrow and nothing about what a base is.
 */
export type IndicatorSide = "up" | "down"

/** A short horizontal mark at a level, spanning the candles it was found on. */
export type IndicatorDash = {
  fromTime: number
  toTime: number
  price: number
  side: IndicatorSide
}

/** An arrow at one candle — the candle that confirmed something. */
export type IndicatorMark = {
  time: number
  price: number
  side: IndicatorSide
}

/** Everything an indicator wants drawn, in the market's own coordinates. */
export type IndicatorPaint = { dashes: IndicatorDash[]; marks: IndicatorMark[] }

/** What one setting holds. Nothing else is storable, on purpose. */
export type IndicatorParams = Record<string, number | boolean>

/**
 * One setting: what it is called, what it means, and what it may hold.
 *
 * `fallback` is the value used when nothing is stored and when what is stored
 * cannot be read. It is written once, here — never a second time next to the
 * form or next to the maths.
 */
export type IndicatorField = {
  key: string
  label: string
  /** One plain sentence, shown beside the label. */
  hint: string
} & (
  | { kind: "number"; min: number; max: number; fallback: number }
  | { kind: "switch"; fallback: boolean }
)

/**
 * One card of settings in the menu, and the fields on it.
 *
 * The layout, kept apart from the fields themselves: `fields` is what a setting
 * IS and `groups` is where it sits. Every field belongs to exactly one card —
 * a field in none of them would simply never be drawn, which a test in
 * `registry.test.ts` is there to catch.
 */
export type IndicatorGroup = { title: string; keys: string[] }

/** One indicator. The registry holds these; nothing else builds one. */
export type IndicatorModule = {
  kind: string
  label: string
  /** One plain sentence: what it looks for and what it draws. */
  description: string
  fields: IndicatorField[]
  /** The cards its settings are split across, in the order they are drawn. */
  groups: IndicatorGroup[]
  /**
   * What to draw. Given whatever is stored — junk included: it reads its own
   * settings through `readIndicatorParams` first, so it can never be handed a
   * number it did not ask for.
   */
  compute(candles: IndicatorCandle[], params: IndicatorParams): IndicatorPaint
  /**
   * One line about the settings as they stand, when there is something worth
   * saying — a setting quietly capping another one, most often. Null the rest
   * of the time, which is nearly always.
   *
   * It lives here rather than in the menu so the menu stays a menu: it knows
   * how to draw a field and a sentence, and nothing about what any of them
   * mean.
   */
  note?(params: IndicatorParams): string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Stored settings as settings this indicator can use.
 *
 * The one gate, in both directions. Going in it stops a hand-made request
 * writing a number nobody offered; coming out it stops a row written by an
 * older build being drawn as something it is not. It never throws and never
 * answers a missing field: every field in the list comes back, with the stored
 * value when it can be read and the fallback when it cannot.
 *
 * Numbers are whole and inside their range, because every setting here is a
 * count of candles. A fraction of a candle is not a thing.
 */
export function readIndicatorParams(
  fields: IndicatorField[],
  value: unknown
): IndicatorParams {
  const held = isRecord(value) ? value : {}
  const params: IndicatorParams = {}
  for (const field of fields) {
    const stored = held[field.key]
    if (field.kind === "switch") {
      params[field.key] = typeof stored === "boolean" ? stored : field.fallback
      continue
    }
    params[field.key] =
      typeof stored === "number" && Number.isFinite(stored)
        ? Math.min(Math.max(Math.round(stored), field.min), field.max)
        : field.fallback
  }
  return params
}

/** What an indicator is set to before anybody changes anything. */
export function defaultIndicatorParams(
  fields: IndicatorField[]
): IndicatorParams {
  return readIndicatorParams(fields, {})
}
