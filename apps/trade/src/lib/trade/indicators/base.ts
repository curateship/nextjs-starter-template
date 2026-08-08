import {
  readIndicatorParams,
  type IndicatorCandle,
  type IndicatorDash,
  type IndicatorField,
  type IndicatorMark,
  type IndicatorModule,
  type IndicatorParams,
  type IndicatorSide,
} from "@/lib/trade/indicators/contract"

/**
 * Base: where price keeps stopping.
 *
 * A **base** is a floor — the lowest low of the last so many candles, once it
 * has stood for a while without being broken. A **ceiling** is the same thing
 * upside down: a high price has been turned away from. Both are found in one
 * pass, because they are the same rule mirrored, and each gets its own switch.
 *
 * What it draws:
 *  - a short dash at each level, on the candles that made it
 *  - an arrow on the candle that finished the wait — up and teal under a base,
 *    down and red over a ceiling
 *
 * Finding levels is all it does. Whether a broken base means anything is a
 * trading rule and belongs to whatever is trading; this only reports that a
 * level is now there. That is why the old app's crack settings are not here.
 *
 * Ported from `apps/trading`'s Base indicator, same six settings and the same
 * arithmetic. Two notes carried over from what went wrong there:
 *  - The with-the-trend rule compares LEVELS, never the candles the arrows sit
 *    on. A confirming candle can close higher while its level is lower, which
 *    drew arrows walking down a staircase.
 *  - It compares against the level immediately before, marked or not. Comparing
 *    against the highest level ever marked left 1 arrow out of 11 on a real
 *    chart; comparing against the last one marked let every small bounce in a
 *    fall qualify.
 */

export const BASE_FIELDS: IndicatorField[] = [
  {
    key: "searchBars",
    label: "Candles to search back",
    kind: "number",
    min: 4,
    max: 500,
    fallback: 36,
    hint: "How far back to look for the lowest low that makes a base. Bigger means fewer bases, and the ones it finds matter more.",
  },
  {
    key: "holdBars",
    label: "Candles it must hold",
    kind: "number",
    min: 1,
    max: 499,
    fallback: 8,
    hint: "How long that new low has to stand without being broken before it counts. The arrow prints on the candle that finishes the wait, which is usually well away from the level itself.",
  },
  {
    key: "withTrendOnly",
    label: "Only levels with the trend",
    kind: "switch",
    fallback: true,
    hint: "On: a base only gets an arrow when it sits above the base before it, and a ceiling only when it sits below the ceiling before it. Off: every level gets one. This is usually why a level has a dash but no arrow.",
  },
  {
    key: "showBases",
    label: "Show bases",
    kind: "switch",
    fallback: true,
    hint: "The floors price keeps bouncing off — a teal dash, and a green arrow under the candle that confirmed it.",
  },
  {
    key: "showCeilings",
    label: "Show ceilings",
    kind: "switch",
    fallback: true,
    hint: "The prices it keeps getting turned away from — a red dash, and a red arrow over the candle that confirmed it. A ceiling is where a base is usually the place to take profit.",
  },
  {
    key: "minBarsApart",
    label: "Fewest candles between arrows",
    kind: "number",
    min: 1,
    max: 1000,
    fallback: 20,
    hint: "Two arrows on the same side can never land closer together than this, so they stop bunching up. Bases and ceilings each count separately, and the dashes are never hidden by it.",
  },
]

/** This indicator's settings, once read through the list above. */
type BaseSettings = {
  searchBars: number
  holdBars: number
  minBarsApart: number
  withTrendOnly: boolean
  showBases: boolean
  showCeilings: boolean
}

function baseSettings(params: IndicatorParams): BaseSettings {
  const read = readIndicatorParams(BASE_FIELDS, params)
  // Safe by construction: the reader answers a number for every number field
  // in that list and a true or false for every switch, whatever it was handed.
  return {
    searchBars: read.searchBars as number,
    holdBars: read.holdBars as number,
    minBarsApart: read.minBarsApart as number,
    withTrendOnly: read.withTrendOnly as boolean,
    showBases: read.showBases as boolean,
    showCeilings: read.showCeilings as boolean,
  }
}

/**
 * The wait, capped so it can never be as long as the search itself.
 *
 * Waiting 40 candles for a low found in the last 36 is not a rule, it is a
 * question with no answer — there is nothing left that could have made the low.
 * The settings panel says so out loud when the cap is doing something.
 */
export function cappedHold(searchBars: number, holdBars: number): number {
  return holdBars >= searchBars ? searchBars - 1 : holdBars
}

/** What one pass over the candles found, one entry per candle. */
type Levels = {
  /** The level in force at this candle, or NaN before the first one. */
  level: number[]
  /** The dash to draw at this candle, or NaN where there is none. */
  dash: number[]
  /** Whether this candle is the one that finished a level's wait. */
  confirmed: boolean[]
}

/**
 * Every base (or every ceiling) in one pass.
 *
 * A level is confirmed at candle `i` when the extreme of the trailing window
 * moved `hold` candles ago and has not moved since — that is, price set a new
 * low (or high) back then and nothing has beaten it in the candles since.
 */
function levelsOf(
  candles: IndicatorCandle[],
  searchBars: number,
  holdBars: number,
  side: IndicatorSide
): Levels {
  const count = candles.length
  const level = new Array<number>(count).fill(Number.NaN)
  const dash = new Array<number>(count).fill(Number.NaN)
  const confirmed = new Array<boolean>(count).fill(false)
  if (count === 0 || searchBars < 4) return { level, dash, confirmed }

  const hold = cappedHold(searchBars, holdBars)
  const floor = side === "up"
  const prices = candles.map((bar) => (floor ? bar.low : bar.high))

  // The lowest low — or highest high — of the trailing window, per candle.
  // NaN until there are enough candles behind it to fill one.
  const extreme = new Array<number>(count).fill(Number.NaN)
  for (let i = searchBars - 1; i < count; i += 1) {
    let best = prices[i]
    for (let j = i - searchBars + 1; j < i; j += 1) {
      best = floor ? Math.min(best, prices[j]) : Math.max(best, prices[j])
    }
    extreme[i] = best
  }

  // The dash spans a few candles either side of the one that made the level,
  // so it reads as a mark on that spot rather than a line across the chart.
  const halfSpan = Math.max(2, Math.round(hold))
  let current = Number.NaN
  for (let i = 0; i < count; i += 1) {
    if (i - hold - 1 >= 0) {
      const before = extreme[i - hold - 1]
      const set = extreme[i - hold]
      const now = extreme[i]
      const fresh =
        !Number.isNaN(before) &&
        !Number.isNaN(set) &&
        !Number.isNaN(now) &&
        (floor ? before > set : before < set) &&
        set === now
      if (fresh) {
        current = now
        confirmed[i] = true
        const at = i - hold
        const from = Math.max(0, at - halfSpan)
        const to = Math.min(count - 1, at + halfSpan)
        for (let k = from; k <= to; k += 1) dash[k] = now
      }
    }
    level[i] = current
  }

  return { level, dash, confirmed }
}

/** Each run of candles carrying the same dash value, as one mark to draw. */
function dashesOf(
  dash: number[],
  candles: IndicatorCandle[],
  side: IndicatorSide
): IndicatorDash[] {
  const marks: IndicatorDash[] = []
  let i = 0
  while (i < dash.length) {
    if (Number.isNaN(dash[i])) {
      i += 1
      continue
    }
    let last = i
    while (last + 1 < dash.length && dash[last + 1] === dash[i]) last += 1
    marks.push({
      fromTime: candles[i].openTime,
      toTime: candles[last].openTime,
      price: dash[i],
      side,
    })
    i = last + 1
  }
  return marks
}

/**
 * The arrows: one per level worth pointing at, on the candle that confirmed it
 * and at that candle's close.
 *
 * Two rules thin them out, and neither touches the dashes — a level always gets
 * its dash, so "there is a level here but no arrow" is answerable by looking at
 * the two settings that did it.
 */
function marksOf(
  found: Levels,
  candles: IndicatorCandle[],
  settings: BaseSettings,
  side: IndicatorSide
): IndicatorMark[] {
  const marks: IndicatorMark[] = []
  const floor = side === "up"
  let previous = Number.NaN
  let markedAt = -Infinity
  for (let i = 0; i < candles.length; i += 1) {
    if (!found.confirmed[i]) continue
    const level = found.level[i]
    // A base wants to be higher than the last one; a ceiling wants to be
    // lower. Compared against the level before it whether that one was marked
    // or not, which is what makes it the textbook higher low.
    const withTrend =
      !Number.isFinite(previous) || (floor ? level > previous : level < previous)
    previous = level
    if (settings.withTrendOnly && !withTrend) continue
    if (i - markedAt < settings.minBarsApart) continue
    marks.push({ time: candles[i].openTime, price: candles[i].close, side })
    markedAt = i
  }
  return marks
}

export const baseIndicator: IndicatorModule = {
  kind: "base",
  label: "Base",
  description:
    "Marks the floors price keeps bouncing off and the ceilings it keeps getting turned away from.",
  fields: BASE_FIELDS,
  // Two cards, split by what the setting actually changes. The first two decide
  // where the levels ARE; the other four only decide which of them you are
  // shown, and none of them can move a level or invent one. That is the line
  // somebody needs when a level has a dash but no arrow — the answer is always
  // on the second card.
  groups: [
    { title: "Settings", keys: ["searchBars", "holdBars"] },
    {
      title: "Visibility",
      keys: ["showBases", "showCeilings", "withTrendOnly", "minBarsApart"],
    },
  ],
  // The one way these six settings can quietly disagree with each other. Said
  // out loud rather than refused, because the number it acts as is a perfectly
  // good answer — it is only being silent about it that would be wrong.
  note: (params) => {
    const settings = baseSettings(params)
    const held = cappedHold(settings.searchBars, settings.holdBars)
    return held === settings.holdBars
      ? null
      : `The wait has to be shorter than the search, so it is acting as ${held} candles.`
  },
  compute: (candles, params) => {
    const settings = baseSettings(params)
    const dashes: IndicatorDash[] = []
    const marks: IndicatorMark[] = []
    // Each side is a whole pass of its own, so its arrows keep their own
    // spacing clock and a run of bases can never crowd out a ceiling.
    for (const side of ["up", "down"] as const) {
      const shown = side === "up" ? settings.showBases : settings.showCeilings
      if (!shown) continue
      const found = levelsOf(
        candles,
        settings.searchBars,
        settings.holdBars,
        side
      )
      dashes.push(...dashesOf(found.dash, candles, side))
      marks.push(...marksOf(found, candles, settings, side))
    }
    // Both sides' arrows, back in the order they happened.
    marks.sort((a, b) => a.time - b.time)
    return { dashes, marks }
  },
}
