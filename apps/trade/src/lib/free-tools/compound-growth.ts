/**
 * The compound growth calculator's maths, run in the browser as the visitor
 * types. Everything is worked out one day at a time, so a gain per week or per
 * month, money added each month and losing days all share one clock.
 *
 * `workspace/docs/free-tools/compound-growth-calculator.md` has the formulas
 * in plain words.
 */

export const GAIN_PERIODS = ["day", "week", "month"] as const
export type GainPeriod = (typeof GAIN_PERIODS)[number]

export const LENGTH_UNITS = ["days", "weeks", "months", "years"] as const
export type LengthUnit = (typeof LENGTH_UNITS)[number]

/** A year is 365 days and a month is a twelfth of one. */
export const DAYS_IN_YEAR = 365
export const DAYS_IN_MONTH = DAYS_IN_YEAR / 12

const DAYS_PER_GAIN_PERIOD: Record<GainPeriod, number> = {
  day: 1,
  week: 7,
  month: DAYS_IN_MONTH,
}

const DAYS_PER_LENGTH_UNIT: Record<LengthUnit, number> = {
  days: 1,
  weeks: 7,
  months: DAYS_IN_MONTH,
  years: DAYS_IN_YEAR,
}

/** Fifty years, the longest stretch the page works out. */
export const MAX_DAYS = 50 * DAYS_IN_YEAR

/** Out of every 100 days, how many lose and how much each one loses. */
export type LosingDays = { per100: number; lossPercent: number }

/** The whole number of days a length covers, rounded to the nearest day. */
export function lengthInDays(length: number, unit: LengthUnit): number {
  return Math.round(length * DAYS_PER_LENGTH_UNIT[unit])
}

/** The longest length each unit allows, so every unit stops at fifty years. */
export function maxLength(unit: LengthUnit): number {
  return Math.floor(MAX_DAYS / DAYS_PER_LENGTH_UNIT[unit])
}

/**
 * The daily gain that compounds to the stated gain over one period, as a
 * fraction: 7% a week is 0.97% a day, because 1.0097 to the 7th is 1.07.
 */
export function dailyRate(gainPercent: number, per: GainPeriod): number {
  return Math.pow(1 + gainPercent / 100, 1 / DAYS_PER_GAIN_PERIOD[per]) - 1
}

/**
 * Whether day `index` (counting from 0) is a losing day. Losing days are
 * spread as evenly as whole days allow: with 40 out of 100, days 2, 4, 7 and
 * 9 lose, and every run of 100 days holds exactly 40 of them.
 */
export function isLosingDay(index: number, per100: number): boolean {
  return (
    Math.floor(((index + 1) * per100) / 100) >
    Math.floor((index * per100) / 100)
  )
}

/** How many of the first `days` days lose. */
export function losingDayCount(days: number, per100: number): number {
  return Math.floor((days * per100) / 100)
}

export type GrowthRow = {
  /** Months since the start; the last row may end part-way through one. */
  month: number
  day: number
  addedThisMonth: number
  balance: number
  putIn: number
}

export type GrowthPoint = { day: number; balance: number }

/** The chart never draws more than about this many points. */
const CHART_POINTS = 240

export type GrowthResult = {
  end: number
  putIn: number
  made: number
  /** Month 0 is the start, then one row per month end, then the last day. */
  rows: GrowthRow[]
  /** The balance on evenly spaced days for the chart, first and last included. */
  points: GrowthPoint[]
}

/**
 * Grows `start` one day at a time for `days` days. Money added each month
 * goes in at the end of every full month, after that day's gain. A losing day
 * takes `lossPercent` off in place of the day's gain.
 */
export function growForwards(input: {
  start: number
  dailyRate: number
  days: number
  monthlyAdd: number
  losingDays?: LosingDays | null
}): GrowthResult {
  const { start, days, monthlyAdd, losingDays } = input
  const loss = losingDays ? losingDays.lossPercent / 100 : 0
  let balance = start
  let putIn = start
  let month = 0
  let nextMonthEnd = Math.round(DAYS_IN_MONTH)
  const rows: GrowthRow[] = [
    { month: 0, day: 0, addedThisMonth: 0, balance, putIn },
  ]
  const pointEvery = Math.max(1, Math.ceil(days / CHART_POINTS))
  const points: GrowthPoint[] = [{ day: 0, balance }]

  for (let day = 1; day <= days; day += 1) {
    const losing = losingDays ? isLosingDay(day - 1, losingDays.per100) : false
    balance *= losing ? 1 - loss : 1 + input.dailyRate

    if (day === nextMonthEnd) {
      month += 1
      balance += monthlyAdd
      putIn += monthlyAdd
      rows.push({ month, day, addedThisMonth: monthlyAdd, balance, putIn })
      nextMonthEnd = Math.round((month + 1) * DAYS_IN_MONTH)
    } else if (day === days) {
      rows.push({
        month: day / DAYS_IN_MONTH,
        day,
        addedThisMonth: 0,
        balance,
        putIn,
      })
    }
    if (day % pointEvery === 0 || day === days) points.push({ day, balance })
  }

  return { end: balance, putIn, made: balance - putIn, rows, points }
}

export type NeededGain = {
  /** The gain every gaining day needs, as a fraction. */
  perGainingDay: number
  /** The average gain a week and a month need, as fractions. */
  perWeek: number
  perMonth: number
}

/**
 * The gain needed to turn `start` into `goal` in `days` days, with no money
 * added. With losing days switched on, the gaining days have to make up for
 * them, so each one needs more. Null when the goal cannot be reached: no
 * gaining day is left, or a losing day takes everything.
 */
export function neededGain(input: {
  start: number
  goal: number
  days: number
  losingDays?: LosingDays | null
}): NeededGain | null {
  const { start, goal, days, losingDays } = input
  const losing = losingDays ? losingDayCount(days, losingDays.per100) : 0
  const gaining = days - losing
  const keptOnLosingDay = losingDays ? 1 - losingDays.lossPercent / 100 : 1
  if (gaining <= 0 || (losing > 0 && keptOnLosingDay <= 0)) return null

  const growth = goal / start
  const perGainingDay =
    Math.pow(growth / Math.pow(keptOnLosingDay, losing), 1 / gaining) - 1
  return {
    perGainingDay,
    perWeek: Math.pow(growth, 7 / days) - 1,
    perMonth: Math.pow(growth, DAYS_IN_MONTH / days) - 1,
  }
}
