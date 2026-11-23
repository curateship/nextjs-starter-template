/**
 * "What if I had bought": what money put into a coin or a stock on a past
 * day is worth at the last stored close, bought once or every week.
 *
 * Browser-safe. The server sends one market's stored daily closes and the
 * browser works every answer out from them as the visitor types, so the
 * figures always match the stored closes exactly.
 *
 * Days are counted as whole UTC days since 1 Jan 1970 ("epoch days"), the
 * same day a daily candle opens on.
 */

export const DAY_MS = 86_400_000

/** The smallest and largest amount the page works out. */
export const MIN_AMOUNT = 1
export const MAX_AMOUNT = 1_000_000_000

export const DEFAULT_COIN = "BTC"
export const DEFAULT_AMOUNT = 1_000
export const DEFAULT_WEEKLY_AMOUNT = 100
/** Monday, counted the way `Date.getUTCDay` counts. */
export const DEFAULT_WEEKDAY = 1

/**
 * Whether the 72 Robinhood Chain stocks are offered.
 *
 * Off until Tyler decides. Their prices come from Dukascopy, whose terms of
 * use (read 25 Sep 2026) allow "non-commercial use" only and say "You may not
 * recirculate, redistribute or publish the analysis and presentation included
 * in the WEBSITE without DUKASCOPY's prior written consent." The task asks for
 * that to be checked before the stocks ship.
 */
export const STOCKS_OFFERED = false

export type WhatIfKind = "coin" | "stock"

/** One market a visitor may pick. */
export type WhatIfMarket = {
  kind: WhatIfKind
  /** "SOL", or the stock's ticker, "NVDA". What the address carries. */
  symbol: string
  /** What the picker says: "SOL", or "NVDA, Nvidia". */
  label: string
}

export type WhatIfGap = {
  /** Epoch ms, as the candle store records it. `to` is exclusive. */
  from: number
  to: number
  reason: string
}

/** One market's stored daily closes, oldest first, as the server keeps them. */
export type WhatIfSeries = {
  market: WhatIfMarket
  /** Where the prices come from, named on the page: "Binance", "Dukascopy". */
  source: string
  /** Epoch day of each close. Same length as `closes`. */
  days: number[]
  closes: number[]
  gaps: WhatIfGap[]
  /**
   * Epoch days a stock split on. Every stored price before one is already in
   * today's shares. The ratio is left out: the store's split records repeat
   * one split on several timeframes and can carry a reversing row the next
   * day, so only the day is reliable.
   */
  splitDays: number[]
}

export type WhatIfList = {
  coins: WhatIfMarket[]
  stocks: WhatIfMarket[]
}

export type ValuePoint = { day: number; value: number; putIn: number }

export type LumpSumResult = {
  /** The day the visitor picked, and the day whose close was used. */
  askedDay: number
  boughtDay: number
  boughtPrice: number
  units: number
  lastDay: number
  lastPrice: number
  worth: number
  made: number
  lowest: { day: number; worth: number }
  points: ValuePoint[]
}

export type WeeklyResult = {
  buys: number
  /** Weeks with no stored close at all between one buying day and the next. */
  skippedWeeks: number
  firstBuyDay: number
  putIn: number
  units: number
  averagePrice: number
  lastDay: number
  lastPrice: number
  worth: number
  made: number
  points: ValuePoint[]
}

/** The chart never draws more than about this many points. */
const CHART_POINTS = 400

export function epochDay(ms: number): number {
  return Math.floor(ms / DAY_MS)
}

/**
 * "4 Jan 2026", or "Sun 4 Jan 2026" with the weekday. Read in UTC, so the
 * server's drawing and the browser's always agree.
 */
export function formatDay(day: number, withWeekday = false): string {
  const date = new Date(day * DAY_MS)
  const text = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
  return withWeekday ? `${WEEKDAYS[date.getUTCDay()].slice(0, 3)} ${text}` : text
}

/** "Mar 2025", or "4 Mar" with the day and without the year. */
export function formatMonth(day: number, withDay: boolean): string {
  const date = new Date(day * DAY_MS)
  const month = MONTHS[date.getUTCMonth()]
  return withDay
    ? `${date.getUTCDate()} ${month}`
    : `${month} ${date.getUTCFullYear()}`
}

// Written out rather than asked of `Intl`, whose English says "Sept" on
// some machines and "Sep" on others.
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

/** 0 for Sunday to 6 for Saturday. Epoch day 0 was a Thursday. */
export function weekdayOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7
}

/** The index of the first stored close on or after `day`, or -1. */
export function firstCloseFrom(series: WhatIfSeries, day: number): number {
  let low = 0
  let high = series.days.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (series.days[middle] < day) low = middle + 1
    else high = middle
  }
  return low < series.days.length ? low : -1
}

/** The recorded gap a day sits in, or null. */
export function gapOn(series: WhatIfSeries, day: number): WhatIfGap | null {
  const start = day * DAY_MS
  return (
    series.gaps.find((gap) => gap.from <= start && start < gap.to) ?? null
  )
}

/**
 * `amount` put in at the close of `day`, held to the last stored close.
 *
 * A day with no close (a weekend for a stock, or a day inside a gap) buys at
 * the next close there is; the page says which day that was. Null when there
 * is no close on or after the day.
 */
export function lumpSum(
  series: WhatIfSeries,
  amount: number,
  day: number
): LumpSumResult | null {
  const start = firstCloseFrom(series, day)
  if (start === -1) return null
  const boughtPrice = series.closes[start]
  const units = amount / boughtPrice
  const last = series.days.length - 1

  let lowest = { day: series.days[start], worth: amount }
  const points: ValuePoint[] = []
  for (let index = start; index <= last; index += 1) {
    const worth = units * series.closes[index]
    if (worth < lowest.worth) lowest = { day: series.days[index], worth }
    points.push({ day: series.days[index], value: worth, putIn: amount })
  }

  const worth = units * series.closes[last]
  return {
    askedDay: day,
    boughtDay: series.days[start],
    boughtPrice,
    units,
    lastDay: series.days[last],
    lastPrice: series.closes[last],
    worth,
    made: worth - amount,
    lowest,
    points: thinned(points, lowest.day),
  }
}

/**
 * `amount` put in every week on `weekday`, from the first such day on or
 * after `startDay` to the last stored close.
 *
 * Each week buys at the close of its buying day, or of the next day with a
 * close before the following buying day (a stock's holiday Monday buys on
 * Tuesday). A week with no close at all buys nothing and is counted, so the
 * page can say so. Null when not one week bought anything.
 */
export function weeklyBuys(
  series: WhatIfSeries,
  amount: number,
  weekday: number,
  startDay: number
): WeeklyResult | null {
  const last = series.days.length - 1
  if (last < 0) return null
  const lastDay = series.days[last]
  const firstScheduled = startDay + ((weekday - weekdayOf(startDay) + 7) % 7)

  const buyAt = new Map<number, number>()
  let skippedWeeks = 0
  for (let due = firstScheduled; due <= lastDay; due += 7) {
    const index = firstCloseFrom(series, due)
    if (index === -1 || series.days[index] >= due + 7) skippedWeeks += 1
    else buyAt.set(index, amount)
  }
  if (buyAt.size === 0) return null

  const firstIndex = Math.min(...buyAt.keys())
  let units = 0
  let putIn = 0
  const points: ValuePoint[] = []
  for (let index = firstIndex; index <= last; index += 1) {
    const bought = buyAt.get(index)
    if (bought !== undefined) {
      units += bought / series.closes[index]
      putIn += bought
    }
    points.push({
      day: series.days[index],
      value: units * series.closes[index],
      putIn,
    })
  }

  const worth = units * series.closes[last]
  return {
    buys: buyAt.size,
    skippedWeeks,
    firstBuyDay: series.days[firstIndex],
    putIn,
    units,
    averagePrice: putIn / units,
    lastDay,
    lastPrice: series.closes[last],
    worth,
    made: worth - putIn,
    points: thinned(points),
  }
}

/** The split days after `fromDay`, up to and including `toDay`. */
export function splitDaysBetween(
  series: WhatIfSeries,
  fromDay: number,
  toDay: number
): number[] {
  return series.splitDays.filter((day) => day > fromDay && day <= toDay)
}

/**
 * One day per split from the store's records, oldest first. Records within
 * three days of each other are one split, written down once per timeframe.
 */
export function splitDaysFrom(records: readonly { at: number }[]): number[] {
  const days = [...new Set(records.map((record) => epochDay(record.at)))].sort(
    (left, right) => left - right
  )
  return days.filter((day, index) => index === 0 || day - days[index - 1] > 3)
}

/**
 * At most about `CHART_POINTS` points, always keeping the first, the last,
 * and `keepDay` (the lowest point, which the page names).
 */
function thinned(points: ValuePoint[], keepDay?: number): ValuePoint[] {
  if (points.length <= CHART_POINTS) return points
  const step = Math.ceil(points.length / CHART_POINTS)
  return points.filter(
    (point, index) =>
      index % step === 0 ||
      index === points.length - 1 ||
      point.day === keepDay
  )
}
