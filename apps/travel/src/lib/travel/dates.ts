/**
 * Trip dates are plain calendar days ("2026-03-04"), never moments, so they
 * are worked out here with whole days and never pass through a time zone by
 * accident. "Today" is the one place a time zone matters: it is today where
 * the trip is (task part 6), or where the reader is when the trip has none.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** "2026-03-04" as a count of days, so two dates subtract cleanly. */
function dayNumber(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

function fromDayNumber(value: number) {
  return new Date(value * DAY_MS).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number) {
  return fromDayNumber(dayNumber(iso) + days)
}

export function daysBetween(fromIso: string, toIso: string) {
  return dayNumber(toIso) - dayNumber(fromIso)
}

/** The date of a trip's Day N (1 is Day 1), or null when the trip has no start date. */
export function dateOfDay(startDate: string | null, day: number) {
  return startDate ? addDays(startDate, day - 1) : null
}

export function lastDate(startDate: string | null, days: number) {
  return startDate ? addDays(startDate, days - 1) : null
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** 0 = Sunday … 6 = Saturday, the way `Date#getDay` counts. */
export function weekday(iso: string) {
  return new Date(dayNumber(iso) * DAY_MS).getUTCDay()
}

/** "Tue 4 Mar". */
export function formatDayDate(iso: string) {
  const [, month, day] = iso.split("-").map(Number)
  return `${WEEKDAY_SHORT[weekday(iso)]} ${day} ${MONTH_SHORT[month - 1]}`
}

/** "4 Mar 2026". */
export function formatLongDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`
}

/** "4 to 8 Mar 2026", or "28 Feb to 3 Mar 2026" across a month. */
export function formatTripDates(startDate: string | null, days: number) {
  if (!startDate) return null
  const end = lastDate(startDate, days)!
  if (days === 1) return formatLongDate(startDate)
  const [sy, sm, sd] = startDate.split("-").map(Number)
  const [ey, em, ed] = end.split("-").map(Number)
  if (sy === ey && sm === em) return `${sd} to ${ed} ${MONTH_SHORT[em - 1]} ${ey}`
  if (sy === ey) return `${sd} ${MONTH_SHORT[sm - 1]} to ${ed} ${MONTH_SHORT[em - 1]} ${ey}`
  return `${formatLongDate(startDate)} to ${formatLongDate(end)}`
}

/** Today's date in a time zone, or in the reader's own when there is none or it is unknown. */
export function todayIn(timeZone: string | null | undefined, at: Date = new Date()) {
  if (timeZone) {
    try {
      // en-CA writes dates as 2026-03-04.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(at)
    } catch {
      // An unknown zone falls through to the reader's own.
    }
  }
  const year = at.getFullYear()
  const month = String(at.getMonth() + 1).padStart(2, "0")
  const day = String(at.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Which day of the trip today is (1 is Day 1), or null when the trip isn't on or has no dates. */
export function todaysDay(
  trip: { startDate: string | null; days: number; timeZone: string | null },
  at: Date = new Date()
) {
  if (!trip.startDate) return null
  const day = daysBetween(trip.startDate, todayIn(trip.timeZone, at)) + 1
  return day >= 1 && day <= trip.days ? day : null
}

/** True once a day of the trip has ended where the trip is. A trip with no dates has no past days. */
export function dayHasPassed(
  trip: { startDate: string | null; timeZone: string | null },
  day: number,
  at: Date = new Date()
) {
  const date = dateOfDay(trip.startDate, day)
  return date !== null && daysBetween(date, todayIn(trip.timeZone, at)) > 0
}

/**
 * The Trips table's countdown (task part 36): "in 12 days", "tomorrow",
 * "on now", "ended yesterday", "ended 3 days ago", or "No dates".
 */
export function countdown(
  trip: { startDate: string | null; days: number; timeZone: string | null },
  at: Date = new Date()
) {
  if (!trip.startDate) return "No dates"
  const today = todayIn(trip.timeZone, at)
  const untilStart = daysBetween(today, trip.startDate)
  if (untilStart > 1) return `in ${untilStart} days`
  if (untilStart === 1) return "tomorrow"
  const sinceEnd = daysBetween(lastDate(trip.startDate, trip.days)!, today)
  if (sinceEnd <= 0) return "on now"
  if (sinceEnd === 1) return "ended yesterday"
  return `ended ${sinceEnd} days ago`
}

/** Whether the trip's last day is behind it, so its status turns to Done by itself. */
export function tripHasEnded(
  trip: { startDate: string | null; days: number; timeZone: string | null },
  at: Date = new Date()
) {
  if (!trip.startDate) return false
  return daysBetween(lastDate(trip.startDate, trip.days)!, todayIn(trip.timeZone, at)) > 0
}

/** "2026-03-04" as a local Date at midnight, for the date picker. */
export function isoToLocalDate(iso: string | null) {
  if (!iso) return undefined
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function localDateToIso(date: Date | undefined) {
  if (!date) return null
  return todayIn(null, date)
}
