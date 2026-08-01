/**
 * Every date and time the app shows a person. They used to live in `money.ts`,
 * where nobody looking for a date formatter would think to check — which is how
 * six screens ended up hand-rolling their own `Intl.DateTimeFormat`.
 */

/** "Jul 30, 2025" — a day, where the clock time carries no meaning. */
export function formatDate(value: string | Date | null) {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date)
}

/** Same date, plus the clock time — for logs where the order of events matters. */
export function formatDateTime(value: string | Date | null) {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
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
