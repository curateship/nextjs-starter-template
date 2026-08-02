/**
 * Every date and time the app shows a person. They used to live in `money.ts`,
 * where nobody looking for a date formatter would think to check — which is how
 * six screens ended up hand-rolling their own `Intl.DateTimeFormat`.
 *
 * Every formatter below is built once, here, and reused. Building an
 * `Intl.DateTimeFormat` is far more expensive than using one, and these are
 * called once per row per render on tables that list hundreds of them.
 */

const DAY = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

const DAY_AND_TIME = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
})

const DAY_IN_UTC = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
})

const CLOCK_TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
})

const CLOCK_TIME_TO_THE_SECOND = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
})

/** "Jul 30, 2025" — a day, where the clock time carries no meaning. */
export function formatDate(value: string | Date | null) {
  if (!value) return "—"
  return DAY.format(typeof value === "string" ? new Date(value) : value)
}

/** Same date, plus the clock time — for logs where the order of events matters. */
export function formatDateTime(value: string | Date | null) {
  if (!value) return "—"
  return DAY_AND_TIME.format(typeof value === "string" ? new Date(value) : value)
}

/**
 * "Aug 6, 2025" for a whole day picked off a calendar, read back in the same
 * timezone it was written in.
 *
 * An announcement's window is stored as midnight UTC of the day chosen in the
 * date picker. Read in the reader's own timezone, midnight UTC on Aug 6 is
 * still Aug 5 for everyone west of Greenwich — so the page would show the day
 * before the one that was typed in. Reading it back in UTC is what makes
 * "pick Aug 6" say "Aug 6" everywhere.
 */
export function formatUtcDate(value: string | Date | null) {
  if (!value) return "—"
  return DAY_IN_UTC.format(typeof value === "string" ? new Date(value) : value)
}

/**
 * "3:42 PM" — the clock on its own, for a row in a list that already says
 * which day it is covering. Pass `seconds` for a live log, where two entries a
 * moment apart would otherwise read as the same time.
 */
export function formatClockTime(
  value: string | Date | null,
  { seconds = false } = {}
) {
  if (!value) return "—"
  return (seconds ? CLOCK_TIME_TO_THE_SECOND : CLOCK_TIME).format(
    typeof value === "string" ? new Date(value) : value
  )
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })

const RELATIVE_UNITS: [unit: Intl.RelativeTimeFormatUnit, ms: number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
]

/**
 * "3 minutes ago", "yesterday" — for a time whose whole meaning is how long ago
 * it was, such as when a signed-in device was last used. Pair it with the exact
 * date in a `title` where the precise moment still matters.
 */
export function formatTimeAgo(value: string | Date | null) {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  const elapsed = Date.now() - date.getTime()

  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (elapsed >= unitMs) {
      return RELATIVE_TIME.format(-Math.floor(elapsed / unitMs), unit)
    }
  }

  // Under a minute, and anything dated slightly ahead of this clock.
  return "Just now"
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How an activity stream says when: "Just now", "5 minutes ago", "2 hours ago"
 * while it is still today's news, and the plain date once it is a day old. A
 * stamp like "Jul 30, 3:42 PM" on a notice that landed a minute ago makes the
 * reader work out for themselves that it just happened.
 *
 * `absolute` is the format an older item falls back to, so a list that needs the
 * clock time on old rows can pass `formatDateTime`.
 */
export function formatRelativeTime(
  value: string | Date | null,
  absolute: (value: Date) => string = formatDate
) {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  // An unparseable date would make `Intl` throw and take the whole list down.
  if (Number.isNaN(date.getTime())) return "—"

  return Date.now() - date.getTime() < DAY_MS
    ? formatTimeAgo(date)
    : absolute(date)
}
