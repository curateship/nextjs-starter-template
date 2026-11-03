import { formatTime, minutesOf } from "@/lib/travel/board"
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
 * The warning on a card placed outside its place's opening hours (task part
 * 21), such as "Closed at 8:00 PM on Tuesdays", or null when it's open or
 * there's nothing to check. Only the start time is checked, so a visit that
 * starts before closing doesn't warn.
 */
export function hoursWarning(
  hours: OpeningHours | null,
  weekday: number | null,
  startTime: string | null
): string | null {
  if (!hours || weekday === null || !startTime) return null
  const day = hours[weekday] ?? []
  const anyOpen = hours.some((spans) => spans.length > 0)
  if (!anyOpen) return null
  if (day.length === 0 && !isOpenAt(hours, weekday, minutesOf(startTime))) return `Closed on ${WEEKDAY_PLURAL[weekday]}`
  if (isOpenAt(hours, weekday, minutesOf(startTime))) return null
  return `Closed at ${formatTime(startTime)} on ${WEEKDAY_PLURAL[weekday]}`
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
