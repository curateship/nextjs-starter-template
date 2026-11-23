import {
  isValidDateString,
  toDateString,
  WEEKDAY_LABELS,
} from "@/lib/events/calendar-grid"
import { formatEventShortDay } from "@/lib/events/event-time"

/**
 * The rules for a repeating event, copied from the old Directory app's
 * `lib/utils/event-recurrence.ts` with its tests.
 *
 * Every day is a `YYYY-MM-DD` string on the site's own calendar, and
 * `Date.UTC` is only a calendar calculator, so no reader's or server's time
 * zone can move a day. Nothing here asks what today is; the caller says.
 *
 * Weekdays are 0 for Sunday to 6 for Saturday. A monthly week is 1 to 4 for
 * the first to the fourth, or -1 for the last.
 */

export type RepeatWeek = 1 | 2 | 3 | 4 | -1

export type RepeatRule =
  | {
      freq: "weekly"
      /** At least one, sorted, no repeats. */
      weekdays: number[]
      /** The last day a date may fall on, or null for no end. */
      until: string | null
    }
  | {
      freq: "monthly"
      week: RepeatWeek
      weekday: number
      until: string | null
    }

export const REPEAT_WEEKS: readonly RepeatWeek[] = [1, 2, 3, 4, -1]

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

const WEEK_NAMES: Record<RepeatWeek, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  [-1]: "last",
}

/** "Thursday" for 4. */
export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? ""
}

/** "Thu" for 4. */
export function weekdayShortName(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? ""
}

/** "First" for 1, "Last" for -1. */
export function weekName(week: RepeatWeek): string {
  const name = WEEK_NAMES[week]
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function parts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number)
  return [year, month, day]
}

function fromUtc(at: Date): string {
  return toDateString(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate())
}

/** 0 for a Sunday to 6 for a Saturday. */
export function weekdayOf(date: string): number {
  const [year, month, day] = parts(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** "2026-10-08" for "2026-10-01" and 7. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = parts(date)
  return fromUtc(new Date(Date.UTC(year, month - 1, day + days)))
}

/** "2027-01-23" for "2026-10-23" and 3. The 31st of a short month rolls on. */
export function addMonthsToDay(date: string, months: number): string {
  const [year, month, day] = parts(date)
  return fromUtc(new Date(Date.UTC(year, month - 1 + months, day)))
}

/**
 * The nth weekday of a month, like the first Tuesday, or null when there is
 * none. The last is always there; a fifth never is, because a week is 1 to 4.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  week: RepeatWeek,
  weekday: number
): string | null {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (week === -1) {
    const lastWeekday = new Date(
      Date.UTC(year, month - 1, daysInMonth)
    ).getUTCDay()
    const back = (lastWeekday - weekday + 7) % 7
    return toDateString(year, month, daysInMonth - back)
  }
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (week - 1) * 7
  return day > daysInMonth ? null : toDateString(year, month, day)
}

/** Whether the rule makes a date on this day, ignoring its end. */
export function repeatFallsOn(rule: RepeatRule, date: string): boolean {
  if (rule.freq === "weekly") return rule.weekdays.includes(weekdayOf(date))
  const [year, month] = parts(date)
  return nthWeekdayOfMonth(year, month, rule.week, rule.weekday) === date
}

/**
 * The first day the rule makes a date on that comes after `after`, or null
 * once the rule has ended. Two dates are never more than five weeks apart,
 * so the search stops at six.
 */
export function nextRepeatDate(rule: RepeatRule, after: string): string | null {
  for (let step = 1; step <= 42; step++) {
    const candidate = addDays(after, step)
    if (rule.until && candidate > rule.until) return null
    if (repeatFallsOn(rule, candidate)) return candidate
  }
  return null
}

/** "Thursday", "Tuesday and Thursday", "Monday, Wednesday and Friday". */
function listOfDays(weekdays: number[]): string {
  const names = weekdays.map(weekdayName)
  if (names.length === 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

const UNTIL_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
})

/**
 * The plain sentence under the schedule box: "Every Thursday until Dec 18,
 * 2026", or "The last Friday of every month".
 */
export function describeRepeat(rule: RepeatRule): string {
  const base =
    rule.freq === "weekly"
      ? `Every ${listOfDays(rule.weekdays)}`
      : `The ${WEEK_NAMES[rule.week]} ${weekdayName(rule.weekday)} of every month`
  if (!rule.until) return base
  const [year, month, day] = parts(rule.until)
  return `${base} until ${UNTIL_DAY.format(new Date(Date.UTC(year, month - 1, day)))}`
}

/**
 * The event's own day and the next dates the rule makes after it, `count` in
 * all at most, for the preview under the sentence.
 */
export function firstRepeatDates(
  rule: RepeatRule,
  startDate: string,
  count: number
): string[] {
  const dates = [startDate]
  while (dates.length < count) {
    const next = nextRepeatDate(rule, dates[dates.length - 1]!)
    if (!next) break
    dates.push(next)
  }
  return dates
}

/** "Thu, Oct 1 · Thu, Oct 8 · Thu, Oct 15". */
export function repeatDatesText(dates: string[]): string {
  return dates.map(formatEventShortDay).join(" · ")
}

/** A stored or sent rule, checked, or null when it is not one. */
export function parseRepeatRule(raw: unknown): RepeatRule | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const until = isValidDateString(value.until) ? value.until : null
  const isWeekday = (day: unknown): day is number =>
    Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6

  if (value.freq === "weekly") {
    if (!Array.isArray(value.weekdays)) return null
    const weekdays = [...new Set(value.weekdays.filter(isWeekday))].sort(
      (a, b) => a - b
    )
    return weekdays.length ? { freq: "weekly", weekdays, until } : null
  }
  if (value.freq === "monthly") {
    const week = REPEAT_WEEKS.find((each) => each === value.week)
    if (week === undefined || !isWeekday(value.weekday)) return null
    return { freq: "monthly", week, weekday: value.weekday, until }
  }
  return null
}

/** Two rules that make the same dates. */
export function sameRepeat(
  a: RepeatRule | null,
  b: RepeatRule | null
): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * The rule a schedule box starts from when the admin picks weekly or monthly:
 * the start day's own weekday, and for monthly the week it falls in. A day
 * from the 29th on is the last of its kind in the month.
 */
export function repeatStartingFrom(
  freq: RepeatRule["freq"],
  startDate: string,
  until: string | null
): RepeatRule {
  const weekday = isValidDateString(startDate) ? weekdayOf(startDate) : 4
  if (freq === "weekly") return { freq, weekdays: [weekday], until }
  const day = isValidDateString(startDate) ? parts(startDate)[2] : 1
  const week = day > 28 ? -1 : (Math.ceil(day / 7) as RepeatWeek)
  return { freq, week, weekday, until }
}

/**
 * Why a rule cannot be saved on an event starting that day, or null when it
 * can. The event is the first date, so the rule has to fall on its day, or the
 * sentence would describe dates that are not the ones made.
 */
export function repeatProblem(
  rule: RepeatRule,
  startDate: string
): string | null {
  if (rule.until && rule.until < startDate) {
    return "The repeat ends before the event starts. Pick a later end day, or none."
  }
  if (!repeatFallsOn(rule, startDate)) {
    return `The event starts on a ${weekdayName(weekdayOf(startDate))}, and "${describeRepeat({ ...rule, until: null })}" never falls on it. Change the repeat or the start day.`
  }
  return null
}
