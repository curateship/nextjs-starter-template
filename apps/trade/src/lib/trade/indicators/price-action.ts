import { intervalMs } from "@/lib/trade/chart-history"
import {
  readIndicatorParams,
  type IndicatorBox,
  type IndicatorCandle,
  type IndicatorField,
  type IndicatorMark,
  type IndicatorModule,
  type IndicatorParams,
  type IndicatorSide,
  type IndicatorSignal,
} from "@/lib/trade/indicators/contract"

/**
 * Price action: the shape of the candles themselves.
 *
 * Eighteen candle patterns, nine that read as a buy and their nine upside-down
 * twins that read as a sell, each with its own switch. A pattern is a rule
 * about the open, high, low and close of one to three candles, so nothing here
 * needs any data a candle does not already carry.
 *
 * What it draws:
 *  - a teal arrow under the last candle of a buy pattern, at the lowest low
 *    of the candles it covers, and a red arrow over a sell pattern at the
 *    highest high
 *  - a box over the candles of a pattern longer than one candle, because a
 *    three candle morning star is hard to spot from one arrow
 *
 * **The words are numbers.** "Small", "long", "almost nothing" and "the same"
 * each mean one setting under "What counts", and every pattern reads the same
 * one. A hammer's "almost no upper wick" and a marubozu's "almost no wicks" are
 * both the No wick setting.
 *
 * **Touching counts as a gap.** A coin trades all day, so each candle opens at
 * the price the last one closed. The book rules want a gap between candles for
 * engulfing, piercing and the stars, and read strictly they would almost never
 * print on a coin. Here an open AT the last close counts as below it (or above
 * it for the sell twins), which Tyler chose on 23 Sep 2026. A stock that really
 * gaps still passes.
 *
 * **Engulfing closes past the wick.** The book rule only asks the second body
 * to cover the first body, and on 23 Sep 2026 that printed a sell where a red
 * body barely bigger than a tiny green one "covered" it while the green wick
 * hung far below. Tyler picked the far-wick half of the book's ideal version:
 * the second candle also closes past the first candle's far wick, below its
 * low for a sell and above its high for a buy. The near wick is left alone, because a
 * coin's second candle opens at the first one's close and could almost never
 * cover it. On 50 days of BTC 15 minute candles this kept 70 of 109.
 */

type Shape = {
  open: number
  high: number
  low: number
  close: number
  body: number
  height: number
  /** The higher end of the body. */
  top: number
  /** The lower end of the body. */
  bottom: number
  upper: number
  lower: number
  up: boolean
  down: boolean
}

type Rules = {
  /** Share of the candle's height, 0 to 1. */
  small: number
  /** Times the body. */
  longWick: number
  /** Share of the candle's height, 0 to 1. */
  noWick: number
  /** Share of the price, 0 to 1. */
  equal: number
}

type Pattern = {
  key: string
  label: string
  hint: string
  side: IndicatorSide
  /** Oldest first, and exactly `size` of them. */
  matches: (shapes: Shape[], rules: Rules) => boolean
  size: 1 | 2 | 3
  /** Needs a move the other way before it. */
  reversal: boolean
  /** Switched on before anybody changes anything. */
  on: boolean
}

function isSmall(shape: Shape, rules: Rules) {
  return shape.height > 0 && shape.body <= rules.small * shape.height
}

function isLarge(shape: Shape, rules: Rules) {
  return shape.height > 0 && shape.body > rules.small * shape.height
}

function isBare(wick: number, shape: Shape, rules: Rules) {
  return wick <= rules.noWick * shape.height
}

function isLong(wick: number, shape: Shape, rules: Rules) {
  return wick >= rules.longWick * shape.body
}

function middleOf(shape: Shape) {
  return (shape.open + shape.close) / 2
}

function isSame(first: number, second: number, rules: Rules) {
  return Math.abs(first - second) <= rules.equal * Math.abs(first)
}

/** A small body at the top, a long wick under it, almost nothing over it. */
function hammerShape([one]: Shape[], rules: Rules) {
  return (
    isSmall(one, rules) &&
    isLong(one.lower, one, rules) &&
    isBare(one.upper, one, rules)
  )
}

/** A small body at the bottom, a long wick over it, almost nothing under it. */
function starShape([one]: Shape[], rules: Rules) {
  return (
    isSmall(one, rules) &&
    isLong(one.upper, one, rules) &&
    isBare(one.lower, one, rules)
  )
}

function isInside(inner: Shape, outer: Shape) {
  return inner.bottom >= outer.bottom && inner.top <= outer.top
}

/**
 * All eighteen, buy patterns first and in the order of the picture they came
 * from, then the sell twins in the same order.
 *
 * The hammer and the hanging man are the same shape, and so are the inverted
 * hammer and the shooting star. Which one a candle is depends only on whether
 * price was falling or rising into it, which is the Trend before setting.
 */
const PATTERNS: Pattern[] = [
  {
    key: "bullishEngulfing",
    label: "Bullish engulfing",
    hint: "A down candle, then an up candle whose body covers all of the down candle's body and closes above its highest wick.",
    side: "up",
    size: 2,
    reversal: true,
    on: true,
    matches: ([first, second]) =>
      first.down &&
      second.up &&
      second.open <= first.close &&
      // Past the top of the first candle's wick, not only its body. See
      // "Engulfing closes past the wick" above.
      second.close >= first.high &&
      second.body > first.body,
  },
  {
    key: "hammer",
    label: "Hammer",
    hint: "A small body at the top of the candle, a long wick below it and almost no wick above it.",
    side: "up",
    size: 1,
    reversal: true,
    on: false,
    matches: hammerShape,
  },
  {
    key: "morningStar",
    label: "Morning star",
    hint: "A down candle, then a small candle that sits at or below its close, then an up candle closing above the middle of the first one.",
    side: "up",
    size: 3,
    reversal: true,
    on: false,
    matches: ([first, star, last], rules) =>
      first.down &&
      isSmall(star, rules) &&
      star.top <= first.close &&
      last.up &&
      last.close > middleOf(first),
  },
  {
    key: "piercing",
    label: "Piercing pattern",
    hint: "A down candle, then an up candle that opens at or below its close and closes above its middle, but not above its open.",
    side: "up",
    size: 2,
    reversal: true,
    on: false,
    matches: ([first, second]) =>
      first.down &&
      second.up &&
      second.open <= first.close &&
      second.close > middleOf(first) &&
      second.close < first.open,
  },
  {
    key: "bullishMarubozu",
    label: "Marubozu",
    hint: "An up candle with almost no wicks, so it opened near its low and closed near its high. No fall is needed before it.",
    side: "up",
    size: 1,
    reversal: false,
    on: false,
    matches: ([one], rules) =>
      one.up && isBare(one.upper, one, rules) && isBare(one.lower, one, rules),
  },
  {
    key: "threeWhiteSoldiers",
    label: "Three white soldiers",
    hint: "Three up candles in a row, each closing higher than the last, none of them small. No fall is needed before it.",
    side: "up",
    size: 3,
    reversal: false,
    on: false,
    matches: (shapes, rules) =>
      shapes.every((one) => one.up && isLarge(one, rules)) &&
      shapes[1].close > shapes[0].close &&
      shapes[2].close > shapes[1].close,
  },
  {
    key: "bullishHarami",
    label: "Bullish harami",
    hint: "A large down candle, then a small up candle whose body sits inside the first candle's body.",
    side: "up",
    size: 2,
    reversal: true,
    on: false,
    matches: ([first, second], rules) =>
      first.down &&
      isLarge(first, rules) &&
      second.up &&
      isSmall(second, rules) &&
      isInside(second, first),
  },
  {
    key: "invertedHammer",
    label: "Inverted hammer",
    hint: "A small body at the bottom of the candle, a long wick above it and almost no wick below it.",
    side: "up",
    size: 1,
    reversal: true,
    on: false,
    matches: starShape,
  },
  {
    key: "tweezerBottom",
    label: "Tweezer bottom",
    hint: "A down candle, then an up candle, both reaching the same low.",
    side: "up",
    size: 2,
    reversal: true,
    on: false,
    matches: ([first, second], rules) =>
      first.down && second.up && isSame(first.low, second.low, rules),
  },
  {
    key: "bearishEngulfing",
    label: "Bearish engulfing",
    hint: "An up candle, then a down candle whose body covers all of the up candle's body and closes below its lowest wick.",
    side: "down",
    size: 2,
    reversal: true,
    on: true,
    matches: ([first, second]) =>
      first.up &&
      second.down &&
      second.open >= first.close &&
      second.close <= first.low &&
      second.body > first.body,
  },
  {
    key: "shootingStar",
    label: "Shooting star",
    hint: "A small body at the bottom of the candle, a long wick above it and almost no wick below it.",
    side: "down",
    size: 1,
    reversal: true,
    on: false,
    matches: starShape,
  },
  {
    key: "eveningStar",
    label: "Evening star",
    hint: "An up candle, then a small candle that sits at or above its close, then a down candle closing below the middle of the first one.",
    side: "down",
    size: 3,
    reversal: true,
    on: false,
    matches: ([first, star, last], rules) =>
      first.up &&
      isSmall(star, rules) &&
      star.bottom >= first.close &&
      last.down &&
      last.close < middleOf(first),
  },
  {
    key: "darkCloudCover",
    label: "Dark cloud cover",
    hint: "An up candle, then a down candle that opens at or above its close and closes below its middle, but not below its open.",
    side: "down",
    size: 2,
    reversal: true,
    on: false,
    matches: ([first, second]) =>
      first.up &&
      second.down &&
      second.open >= first.close &&
      second.close < middleOf(first) &&
      second.close > first.open,
  },
  {
    key: "bearishMarubozu",
    label: "Bearish marubozu",
    hint: "A down candle with almost no wicks, so it opened near its high and closed near its low. No rise is needed before it.",
    side: "down",
    size: 1,
    reversal: false,
    on: false,
    matches: ([one], rules) =>
      one.down &&
      isBare(one.upper, one, rules) &&
      isBare(one.lower, one, rules),
  },
  {
    key: "threeBlackCrows",
    label: "Three black crows",
    hint: "Three down candles in a row, each closing lower than the last, none of them small. No rise is needed before it.",
    side: "down",
    size: 3,
    reversal: false,
    on: false,
    matches: (shapes, rules) =>
      shapes.every((one) => one.down && isLarge(one, rules)) &&
      shapes[1].close < shapes[0].close &&
      shapes[2].close < shapes[1].close,
  },
  {
    key: "bearishHarami",
    label: "Bearish harami",
    hint: "A large up candle, then a small down candle whose body sits inside the first candle's body.",
    side: "down",
    size: 2,
    reversal: true,
    on: false,
    matches: ([first, second], rules) =>
      first.up &&
      isLarge(first, rules) &&
      second.down &&
      isSmall(second, rules) &&
      isInside(second, first),
  },
  {
    key: "hangingMan",
    label: "Hanging man",
    hint: "A small body at the top of the candle, a long wick below it and almost no wick above it.",
    side: "down",
    size: 1,
    reversal: true,
    on: false,
    matches: hammerShape,
  },
  {
    key: "tweezerTop",
    label: "Tweezer top",
    hint: "An up candle, then a down candle, both reaching the same high.",
    side: "down",
    size: 2,
    reversal: true,
    on: false,
    matches: ([first, second], rules) =>
      first.up && second.down && isSame(first.high, second.high, rules),
  },
]

const PRICE_ACTION_FIELDS: IndicatorField[] = [
  ...PATTERNS.map((pattern): IndicatorField => ({
    key: pattern.key,
    label: pattern.label,
    hint: pattern.hint,
    kind: "switch",
    fallback: pattern.on,
  })),
  {
    key: "smallBodyPct",
    label: "Small body",
    hint: "A body is small when it is this many out of 100 of the candle's full height or less. Anything bigger is large.",
    kind: "number",
    min: 1,
    max: 99,
    fallback: 30,
  },
  {
    key: "longWickTimes",
    label: "Long wick",
    hint: "A wick is long when it is at least this many times the height of the body.",
    kind: "number",
    min: 1,
    max: 20,
    fallback: 2,
  },
  {
    key: "noWickPct",
    label: "No wick",
    hint: "A wick is almost nothing when it is this many out of 100 of the candle's full height or less.",
    kind: "number",
    min: 0,
    max: 50,
    fallback: 5,
  },
  {
    key: "equalTenths",
    label: "Equal to",
    hint: "Two lows or two highs are the same when they are this many tenths of a percent apart or less. 1 is a tenth of a percent.",
    kind: "number",
    min: 0,
    max: 100,
    fallback: 1,
  },
  {
    key: "trendBars",
    label: "Trend before",
    hint: "How many candles in a row must close lower before a buy pattern, or higher before a sell pattern. 0 switches the check off.",
    kind: "number",
    min: 0,
    max: 50,
    fallback: 3,
  },
  {
    key: "showArrows",
    label: "Show arrows",
    hint: "Hide or show the arrows and boxes on the chart. Automation still receives every signal.",
    kind: "switch",
    fallback: true,
  },
]

function priceActionSettings(params: IndicatorParams) {
  const read = readIndicatorParams(PRICE_ACTION_FIELDS, params)
  return {
    patterns: PATTERNS.filter((pattern) => read[pattern.key] === true),
    rules: {
      small: (read.smallBodyPct as number) / 100,
      longWick: read.longWickTimes as number,
      noWick: (read.noWickPct as number) / 100,
      equal: (read.equalTenths as number) / 1000,
    } satisfies Rules,
    trendBars: read.trendBars as number,
    showArrows: read.showArrows === true,
  }
}

/**
 * A candle as the numbers a pattern reads, or null when it cannot be read.
 *
 * A candle without an open, or whose open or close sits outside its own high
 * and low, is a broken row rather than a shape. No pattern that covers it
 * prints, rather than one printing off a wick that is not there.
 */
function shapeOf(candle: IndicatorCandle): Shape | null {
  const { open, high, low, close } = candle
  if (open === undefined || !Number.isFinite(open)) return null
  if (!(low <= Math.min(open, close) && high >= Math.max(open, close))) {
    return null
  }
  const top = Math.max(open, close)
  const bottom = Math.min(open, close)
  return {
    open,
    high,
    low,
    close,
    body: top - bottom,
    height: high - low,
    top,
    bottom,
    upper: high - top,
    lower: bottom - low,
    up: close > open,
    down: close < open,
  }
}

/**
 * How many closes in a row have fallen, and risen, up to each candle.
 *
 * `falling[k]` is 3 when candles k, k-1 and k-2 each closed below the candle
 * before them. Worked out once, so each pattern's trend check is one lookup.
 */
function trendRuns(candles: IndicatorCandle[]) {
  const falling = new Array<number>(candles.length).fill(0)
  const rising = new Array<number>(candles.length).fill(0)
  for (let k = 1; k < candles.length; k += 1) {
    if (candles[k].close < candles[k - 1].close) falling[k] = falling[k - 1] + 1
    if (candles[k].close > candles[k - 1].close) rising[k] = rising[k - 1] + 1
  }
  return { falling, rising }
}

/**
 * One pattern finishing on one candle: the arrow, the signal and the box,
 * carried together.
 *
 * The same event feeds both `compute` and `signals`, so an arrow and a trade
 * cannot name different candles. See the note on `signals` in `contract.ts`.
 */
type PriceActionEvent = {
  mark: IndicatorMark
  signal: IndicatorSignal
  /** Where a pattern longer than one candle starts. Null for one candle. */
  box: { fromTime: number; high: number; low: number } | null
}

function eventsOf(
  candles: IndicatorCandle[],
  params: IndicatorParams
): PriceActionEvent[] {
  const settings = priceActionSettings(params)
  if (settings.patterns.length === 0) return []
  const shapes = candles.map(shapeOf)
  const runs = trendRuns(candles)
  const events: PriceActionEvent[] = []

  for (let last = 0; last < candles.length; last += 1) {
    for (const pattern of settings.patterns) {
      const first = last - pattern.size + 1
      if (first < 0) continue
      // The trend first: it is one lookup, and it rules out most candles
      // before any of them are copied.
      if (pattern.reversal && settings.trendBars > 0) {
        // The move INTO the pattern, so it ends on the candle before the
        // pattern's first one. The pattern's own candles are not counted.
        const into = first - 1
        const run =
          into < 0
            ? 0
            : pattern.side === "up"
              ? runs.falling[into]
              : runs.rising[into]
        if (run < settings.trendBars) continue
      }

      const covered = shapes.slice(first, last + 1)
      if (covered.some((shape) => shape === null)) continue
      const readable = covered as Shape[]
      if (!pattern.matches(readable, settings.rules)) continue

      const high = Math.max(...readable.map((shape) => shape.high))
      const low = Math.min(...readable.map((shape) => shape.low))
      const time = candles[last].openTime
      events.push({
        mark: {
          time,
          price: pattern.side === "up" ? low : high,
          side: pattern.side,
        },
        signal: { time, side: pattern.side === "up" ? "buy" : "sell" },
        box:
          pattern.size > 1
            ? { fromTime: candles[first].openTime, high, low }
            : null,
      })
    }
  }
  return events
}

export const priceActionIndicator: IndicatorModule = {
  kind: "priceAction",
  label: "Price action",
  description:
    "Marks candle patterns: an up arrow under a buy pattern and a down arrow over a sell pattern, with a box over patterns longer than one candle.",
  fields: PRICE_ACTION_FIELDS,
  groups: [
    {
      title: "Buy patterns",
      keys: PATTERNS.filter((pattern) => pattern.side === "up").map(
        (pattern) => pattern.key
      ),
    },
    {
      title: "Sell patterns",
      keys: PATTERNS.filter((pattern) => pattern.side === "down").map(
        (pattern) => pattern.key
      ),
    },
    {
      title: "What counts",
      keys: [
        "smallBodyPct",
        "longWickTimes",
        "noWickPct",
        "equalTenths",
        "trendBars",
      ],
    },
    { title: "Signals", keys: ["showArrows"] },
  ],
  compute: (candles, params, context) => {
    const settings = priceActionSettings(params)
    const events = settings.showArrows ? eventsOf(candles, params) : []
    const barMs = intervalMs(context.interval)
    return {
      lines: [],
      dashes: [],
      marks: events.map((event) => event.mark),
      boxes: events.flatMap((event): IndicatorBox[] =>
        event.box
          ? [
              {
                fromTime: event.box.fromTime,
                toTime: event.mark.time + barMs,
                price: { high: event.box.high, low: event.box.low },
              },
            ]
          : []
      ),
    }
  },
  signals: (candles, params) =>
    eventsOf(candles, params).map((event) => event.signal),
  // The trend candles, the one close they are measured from, and the two
  // candles a three candle pattern has before its last.
  warmupBars: (params) => priceActionSettings(params).trendBars + 3,
}
