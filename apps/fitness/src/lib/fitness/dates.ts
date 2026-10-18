/**
 * Calendar days as plain "2026-10-19" strings.
 *
 * A workout belongs to a day on the lifter's own calendar, not to an instant,
 * so the app never turns these into a moment in time and back. The maths runs
 * on UTC midnights, where every day is exactly 24 hours long.
 */

const DAY_MS = 86_400_000
export type Day = string

function toUtc(day: Day): Date {
  return new Date(`${day}T00:00:00Z`)
}

export function addDays(day: Day, count: number): Day {
  return new Date(toUtc(day).getTime() + count * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS)
}

/** 0 is Sunday, 6 is Saturday. */
export function weekdayOf(day: Day): number {
  return toUtc(day).getUTCDay()
}

/** The Monday on or before `day`. Weeks run Monday to Sunday. */
export function weekStart(day: Day): Day {
  return addDays(day, -((weekdayOf(day) + 6) % 7))
}

/** Today on the lifter's own clock, or the server's when no zone is known. */
export function todayIn(timeZone?: string | null, now: Date = new Date()): Day {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
})

/** "Mon, Oct 19". */
export function formatDay(day: Day): string {
  return DAY_LABEL.format(toUtc(day))
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

/** Where a weekday sits in a week that starts on Monday: Monday 0, Sunday 6. */
export function weekOrder(weekday: number): number {
  return (weekday + 6) % 7
}

/** The weekdays Monday first, as 0 = Sunday numbers. */
export const WEEK_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const
