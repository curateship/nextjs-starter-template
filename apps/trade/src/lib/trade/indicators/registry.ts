import { z } from "zod"

import { baseIndicator } from "@/lib/trade/indicators/base"
import {
  defaultIndicatorParams,
  readIndicatorParams,
  type IndicatorCandle,
  type IndicatorModule,
  type IndicatorPaint,
  type IndicatorParams,
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
export const INDICATOR_LIST: readonly IndicatorModule[] = [baseIndicator]

/**
 * The most indicators, or settings on one, a save may name.
 *
 * Generosity rather than a limit anybody meets — the library has one indicator
 * with six settings. It is here because this is the only door into the row, and
 * an unbounded one would let a made-up request hand the server a hundred
 * thousand entries to read before it throws them all away.
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
          z.union([z.number().finite(), z.boolean()])
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
  candles: IndicatorCandle[]
): IndicatorPaint {
  const paint: IndicatorPaint = { dashes: [], marks: [] }
  if (candles.length === 0) return paint
  for (const module of INDICATOR_LIST) {
    if (!settings[module.kind]?.on) continue
    const drawn = module.compute(candles, settings[module.kind].params)
    paint.dashes.push(...drawn.dashes)
    paint.marks.push(...drawn.marks)
  }
  return paint
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
