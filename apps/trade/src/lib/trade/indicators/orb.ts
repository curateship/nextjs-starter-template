import { intervalMs } from "@/lib/trade/chart-history"
import {
  clockTimeOfMinutes,
  minutesOfClockTime,
  tradingZoneLabel,
  zoneDayKeyOf,
  zoneTimeAt,
} from "@/lib/trade/chart-timezone"
import {
  readIndicatorParams,
  type IndicatorBox,
  type IndicatorCandle,
  type IndicatorChoice,
  type IndicatorContext,
  type IndicatorField,
  type IndicatorMark,
  type IndicatorModule,
  type IndicatorPaint,
  type IndicatorParams,
} from "@/lib/trade/indicators/contract"

/**
 * Opening range: the high and the low of the first stretch of a session, and
 * the candle that closed outside it.
 *
 * In plain words. At the start of a chosen session — 09:30 by default — price
 * spends the first fifteen minutes finding a high and a low. Those two prices
 * are the opening range, and the box is drawn over the candles that made it.
 * The first candle after the range to CLOSE above the high is a breakout and
 * gets a teal arrow under it; the first to close below the low is a breakdown
 * and gets a red arrow over it. One break per session: once the range has been
 * broken it is not broken again until the next session starts.
 *
 * **Every time here is read on the chart's own clock**, which is picked once
 * in the chart's View options and handed in as `context.zone`. That is what
 * makes "09:30" mean anything: New York's open is 13:30 UTC in summer and
 * 14:30 in winter, and a session stored against a fixed offset would be an
 * hour wrong for half the year.
 *
 * It draws and nothing else. Whether a break is worth buying is a trading rule
 * and belongs to whatever is trading, so there is no `signals` here yet.
 */

/** When each named session opens and shuts, on the chart's clock. */
const SESSIONS: Record<string, { start: string; end: string }> = {
  newYork: { start: "09:30", end: "16:00" },
  london: { start: "08:00", end: "16:30" },
  tokyo: { start: "09:00", end: "15:00" },
  sydney: { start: "10:00", end: "16:00" },
  // The whole day: a session that shuts when it opens runs the full 24 hours.
  dayStart: { start: "00:00", end: "00:00" },
}

const SESSION_OPTIONS: readonly IndicatorChoice[] = [
  { value: "newYork", label: "New York — 09:30 to 16:00" },
  { value: "london", label: "London — 08:00 to 16:30" },
  { value: "tokyo", label: "Tokyo — 09:00 to 15:00" },
  { value: "sydney", label: "Sydney — 10:00 to 16:00" },
  { value: "dayStart", label: "The whole day — 00:00 to 00:00" },
  { value: "custom", label: "Hours I choose" },
]

export const ORB_FIELDS: IndicatorField[] = [
  {
    key: "session",
    label: "When the session starts",
    kind: "choice",
    options: SESSION_OPTIONS,
    fallback: "newYork",
    hint: "Every one of these is read on the chart's own clock, which the View options beside this menu set. Put the chart on New York and 09:30 is the New York open.",
  },
  {
    key: "startTime",
    label: "The session opens",
    kind: "time",
    fallback: "09:30",
    hint: "Only read when the setting above is set to hours you choose. On the chart's own clock, same as the rest.",
  },
  {
    key: "endTime",
    label: "The session shuts",
    kind: "time",
    fallback: "16:00",
    hint: "Only read when the setting above is set to hours you choose. Earlier than the opening time means the session runs past midnight; the same as it means the whole 24 hours.",
  },
  {
    key: "rangeMinutes",
    label: "How long the opening range lasts",
    kind: "number",
    min: 1,
    max: 720,
    fallback: 15,
    hint: "The stretch after the session starts that makes the high and the low. It has to be a whole number of the chart's candles — 15 minutes needs 15m candles or shorter — or nothing is drawn.",
  },
  {
    key: "showSession",
    label: "Shade the session",
    kind: "switch",
    fallback: true,
    hint: "A faint tint behind the candles from the moment the session opens to the moment it shuts, so you can see which hours the range belongs to. It is only a picture — the session's hours are what they are whether it is shaded or not.",
  },
  {
    key: "showBox",
    label: "Show the range box",
    kind: "switch",
    fallback: true,
    hint: "The see-through rectangle over the candles that made the range, from its high to its low.",
  },
  {
    key: "showArrows",
    label: "Show the arrows",
    kind: "switch",
    fallback: true,
    hint: "The arrow on the candle that closed outside the box. Off hides just the arrows — the box stays, and the break is still found.",
  },
  {
    key: "showBreakouts",
    label: "Watch for breakouts",
    kind: "switch",
    fallback: true,
    hint: "A close above the range's high — a teal arrow under the candle. Off means the up side is not looked for at all, so a close above the high no longer uses up the session's one break.",
  },
  {
    key: "showBreakdowns",
    label: "Watch for breakdowns",
    kind: "switch",
    fallback: true,
    hint: "A close below the range's low — a red arrow over the candle. Off means the down side is not looked for at all, so a close below the low no longer uses up the session's one break.",
  },
]

/** This indicator's settings, once read through the list above. */
type OrbSettings = {
  session: string
  startTime: string
  endTime: string
  rangeMinutes: number
  showSession: boolean
  showBox: boolean
  showArrows: boolean
  showBreakouts: boolean
  showBreakdowns: boolean
}

function orbSettings(params: IndicatorParams): OrbSettings {
  const read = readIndicatorParams(ORB_FIELDS, params)
  // Safe by construction: the reader answers one value of the right shape for
  // every field in that list, whatever it was handed.
  return {
    session: read.session as string,
    startTime: read.startTime as string,
    endTime: read.endTime as string,
    rangeMinutes: read.rangeMinutes as number,
    showSession: read.showSession as boolean,
    showBox: read.showBox as boolean,
    showArrows: read.showArrows as boolean,
    showBreakouts: read.showBreakouts as boolean,
    showBreakdowns: read.showBreakdowns as boolean,
  }
}

/**
 * The session's hours, as minutes past local midnight.
 *
 * **The end is always after the start, even when the clock says otherwise.** A
 * session that shuts at an earlier time than it opens runs past midnight, so
 * its end is that time tomorrow; one that shuts at the same time it opens runs
 * the whole 24 hours. Both come out as a number bigger than the start, which is
 * what lets everything downstream do one comparison instead of two.
 *
 * The reader has already made sure the pick is one of the options and that both
 * times are real ones, so the fallbacks here can only be reached by a session
 * name added to the list without hours beside it.
 */
export function sessionHours(params: IndicatorParams): {
  start: number
  end: number
} {
  const settings = orbSettings(params)
  const named = SESSIONS[settings.session]
  const start = minutesOfClockTime(named?.start ?? settings.startTime) ?? 0
  const shuts = minutesOfClockTime(named?.end ?? settings.endTime) ?? 0
  return { start, end: shuts > start ? shuts : shuts + 1_440 }
}

/** Whether an opening range this long can be built out of these candles. */
function rangeBarCount(
  rangeMinutes: number,
  barMs: number
): number | "too coarse" | "not whole" {
  const rangeMs = rangeMinutes * 60_000
  if (rangeMs < barMs) return "too coarse"
  if (rangeMs % barMs !== 0) return "not whole"
  return rangeMs / barMs
}

/**
 * Everything this indicator has to say about a run of candles, in one pass.
 *
 * Lifted out of `compute` for the reason the contract gives: when this grows a
 * `signals` function it must map the arrows this already found, never walk the
 * candles a second time following the same rule. Two passes that merely agree
 * are free to stop agreeing, and the Base indicator has already been on the
 * wrong end of that once.
 */
function orbPaint(
  candles: IndicatorCandle[],
  params: IndicatorParams,
  context: IndicatorContext
): IndicatorPaint {
  const nothing: IndicatorPaint = { dashes: [], marks: [], boxes: [] }
  const settings = orbSettings(params)
  const barMs = intervalMs(context.interval)
  const bars = rangeBarCount(settings.rangeMinutes, barMs)
  // A fifteen-minute range on four-hour candles is not a range that is hard to
  // draw, it is a range that does not exist. The settings panel says so.
  if (typeof bars !== "number") return nothing
  if (candles.length === 0) return nothing

  const hours = sessionHours(params)
  const startMinute = hours.start
  // A session running past midnight has an end past 1,440, and its tail is
  // whatever that is on the day after the one it opened on.
  const runsOver = hours.end > 1_440
  const tailMinute = hours.end - 1_440
  const zone = context.zone

  // Every candle's local clock and local date, worked out once. The session
  // hunt below asks about both repeatedly, and the browser's clock tables are
  // not a free call.
  const minuteOf = new Array<number>(candles.length)
  const dayOf = new Array<number>(candles.length)
  for (let i = 0; i < candles.length; i += 1) {
    const local = zoneTimeAt(zone, candles[i].openTime)
    minuteOf[i] = local.minuteOfDay
    dayOf[i] = zoneDayKeyOf(local)
  }

  /**
   * Where each session starts: the candle that opens exactly on the session's
   * minute.
   *
   * **Exactly, never the first one after.** On a 1h chart no candle opens at
   * 09:30, and taking the 10:00 one instead would draw a box labelled as the
   * opening range that is nothing of the sort. A session with no candle on its
   * own minute simply has no opening range that day.
   *
   * One per local day, which is also what makes the hour that happens twice on
   * a clocks-go-back night one session rather than two.
   */
  const starts: number[] = []
  let lastDay = -1
  for (let i = 0; i < candles.length; i += 1) {
    if (minuteOf[i] !== startMinute || dayOf[i] === lastDay) continue
    starts.push(i)
    lastDay = dayOf[i]
  }

  const boxes: IndicatorBox[] = []
  const marks: IndicatorMark[] = []

  for (const [which, first] of starts.entries()) {
    // The next session is a hard stop whatever the hours say. A session cannot
    // run past the next one starting, and this is also what keeps a 24-hour
    // session from swallowing the day after it.
    const nextStart = starts[which + 1] ?? candles.length

    /**
     * Whether this candle is inside the session that opened at `first`.
     *
     * Two cases and no third: on the opening day it is anything from the
     * opening minute on, and on the day after — only reachable at all when the
     * session runs past midnight — anything before the closing minute.
     */
    const inSession = (k: number) =>
      dayOf[k] === dayOf[first]
        ? minuteOf[k] >= startMinute && (runsOver || minuteOf[k] < hours.end)
        : runsOver && minuteOf[k] < tailMinute

    // The last candle still inside the session. Everything the session draws
    // stops here: the tint, and how far a break is looked for.
    let shuts = first
    for (let k = first + 1; k < nextStart && inSession(k); k += 1) shuts = k

    // The session itself: a band the whole height of the chart, from the moment
    // it opened to the end of the last candle it holds.
    //
    // **Pushed before any of the range's own checks**, because the hours are a
    // fact about the clock and not about the candles. A day whose opening range
    // cannot honestly be built still had a session, and shading it is how you
    // see that the range is the thing that is missing.
    boxes.push({
      fromTime: candles[first].openTime,
      toTime: candles[shuts].openTime + barMs,
      price: null,
    })

    const wanted = first + bars - 1
    const reach = Math.min(wanted, candles.length - 1)
    if (reach >= nextStart) continue

    // A day missing candles has no honest opening range, so nothing is drawn
    // rather than a range invented out of whatever arrived.
    let whole = true
    for (let k = first + 1; k <= reach; k += 1) {
      if (candles[k].openTime === candles[first].openTime + (k - first) * barMs) {
        continue
      }
      whole = false
      break
    }
    if (!whole) continue

    let high = candles[first].high
    let low = candles[first].low
    for (let k = first + 1; k <= reach; k += 1) {
      high = Math.max(high, candles[k].high)
      low = Math.min(low, candles[k].low)
    }
    boxes.push({
      fromTime: candles[first].openTime,
      toTime: candles[reach].openTime + barMs,
      price: { high, low },
    })

    // The session happening right now. What there is of the range so far is
    // drawn, because it is what price is doing; no arrow comes out of a box
    // that has not finished being a box.
    if (reach < wanted) continue

    // Only while the session is open. A close outside the range at three in
    // the morning is not this session breaking out of anything.
    for (let k = wanted + 1; k <= shuts; k += 1) {
      const closed = candles[k].close
      // A side switched off is a side that is not looked for, so it cannot use
      // up the session's one break either. The arrow switch above is the one
      // that only hides.
      if (settings.showBreakouts && closed > high) {
        marks.push({ time: candles[k].openTime, price: closed, side: "up" })
        break
      }
      if (settings.showBreakdowns && closed < low) {
        marks.push({ time: candles[k].openTime, price: closed, side: "down" })
        break
      }
    }
  }

  return { dashes: [], marks, boxes }
}

export const orbIndicator: IndicatorModule = {
  kind: "orb",
  label: "Opening range",
  description:
    "Shades a trading session, boxes the high and the low of its first stretch, and arrows the first candle to close outside that box.",
  fields: ORB_FIELDS,
  // Two cards, split the way the Base indicator's are: the first decides where
  // the range IS, the second only decides what you are shown of it — with the
  // one exception the hints call out, that switching a side off stops that side
  // being looked for at all.
  groups: [
    {
      title: "The session",
      keys: ["session", "startTime", "endTime", "rangeMinutes"],
    },
    {
      title: "Visibility",
      keys: [
        "showSession",
        "showBox",
        "showArrows",
        "showBreakouts",
        "showBreakdowns",
      ],
    },
  ],
  /**
   * Which clock the session is on, or why nothing is being drawn.
   *
   * It speaks up every time rather than only on a problem, unlike the Base
   * indicator's. The clock is the one thing about a session that can be wrong
   * while every setting on this card looks right, and it is not on this card —
   * it is in the View options next door.
   */
  note: (params, context) => {
    const settings = orbSettings(params)
    const barMs = intervalMs(context.interval)
    const bars = rangeBarCount(settings.rangeMinutes, barMs)
    if (bars === "too coarse") {
      return `A ${settings.rangeMinutes}-minute range cannot be made out of ${context.interval} candles, so nothing is drawn. Put the chart on a shorter timeframe.`
    }
    if (bars === "not whole") {
      return `${settings.rangeMinutes} minutes is not a whole number of ${context.interval} candles, so nothing is drawn. Pick a length these candles divide into.`
    }
    const hours = sessionHours(params)
    const rangeEnds = hours.start + settings.rangeMinutes
    return `The range runs ${clockTimeOfMinutes(hours.start)} to ${clockTimeOfMinutes(rangeEnds % 1_440)} and the session to ${clockTimeOfMinutes(hours.end % 1_440)}, on the chart's clock, which is set to ${tradingZoneLabel(context.zone)}.`
  },
  /**
   * The tint, the box, the arrows, and no dashes.
   *
   * **The three switches applied here hide a picture; they do not call off a
   * break or shorten a session.** That is why they are applied on the way out
   * rather than inside `orbPaint` — when this grows a `signals` function it
   * will read the same pass, and hiding an arrow on a chart must not quietly
   * stop a step trading it. The two side switches are the opposite and live in
   * the pass itself: a side you are not watching is a side nothing happens on.
   *
   * There is deliberately no `warmupBars`. It answers in candles and would
   * have to guess how far back the session start is without knowing how long a
   * candle lasts; the honest guard is the one `orbPaint` already makes, which
   * refuses to build a range whose candles are not all there. A run that starts
   * mid-session skips that session instead of judging half a range.
   */
  compute: (candles, params, context) => {
    const settings = orbSettings(params)
    const paint = orbPaint(candles, params, context)
    return {
      dashes: [],
      marks: settings.showArrows ? paint.marks : [],
      // A band has no prices and the range box has them: that is the whole of
      // telling the two apart, and each has its own switch.
      boxes: paint.boxes.filter((box) =>
        box.price === null ? settings.showSession : settings.showBox
      ),
    }
  },
}
