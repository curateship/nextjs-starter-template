import type { CandleBar, CandleInterval } from "@/lib/protocols/contracts"
import {
  clockTimeOfMinutes,
  minutesOfClockTime,
  type TradingZoneId,
} from "@/lib/trade/chart-timezone"

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

/**
 * A see-through rectangle across a stretch of time.
 *
 * Deliberately without a side. A dash is a floor or a ceiling and reads as one;
 * a box is an AREA price spent time in, and colouring it up or down would be
 * this shape claiming something it does not know. What the area meant is said
 * by the arrow that comes out of it.
 *
 * `fromTime` is the open of the first candle it covers and `toTime` is the end
 * of the last — the span, not two candle stamps — so a box over one candle
 * still has a width.
 */
export type IndicatorBox = {
  fromTime: number
  toTime: number
  /**
   * The top and the bottom of it, or null for every price — a band the whole
   * height of the plot, however far the chart is scrolled up or down.
   *
   * The two read as different things and are drawn as different things. A box
   * with prices is round something and gets an edge; a band is behind
   * everything and gets no edge, because an edge across a chart is a level and
   * a band is not claiming one.
   */
  price: { high: number; low: number } | null
}

/** Everything an indicator wants drawn, in the market's own coordinates. */
export type IndicatorPaint = {
  dashes: IndicatorDash[]
  marks: IndicatorMark[]
  boxes: IndicatorBox[]
}

/**
 * A moment an indicator calls, at the close of the candle that confirmed it.
 *
 * **Deliberately not `IndicatorMark` with a different word for `side`.** A mark
 * is a drawing — an arrow, at a price, pointing a way — and this is an
 * instruction. Sharing one type would mean every indicator that draws an arrow
 * had also volunteered to trade, which is the opposite of the split the rest of
 * this file is built on.
 *
 * No price, on purpose. The time names the candle; what the trade actually
 * costs is decided by whatever is trading, at the moment it trades, and a price
 * carried here would read like a promise the indicator is in no position to
 * make.
 */
export type IndicatorSignal = { time: number; side: "buy" | "sell" }

/**
 * What one setting holds. Nothing else is storable, on purpose.
 *
 * A string is either a clock time — "09:30" — or the value of one option from
 * a pick-one list. It is never free text: a box somebody can type anything
 * into is a box that needs rules of its own, and no indicator wants one.
 */
export type IndicatorParams = Record<string, number | boolean | string>

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
  /** A time of day on the chart's own clock, stored and shown as "09:30". */
  | { kind: "time"; fallback: string }
  /** One of a short written-down list. Anything else falls back. */
  | {
      kind: "choice"
      options: readonly IndicatorChoice[]
      fallback: string
    }
)

/** One option on a pick-one setting: what is stored, and what is shown. */
export type IndicatorChoice = { value: string; label: string }

/**
 * One card of settings in the menu, and the fields on it.
 *
 * The layout, kept apart from the fields themselves: `fields` is what a setting
 * IS and `groups` is where it sits. Every field belongs to exactly one card —
 * a field in none of them would simply never be drawn, which a test in
 * `registry.test.ts` is there to catch.
 */
export type IndicatorGroup = { title: string; keys: string[] }

/**
 * What the chart an indicator is drawing on is set to.
 *
 * Two things every indicator may need and neither of which is a setting of its
 * own: which clock the chart is on, and how long one of its candles lasts.
 *
 * **Handed in rather than saved on the indicator, so they cannot disagree.**
 * A session indicator carrying its own timezone would draw a box at 09:30 New
 * York on an axis labelled in UTC, and the picture would be internally
 * inconsistent with no way to tell which half was wrong. There is one clock,
 * it is picked in the chart's View options, and everything reads it.
 */
export type IndicatorContext = {
  /** The chart's one timezone. See `chart-timezone.ts`. */
  zone: TradingZoneId
  /** How long one candle lasts, so a setting in minutes can be checked. */
  interval: CandleInterval
}

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
  compute(
    candles: IndicatorCandle[],
    params: IndicatorParams,
    context: IndicatorContext
  ): IndicatorPaint
  /**
   * The buy and sell moments this indicator calls, if it calls any.
   *
   * **Unset is a real answer**, and the honest one for an indicator that only
   * marks where something is. A step that trades signals lists only the
   * indicators that have this, so an indicator without one is never offered as
   * a switch that would do nothing.
   *
   * Whoever writes one owes the reader exactly one promise: **a signal and an
   * arrow are the same event.** Not "agree" — the same event, out of the same
   * pass, so they cannot come apart. Two functions that merely agree today have
   * already gone wrong once here; see the note in `base.ts` about the ladder
   * following 1,622 bases while the chart drew 1,387.
   */
  signals?(
    candles: IndicatorCandle[],
    params: IndicatorParams
  ): IndicatorSignal[]
  /**
   * How many candles of history it needs before its answers can be trusted.
   *
   * **What this prevents is a run that reports a flat line and looks like a
   * strategy that lost nothing.** An indicator handed only the stretch being
   * tested cannot say anything about its first candles — a base searching 36
   * back has nothing to search until candle 36 — so a replay that started at
   * the window's edge silently tested less than it claimed, and with a long
   * search over a short window tested nothing at all while still printing a
   * result.
   *
   * Read by whatever loads candles, so it can fetch this much extra from
   * before the window and then ignore anything the indicator says about it.
   */
  warmupBars?(params: IndicatorParams): number
  /**
   * One line about the settings as they stand, when there is something worth
   * saying — a setting quietly capping another one, most often. Null the rest
   * of the time, which is nearly always.
   *
   * It lives here rather than in the menu so the menu stays a menu: it knows
   * how to draw a field and a sentence, and nothing about what any of them
   * mean.
   */
  note?(params: IndicatorParams, context: IndicatorContext): string | null
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
 * Numbers are whole and inside their range, because every number setting here
 * is a count of something — candles, minutes. A fraction of a candle is not a
 * thing. A clock time is checked as one and normalised to "09:30"; a pick-one
 * setting has to name an option that still exists, so an option dropped in a
 * later build reads back as the fallback rather than drawing as nothing.
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
    if (field.kind === "time") {
      const minutes =
        typeof stored === "string" ? minutesOfClockTime(stored) : null
      params[field.key] =
        minutes === null ? field.fallback : clockTimeOfMinutes(minutes)
      continue
    }
    if (field.kind === "choice") {
      params[field.key] = field.options.some((one) => one.value === stored)
        ? (stored as string)
        : field.fallback
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
