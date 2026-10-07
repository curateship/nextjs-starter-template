import { shiftLocalDate } from "@/lib/pomodoro/focus-history"

/**
 * Planning past today. A task can go on today or any of the next six days,
 * and nowhere else: the window is short on purpose, so the day strip fits on
 * a phone and nobody plans a month they will not look at. Tyler picked seven
 * days on 7 Oct 2026.
 */
export const PLAN_AHEAD_DAYS = 6

/** Today and the next six days, as `yyyy-mm-dd`, today first. */
export function planningDays(today: string) {
  return Array.from({ length: PLAN_AHEAD_DAYS + 1 }, (_, offset) =>
    shiftLocalDate(today, offset)
  )
}

/** Whether a date is a future day inside the window. Today is not one. */
export function isPlannableFutureDay(today: string, date: string) {
  return date > today && date <= shiftLocalDate(today, PLAN_AHEAD_DAYS)
}
