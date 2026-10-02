import {
  zoneOffsetMinutes,
  zoneTimeAt,
  type ZoneTime,
} from "@/lib/trade/chart-timezone"
import type { MarketMatchKind } from "@/lib/trade/social/coin-matcher"

/**
 * When a market a post named has a price, and when the next one is.
 *
 * A coin trades every minute of every day, so a post about a coin always has a
 * price beside it. A stock does not: a post at 3am on a Sunday names a market
 * that has been shut since Friday afternoon and does not open again until
 * Monday morning. Every figure that reads a price at the moment of a post has
 * to say which moment it used, or a Sunday post reads as a dash and looks like
 * a bug.
 *
 * **The answer is the next session's open, never a dash and never Friday's
 * close.** Friday's close is a price from before the post, so a figure built
 * on it would credit a creator with a move that had already happened. The next
 * open is the first price anybody could have traded at after reading the post,
 * which is the honest comparison.
 *
 * Tasks 22 and 26 in `workspace/tasks/Social/` are the figures that need this.
 * Neither is built yet; both read `priceMomentFor` rather than writing their
 * own clock, so there is one answer to "when does this market next have a
 * price" in the app.
 *
 * **Only stocks have hours here.** A stock trades 09:30 to 16:00 New York on
 * a weekday and not one minute else, which is the whole reason this file
 * exists. Gold, oil and currency pairs are a different story: they trade
 * almost round the clock from Sunday evening to Friday evening, so New York's
 * session is simply the wrong answer for them. Rather than state hours that
 * are wrong, Trade states none: a metal or a currency is treated as having a
 * price whenever the post was written, and the panel says nothing about it.
 * The weekend gap those markets do have is not modelled, which is a miss worth
 * a line in the doc rather than a wrong label on screen.
 *
 * **Public holidays are not in here either.** The US market shuts about nine
 * weekdays a year, and on those the next open is an hour that did not happen.
 * That is a known miss rather than a hidden one, and the candle store makes
 * the same trade for the same reason
 * (`workspace/docs/charts/candle-store.md`, "Stock hours are not gaps").
 */

/** The clock every stock session in this app is read on. */
const MARKET_SESSION_ZONE = "America/New_York"

/** 09:30 New York, as minutes past local midnight. */
const SESSION_OPENS_AT = 9 * 60 + 30

/** 16:00 New York, as minutes past local midnight. */
const SESSION_CLOSES_AT = 16 * 60

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

/**
 * True for the one kind of market whose hours this file knows: a stock.
 *
 * A coin trades every minute of every day. A metal or a currency trades almost
 * round the clock on a weekday, close enough that New York's session would be
 * a wrong answer rather than a rough one. Only a stock is shut at 3am.
 */
export function followsTheUsSession(kind: MarketMatchKind): boolean {
  return kind === "stock"
}

/**
 * A wall-clock time on New York's calendar, back as a moment.
 *
 * Two passes, because the offset to subtract is the offset at the answer and
 * not at the guess. One pass is an hour out for half the year, which is the
 * mistake `chart-timezone.ts` opens by warning about.
 */
function momentOfLocalTime(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number
): number {
  const asIfUtc = Date.UTC(year, month - 1, day) + minuteOfDay * MINUTE_MS
  const guess =
    asIfUtc - zoneOffsetMinutes(MARKET_SESSION_ZONE, asIfUtc) * MINUTE_MS
  return asIfUtc - zoneOffsetMinutes(MARKET_SESSION_ZONE, guess) * MINUTE_MS
}

/** True when this local calendar day is one the US market opens at all. */
function aTradingDay(local: Pick<ZoneTime, "year" | "month" | "day">): boolean {
  const weekday = new Date(
    Date.UTC(local.year, local.month - 1, local.day)
  ).getUTCDay()
  return weekday !== 0 && weekday !== 6
}

/** True when the US market is open at this moment. */
export function inSessionAt(at: number): boolean {
  const local = zoneTimeAt(MARKET_SESSION_ZONE, at)
  if (!aTradingDay(local)) return false
  return (
    local.minuteOfDay >= SESSION_OPENS_AT &&
    local.minuteOfDay < SESSION_CLOSES_AT
  )
}

/**
 * The next moment the US market opens, strictly at or after this one.
 *
 * Walks New York's calendar a day at a time, so it steps over a weekend in two
 * tries and never loops: no eight days in a row are all shut. The days are
 * counted as dates rather than as added milliseconds, because adding 24 hours
 * across the March clock change lands on the wrong day.
 */
export function nextSessionOpenFrom(at: number): number {
  const today = zoneTimeAt(MARKET_SESSION_ZONE, at)
  const cursor = Date.UTC(today.year, today.month - 1, today.day)
  for (let step = 0; step < 8; step += 1) {
    const date = new Date(cursor + step * DAY_MS)
    const local = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    }
    if (!aTradingDay(local)) continue
    const open = momentOfLocalTime(
      local.year,
      local.month,
      local.day,
      SESSION_OPENS_AT
    )
    if (open >= at) return open
  }
  // Unreachable: no eight days in a row are all shut. Answering the moment
  // itself beats throwing on a screen that only wanted a label.
  return at
}

/** What a figure reading a price at the moment of a post should use. */
export type PriceMoment = {
  /** The moment to read a price at. */
  at: number
  /**
   * True when the post's own moment was used. False when the market was shut
   * and `at` is the next session's open, which the screen has to say.
   */
  own: boolean
}

/**
 * The moment to read a price for a post about this kind of market.
 *
 * A coin, or a stock named while its market was open, answers with the post's
 * own moment. A stock named out of hours answers with the next session's open
 * and says so, so the figure beside it can carry the words rather than a dash.
 */
export function priceMomentFor(
  kind: MarketMatchKind,
  postedAt: number
): PriceMoment {
  if (!followsTheUsSession(kind) || inSessionAt(postedAt)) {
    return { at: postedAt, own: true }
  }
  return { at: nextSessionOpenFrom(postedAt), own: false }
}

/**
 * Whether this kind of market is open now, and when it next opens.
 *
 * **Null for everything but a stock.** "Open" is not a question anybody asks
 * about a coin, and for a metal or a currency this file has no hours worth
 * stating. A heading saying "Currencies — shut" at 3am on a Tuesday, while the
 * pair was trading, would be worse than a heading saying nothing.
 */
export type SessionNote = {
  open: boolean
  /** The next open after this moment. While open, that is tomorrow's. */
  nextOpen: number
}

export function sessionNoteFor(
  kind: MarketMatchKind,
  now: number
): SessionNote | null {
  if (!followsTheUsSession(kind)) return null
  return { open: inSessionAt(now), nextOpen: nextSessionOpenFrom(now) }
}

/** "Mon 09:30" — the next open, on New York's clock, for a closed market. */
export function nextOpenLabel(at: number): string {
  const local = zoneTimeAt(MARKET_SESSION_ZONE, at)
  const day = new Date(
    Date.UTC(local.year, local.month - 1, local.day)
  ).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
  const hour = Math.floor(local.minuteOfDay / 60)
  const minute = local.minuteOfDay % 60
  return `${day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}
