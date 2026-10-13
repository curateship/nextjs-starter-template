/**
 * A person's day, in their own time zone. "Today" and "yesterday" always mean
 * the person's own calendar day, so a teammate in another city never sees
 * their day cut in half. Days are "YYYY-MM-DD" strings, the way Postgres
 * stores a `date`.
 */

type LocalNow = {
  /** "YYYY-MM-DD" in the zone. */
  day: string
  /** "HH:MM", 24-hour, in the zone. */
  time: string
  /** 0 = Sunday … 6 = Saturday, the way `Date#getDay` counts. */
  weekday: number
}

const partsFormat = new Map<string, Intl.DateTimeFormat>()

function formatFor(timeZone: string) {
  let format = partsFormat.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    partsFormat.set(timeZone, format)
  }
  return format
}

function zonedParts(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatFor(timeZone)
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

export function localNow(at: Date, timeZone: string): LocalNow {
  const p = zonedParts(at, timeZone)
  const day = `${p.year}-${pad(p.month)}-${pad(p.day)}`
  return { day, time: `${pad(p.hour)}:${pad(p.minute)}`, weekday: weekdayOf(day) }
}

/** True for a "YYYY-MM-DD" that is a real day: "2026-02-31" isn't. */
export function isRealDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

/** The day `count` days after `day` (or before, when negative). */
export function addDays(day: string, count: number) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10)
}

/** Whole days from one "YYYY-MM-DD" to another: 7 from a Monday to the next. */
export function daysBetween(from: string, to: string) {
  const [a, b] = [from, to].map((day) => {
    const [year, month, date] = day.split("-").map(Number)
    return Date.UTC(year, month - 1, date)
  })
  return Math.round((b - a) / 86_400_000)
}

export function weekdayOf(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay()
}

/**
 * The moment "HH:MM" falls on `day` in the zone. A time skipped by a clock
 * change lands just after the jump, the way a wall clock would read it.
 */
export function momentOf(day: string, time: string, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const wall = Date.UTC(year, month - 1, date, hour, minute)
  // Guess with the zone's offset at the wall time, then correct once for a
  // clock change between the guess and the answer.
  let guess = wall - offsetAt(new Date(wall), timeZone)
  guess = wall - offsetAt(new Date(guess), timeZone)
  return new Date(guess)
}

/** How far the zone's clock is ahead of UTC at that moment, in milliseconds. */
export function offsetAt(at: Date, timeZone: string) {
  const p = zonedParts(at, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

const SHORT_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const LONG_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
})

function utcNoonOf(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date, 12))
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const SHORT_DATE_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
const SHORT_DAY_TIME = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

/**
 * "Nov 30" for a due or snooze day this year, "Nov 30, 2027" for any other
 * year. `thisYear` is the reader's, and is only passed in by tests.
 */
export function dayLabel(day: string, thisYear = new Date().getFullYear()) {
  const date = utcNoonOf(day)
  return Number(day.slice(0, 4)) === thisYear ? SHORT_DATE.format(date) : SHORT_DATE_YEAR.format(date)
}

/** "Oct 14", or "Oct 14 to Oct 16": a stretch of days such as time off. */
export function dayRangeLabel(first: string, last: string) {
  return first === last ? dayLabel(first) : `${dayLabel(first)} to ${dayLabel(last)}`
}

/** "Fri, Oct 10, 3:04 PM", in the reader's own clock: History's one style for a moment. */
export function shortDayTimeLabel(at: string | Date) {
  return SHORT_DAY_TIME.format(new Date(at))
}

/** "Fri, Oct 10". */
export function shortDayLabel(day: string) {
  return SHORT_DAY.format(utcNoonOf(day))
}

/** "Friday, October 10". */
export function longDayLabel(day: string) {
  return LONG_DAY.format(utcNoonOf(day))
}

/** The zone this browser is in, "UTC" when it won't say. */
export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

/** "Toronto" from "America/Toronto", "UTC" from "UTC". */
export function zoneCity(timeZone: string) {
  return (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ")
}

/** "9:05 AM", read in the zone. */
export function clockIn(at: Date | string, timeZone: string) {
  return clockLabel(localNow(new Date(at), timeZone).time)
}

/** "9:00 AM" from a stored "HH:MM". */
export function clockLabel(time: string) {
  const [hour, minute] = time.split(":").map(Number)
  return `${hour % 12 || 12}:${pad(minute)} ${hour < 12 ? "AM" : "PM"}`
}
