/**
 * Pomodoro's two ways of writing a day, so History, the heatmap, the badges
 * panel and room chat all read one date the same way.
 *
 * - Long, "Tue, Oct 6, 2026", wherever a day stands on its own.
 * - Short, "Oct 6", wherever the year is plain from the context, such as the
 *   two ends of a week.
 *
 * Every day here is the account's own calendar day, in the timezone saved on
 * the profile. That is the day boundary goals and streaks already use, so a
 * session finished at 11pm in Auckland is filed under the day Auckland calls
 * it, wherever the browser happens to be.
 *
 * A "local date" is the `YYYY-MM-DD` the server already worked out in that
 * timezone. It names a day, not a moment, so it is printed in UTC at noon,
 * which can never slide into the day before or after.
 */

const LONG_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
})

const SHORT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
})

function noonOf(localDate: string) {
  return new Date(`${localDate}T12:00:00Z`)
}

/** "Tue, Oct 6, 2026" from "2026-10-06". */
export function formatLongDay(localDate: string) {
  return LONG_DAY.format(noonOf(localDate))
}

/** "Oct 6" from "2026-10-06". */
export function formatShortDay(localDate: string) {
  return SHORT_DAY.format(noonOf(localDate))
}

// One formatter per timezone, built on first use. A chat redraws every
// message on each new one, and building a formatter costs far more than
// using one.
const dayIn = new Map<string, Intl.DateTimeFormat>()
const clockIn = new Map<string, Intl.DateTimeFormat>()

function formatterFor(
  cache: Map<string, Intl.DateTimeFormat>,
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
) {
  let formatter = cache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone })
    cache.set(timeZone, formatter)
  }
  return formatter
}

/** The "YYYY-MM-DD" a moment falls on in the given timezone. */
export function localDateIn(timeZone: string, value: Date | string) {
  // en-CA writes dates as YYYY-MM-DD, which is the shape every local date in
  // this app already takes.
  return formatterFor(dayIn, "en-CA", timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value)
}

/** "3:42 PM", the clock in the given timezone. */
export function formatClockIn(timeZone: string, value: Date | string) {
  return formatterFor(clockIn, "en-US", timeZone, {
    hour: "numeric",
    minute: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value)
}
