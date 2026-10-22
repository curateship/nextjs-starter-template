import { addDays, daysBetween, weekdayOf, type Day } from "@/lib/fitness/dates"

/** How far ahead the calendar is kept filled. */
export const SCHEDULE_DAYS_AHEAD = 28

export type PauseWindow = { from: Day; until: Day | null }

function isPaused(day: Day, pause: PauseWindow | null): boolean {
  if (!pause) return false
  return day >= pause.from && (pause.until === null || day <= pause.until)
}

/**
 * The program's week laid onto the calendar: every date whose weekday holds a
 * workout gets that workout. Monday Push, Wednesday Pull, Friday Legs gives
 * Push on every Monday, and so on, week after week.
 *
 * Dates that already hold a workout are left alone (one moved there by hand
 * stays), and so are paused dates.
 */
export function fillSchedule({
  from,
  to,
  week,
  taken,
  pause,
}: {
  from: Day
  to: Day
  /** Weekday (0 = Sunday) to the id of the workout day on it. */
  week: ReadonlyMap<number, string>
  taken: ReadonlySet<Day>
  pause: PauseWindow | null
}): { day: Day; dayId: string }[] {
  const entries: { day: Day; dayId: string }[] = []
  const length = daysBetween(from, to)
  for (let offset = 0; offset <= length; offset += 1) {
    const day = addDays(from, offset)
    const dayId = week.get(weekdayOf(day))
    if (!dayId || taken.has(day) || isPaused(day, pause)) continue
    entries.push({ day, dayId })
  }
  return entries
}

export type ScheduleStatus = "planned" | "done" | "missed" | "paused" | "skipped"

/**
 * A planned day in the past that nobody trained on is a missed day. One
 * skipped on purpose is neither done nor missed (Tyler, 21 Oct 2026).
 */
export function displayStatus(
  stored: "planned" | "done",
  day: Day,
  today: Day,
  pause: PauseWindow | null,
  skipped = false
): ScheduleStatus {
  if (stored === "done") return "done"
  if (isPaused(day, pause)) return "paused"
  if (skipped) return "skipped"
  return day < today ? "missed" : "planned"
}

/**
 * The last day of a program that runs for `weeks` weeks from its start day,
 * or null for one that runs for good. Twelve weeks from Mon, Jan 5 end on
 * Sun, Mar 29.
 */
export function programEndDay(startDay: Day, weeks: number | null): Day | null {
  return weeks && weeks > 0 ? addDays(startDay, weeks * 7 - 1) : null
}

/** Which week of the program a day falls in, counting from 1 on the start day. */
export function programWeekOf(startDay: Day, day: Day): number {
  return Math.floor(daysBetween(startDay, day) / 7) + 1
}

/**
 * Whether a day falls in the lighter week of a training block.
 *
 * Blocks count from the program's start: with four-week blocks, weeks 4, 8,
 * 12 and so on are the lighter ones. A block length of 0 means no blocks.
 */
export function isLightWeek(day: Day, startDay: Day, blockWeeks: number): boolean {
  if (blockWeeks < 2) return false
  const week = Math.floor(daysBetween(startDay, day) / 7)
  if (week < 0) return false
  return week % blockWeeks === blockWeeks - 1
}
