import { addDays, weekdayOf } from "@/lib/project/days"

/**
 * The one-click due dates above every task's month grid: Today, Tomorrow,
 * Next Monday and In a week, on the person's own calendar. Tomorrow and Next
 * Monday skip days the team doesn't work, its holidays included, so a task
 * set on Friday for Tomorrow lands on Monday.
 */

export type QuickDay = { key: "today" | "tomorrow" | "next_monday" | "week"; label: string; day: string }

const MONDAY = 1

export function quickDays(
  today: string,
  workDays: readonly number[],
  holidays: readonly string[]
): QuickDay[] {
  const off = new Set(holidays)
  const isWorkDay = (day: string) => workDays.includes(weekdayOf(day)) && !off.has(day)
  /** The day itself when the team works then, or the first work day after it. */
  const workDayFrom = (day: string) => {
    // A team with no work days at all can't happen; the cap keeps a broken one from looping.
    for (let next = day, step = 0; step < 366; next = addDays(next, 1), step++) {
      if (isWorkDay(next)) return next
    }
    return day
  }
  const daysToMonday = ((MONDAY - weekdayOf(today) + 6) % 7) + 1
  return [
    { key: "today", label: "Today", day: today },
    { key: "tomorrow", label: "Tomorrow", day: workDayFrom(addDays(today, 1)) },
    { key: "next_monday", label: "Next Monday", day: workDayFrom(addDays(today, daysToMonday)) },
    { key: "week", label: "In a week", day: addDays(today, 7) },
  ]
}
