import { knownTimeZone, localMinutes, nextLocalMinute } from "@/lib/social/waking"

/**
 * LinkedIn's workday hours (part 7). Tyler, 22 Oct 2026: "Weekdays, 8am to
 * 6pm", on the account's own clock, which is the clock its browser or phone
 * shows. A LinkedIn account comments, posts, connects and accepts only then,
 * as a person with a job does; activity at 2am on a Sunday is the pattern
 * LinkedIn's checks look for. It replaces the waking hours in Settings →
 * Behaviour for LinkedIn, and Tyler picked these fixed hours over a setting.
 *
 * Pure, so the server that holds a job and the screen that explains share one
 * answer.
 */

/** 8:00 and 18:00, as minutes past midnight. */
export const WORKDAY_FROM_MINUTE = 8 * 60
export const WORKDAY_UNTIL_MINUTE = 18 * 60

/** The days LinkedIn accounts work, as `Intl` names them. */
const WORKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"])

/** "Weekdays, 8:00 to 18:00", for a line on screen. */
export const WORKDAY_WORDS = "Weekdays, 8:00 to 18:00 on the account's own clock"

/** The zone's day of the week at `at`, as "Mon". */
function weekday(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: knownTimeZone(timeZone), weekday: "short" }).format(at)
}

/** Whether `at` falls on a weekday between 8:00 and 18:00 on that zone's clock. */
export function isWorkday(at: Date, timeZone: string): boolean {
  if (!WORKDAYS.has(weekday(at, timeZone))) return false
  const minute = localMinutes(at, timeZone)
  return minute >= WORKDAY_FROM_MINUTE && minute < WORKDAY_UNTIL_MINUTE
}

/** When the next workday starts, or null when `at` is inside one. */
export function nextWorkdayAt(at: Date, timeZone: string): Date | null {
  if (isWorkday(at, timeZone)) return null
  let next = nextLocalMinute(at, timeZone, WORKDAY_FROM_MINUTE)
  // At most a weekend away: Friday evening to Monday morning is three steps.
  for (let step = 0; step < 7 && !WORKDAYS.has(weekday(next, timeZone)); step += 1) {
    next = nextLocalMinute(new Date(next.getTime() + 60_000), timeZone, WORKDAY_FROM_MINUTE)
  }
  return next
}

/** When the workday `at` is inside ends. Only meaningful inside one. */
export function workdayEndsAt(at: Date, timeZone: string): Date {
  return nextLocalMinute(at, timeZone, WORKDAY_UNTIL_MINUTE)
}
