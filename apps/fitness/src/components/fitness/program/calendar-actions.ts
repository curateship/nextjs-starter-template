import type * as React from "react"
import { CalendarIcon, CheckIcon, PauseIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { calendarChanged } from "@/components/fitness/program/calendar-version"
import { changeProgram, type CalendarDay } from "@/lib/api/fitness/programs"
import { formatDay, type Day } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import type { ScheduleStatus } from "@/lib/fitness/schedule"

/** How each calendar status is named and drawn. Always a word beside the icon, never colour alone. */
export const SCHEDULE_STATUS: Record<
  ScheduleStatus,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  planned: { label: "Planned", icon: CalendarIcon },
  done: { label: "Done", icon: CheckIcon },
  missed: { label: "Missed", icon: XIcon },
  paused: { label: "Paused", icon: PauseIcon },
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
