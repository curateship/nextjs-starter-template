import { toast } from "sonner"

import { calendarChanged } from "@/components/fitness/program/calendar-version"
import { changeProgram, type CalendarDay } from "@/lib/api/fitness/programs"
import { formatDay, type Day } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import type { ScheduleStatus } from "@/lib/fitness/schedule"

/** How each calendar status is named. The dot beside it (`status-dot.tsx`) is never the only sign. */
export const SCHEDULE_STATUS: Record<ScheduleStatus, { label: string }> = {
  planned: { label: "Planned" },
  done: { label: "Done" },
  missed: { label: "Missed" },
  paused: { label: "Paused" },
  skipped: { label: "Skipped" },
}

/**
 * Skips one calendar day on purpose, or takes the skip back, and tells both
 * panels to read the calendar again. A skipped day is neither done nor missed.
 */
export async function skipCalendarDay(entry: Pick<CalendarDay, "id" | "dayName" | "day">, skipped: boolean) {
  try {
    await changeProgram({ action: "skip", scheduledId: entry.id, skipped })
    toast.success(
      skipped
        ? `${entry.dayName} on ${formatDay(entry.day)} skipped. It won't count as missed.`
        : `${entry.dayName} on ${formatDay(entry.day)} is back on.`
    )
    calendarChanged()
    return true
  } catch (failure) {
    reportFitnessError(failure)
    return false
  }
}

/**
 * Moves one calendar day to another date and tells both panels to read the
 * calendar again. Answers whether it moved, so a caller can close what it had
 * open.
 */
export async function moveCalendarDay(entry: CalendarDay, toDay: Day) {
  if (toDay === entry.day) return false
  try {
    await changeProgram({ action: "move", scheduledId: entry.id, toDay })
    toast.success(`${entry.dayName} moved to ${formatDay(toDay)}.`)
    calendarChanged()
    return true
  } catch (failure) {
    reportFitnessError(failure)
    return false
  }
}
