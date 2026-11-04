import { formatTime, minutesOf } from "@/lib/travel/board"
import { dateOfDay, weekday as weekdayOf } from "@/lib/travel/dates"
import type { OpeningHours } from "@/lib/travel/rules"

const WEEKDAY_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"]
const WEEKDAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/** Whether a place is open at a minute of a weekday, counting spans that run past midnight from the day before. */
function isOpenAt(hours: OpeningHours, weekday: number, minute: number) {
  const today = hours[weekday] ?? []
  for (const span of today) {
    const open = minutesOf(span.open)
    const close = minutesOf(span.close)
    if (close > open ? minute >= open && minute < close : minute >= open) return true
  }
  const yesterday = hours[(weekday + 6) % 7] ?? []
  for (const span of yesterday) {
    const open = minutesOf(span.open)
    const close = minutesOf(span.close)
    if (close <= open && minute < close) return true
  }
  return false
}

/**
 * Whether a place is shut for the whole of a weekday: it has opening hours,
 * and none of them on that day. A place with no hours at all is never shut,
 * because nothing is known about it.
 */
export function closedAllDay(hours: OpeningHours | null, weekday: number) {
  if (!hours || !hours.some((spans) => spans.length > 0)) return false
  return (hours[weekday] ?? []).length === 0
}

/**
 * The warning on a card whose place isn't open for it (task part 21), or null
 * when it's open or there's nothing to check. A card with a start time warns
 * when that time is outside the hours, such as "Closed at 8:00 PM on
 * Tuesdays"; only the start is checked, so a visit that starts before closing
 * doesn't warn. A card with no start time warns only when the place is shut
 * all that day, "Closed on Mondays" (Travel features part 1).
 */
export function hoursWarning(
  hours: OpeningHours | null,
  weekday: number | null,
  startTime: string | null
): string | null {
  if (!hours || weekday === null) return null
  if (!startTime) return closedAllDay(hours, weekday) ? `Closed on ${WEEKDAY_PLURAL[weekday]}` : null
  const day = hours[weekday] ?? []
  const anyOpen = hours.some((spans) => spans.length > 0)
  if (!anyOpen) return null
  if (day.length === 0 && !isOpenAt(hours, weekday, minutesOf(startTime))) return `Closed on ${WEEKDAY_PLURAL[weekday]}`
  if (isOpenAt(hours, weekday, minutesOf(startTime))) return null
  return `Closed at ${formatTime(startTime)} on ${WEEKDAY_PLURAL[weekday]}`
}

/**
 * The day to move a card to when its place is shut all day on its own day
 * (Travel features part 1: "Warning + Move button"): the nearest day of the
 * trip the place is open, a later day first when two are as near. Null when
 * the card isn't on a shut day, the trip has no dates, or the place is open
 * on none of the trip's days.
 */
export function nearestOpenDay(
  hours: OpeningHours | null,
  trip: { startDate: string | null; days: number },
  day: number | null
): number | null {
  if (day === null || !trip.startDate) return null
  const shutOn = (other: number) => closedAllDay(hours, weekdayOf(dateOfDay(trip.startDate, other)!))
  if (!shutOn(day)) return null
  for (let step = 1; step < trip.days; step += 1) {
    for (const other of [day + step, day - step]) {
      if (other >= 1 && other <= trip.days && !shutOn(other)) return other
    }
  }
  return null
}

/** "9:00 AM to 5:00 PM", "Closed", or two spans joined: one line per weekday for the right panel. */
export function hoursLines(hours: OpeningHours) {
  return hours.map((spans, weekday) => ({
    weekday: WEEKDAY_NAME[weekday],
    text:
      spans.length === 0
        ? "Closed"
        : spans
            .map((span) =>
              span.open === "00:00" && span.close === "23:59"
                ? "Open 24 hours"
                : `${formatTime(span.open)} to ${formatTime(span.close)}`
            )
            .join(", "),
  }))
}
