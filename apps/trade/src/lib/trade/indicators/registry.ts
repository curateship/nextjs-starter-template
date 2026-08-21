import { z } from "zod"

import { baseIndicator } from "@/lib/trade/indicators/base"
import { orbIndicator } from "@/lib/trade/indicators/orb"
import {
  defaultIndicatorParams,
  readIndicatorParams,
  type IndicatorCandle,
  type IndicatorContext,
  type IndicatorModule,
  type IndicatorPaint,
  type IndicatorParams,
  type IndicatorSignal,
} from "@/lib/trade/indicators/contract"

/**
 * Every indicator the app has, and what somebody has each of them set to.
 *
 * The list below is the whole library. Adding an indicator is one module file
 * and one line here: the menu builds itself from this, the settings are read
 * through it, and the chart paints whatever it hands back. There is
 * deliberately no dashboard and no per-indicator screen — an indicator is a
 * chart control, so it lives in the chart's own controls.
 */

/** The whole library, in the order the menu lists them. */
export const INDICATOR_LIST: readonly IndicatorModule[] = [
  baseIndicator,
  orbIndicator,
]

/**
 * The ones that call trades, in the same order.
 *
 * **A shorter list than the library, and it has to be able to be.** An
 * indicator that only marks where something is has nothing to say about buying
 * it, and offering it on a step that trades signals would be a switch that
 * quietly does nothing — the worst kind, because it looks armed.
 *
 * Worked out from the modules themselves rather than written down a second
 * time, so an indicator that gains a `signals` function appears here without
 * anybody remembering to add it.
 */
export const SIGNAL_INDICATORS: readonly IndicatorModule[] =
  INDICATOR_LIST.filter((module) => module.signals !== undefined)

/**
 * The most indicators, or settings on one, a save may name.
 *
 * Generosity rather than a limit anybody meets — no indicator in the library
 * has more than nine settings. It is here because this is the only door into
 * the row, and an unbounded one would let a made-up request hand the server a
 * hundred thousand entries to read before it throws them all away.
 */
const MAX_ENTRIES = 100

/**
 * Everything one indicator remembers: whether it is switched on, what it is set
 * to, and how its part of the menu was left folded.
 *
 * The folds are kept here beside the settings rather than in the browser's own
 * storage, for the same reason everything else in this app is: it runs inside an
 * embedded preview where those writes are quietly dropped, so a fold remembered
 * there would be a fold that never sticks. They ride in the same blob as the
 * settings, so remembering them cost no second column and no second migration.
 */
export type IndicatorState = {
  on: boolean
  params: IndicatorParams
  /** Its settings unfolded in the menu. Shut to begin with. */
  open: boolean
  /** Which of its settings cards are folded away. Open to begin with. */
  shutCards: string[]
}

/** One entry per indicator this build knows about. Always all of them. */
export type IndicatorSettings = Record<string, IndicatorState>

/** Everything off, everything at its own defaults. */
export function defaultIndicatorSettings(): IndicatorSettings {
  return readIndicatorSettings(null)
}

/**
 * Stored settings as settings this build can use — the one gate, both ways.
 *
 * Anything it does not recognise is dropped rather than carried: an indicator
 * removed from the library leaves rows mentioning it, and those rows must not
 * come back as anything. Anything missing is filled from the defaults, so a
 * person who has never opened the menu and a person on an older row get the
 * same, working answer.
 */
export function readIndicatorSettings(value: unknown): IndicatorSettings {
  const held =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const settings: IndicatorSettings = {}
  for (const module of INDICATOR_LIST) {
    const stored = held[module.kind]
    const row =
      typeof stored === "object" && stored !== null
        ? (stored as Record<string, unknown>)
        : {}
    settings[module.kind] = {
      on: row.on === true,
      params: readIndicatorParams(module.fields, row.params),
      open: row.open === true,
      // Checked against the cards that actually exist, so a renamed card
      // forgets its fold cleanly instead of the list filling up with titles
      // nothing answers to any more.
      shutCards: Array.isArray(row.shutCards)
        ? row.shutCards.filter(
            (title): title is string =>
              typeof title === "string" &&
              module.groups.some((group) => group.title === title)
          )
        : [],
    }
  }
  return settings
}

/**
 * The shape a save may arrive in.
 *
 * Its whole job is bounding what arrives — small keys, simple values, a short
 * list of card titles. Deciding what any of it MEANS is `readIndicatorSettings`
 * below, which every save is then put through, so what reaches the row can only
 * ever be what the library offers. That split is why every field here is
 * optional: the reader fills in anything missing, so there is nothing for this
 * to be strict about.
 */
export const indicatorSettingsSchema: z.ZodType<IndicatorSettings> = z
  .record(
    z.string().max(40),
    z.object({
      on: z.boolean().optional(),
      params: z
        .record(
          z.string().max(40),
          // A string is a clock time or the value of a pick-one option, and
          // both are short. What it MEANS is decided by the field list a line
          // later; this only stops a made-up request posting an essay.
          z.union([z.number().finite(), z.boolean(), z.string().max(40)])
        )
        .refine((params) => Object.keys(params).length <= MAX_ENTRIES)
        .optional(),
      open: z.boolean().optional(),
      shutCards: z.array(z.string().max(60)).max(20).optional(),
    })
  )
  // A count, because a record has no length to bound. Everything past the
  // library's own list is thrown away a line later anyway — this is only so a
  // made-up request cannot make the server read a hundred thousand of them
  // first.
  .refine((rows) => Object.keys(rows).length <= MAX_ENTRIES)
  .transform(readIndicatorSettings)

/** What every switched-on indicator wants drawn over these candles. */
export function indicatorPaint(
  settings: IndicatorSettings,
  candles: IndicatorCandle[],
  context: IndicatorContext
): IndicatorPaint {
  const paint: IndicatorPaint = { dashes: [], marks: [], boxes: [] }
  if (candles.length === 0) return paint
  for (const module of INDICATOR_LIST) {
    if (!settings[module.kind]?.on) continue
    const drawn = module.compute(candles, settings[module.kind].params, context)
    paint.dashes.push(...drawn.dashes)
    paint.marks.push(...drawn.marks)
    paint.boxes.push(...drawn.boxes)
  }
  return paint
}

/**
 * Every buy and sell moment the switched-on indicators call over these candles,
 * in the order they happened.
 *
 * The signal twin of `indicatorPaint`, and read the same way: hand it whatever
 * is stored and it answers for the indicators that are on and no others.
 *
 * **Two indicators calling the same moment come back as two signals**, not one.
 * Merging them here would be this function inventing a rule — "both agreeing
 * counts once" — that nothing asked it for. Whatever is trading decides what to
 * do with a crowded moment; this only reports it.
 */
export function indicatorSignals(
  settings: IndicatorSettings,
  candles: IndicatorCandle[]
): IndicatorSignal[] {
  const signals: IndicatorSignal[] = []
  if (candles.length === 0) return signals
  for (const module of SIGNAL_INDICATORS) {
    if (!settings[module.kind]?.on) continue
    signals.push(...(module.signals?.(candles, settings[module.kind].params) ?? []))
  }
  return signals.sort((a, b) => a.time - b.time)
}

/**
 * The most history any switched-on indicator needs before it can speak.
 *
 * The largest rather than the sum: they all read the same candles, so the one
 * that looks furthest back decides how far back the candles have to go.
 *
 * Zero when nothing is on, or when the ones that are ask for nothing.
 */
export function indicatorWarmupBars(settings: IndicatorSettings): number {
  let most = 0
  for (const module of SIGNAL_INDICATORS) {
    if (!settings[module.kind]?.on) continue
    most = Math.max(most, module.warmupBars?.(settings[module.kind].params) ?? 0)
  }
  return most
}

/**
 * How many switched-on indicators can actually call a trade.
 *
 * Separate from `indicatorsOn` because they answer different questions: that
 * one is "how many am I looking at", this one is "how many are trading". A step
 * with the count at zero is a step that will never buy anything, and it has to
 * be able to say so.
 */
export function signalIndicatorsOn(settings: IndicatorSettings): number {
  return SIGNAL_INDICATORS.filter((module) => settings[module.kind]?.on).length
}

/** How many are switched on — the count beside the menu's name. */
export function indicatorsOn(settings: IndicatorSettings): number {
  return INDICATOR_LIST.filter((module) => settings[module.kind]?.on).length
}

/** An indicator's settings back at their defaults. */
export function defaultParamsOf(kind: string): IndicatorParams {
  const module = INDICATOR_LIST.find((one) => one.kind === kind)
  return module ? defaultIndicatorParams(module.fields) : {}
}
