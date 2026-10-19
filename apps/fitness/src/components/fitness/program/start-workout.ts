import * as React from "react"

import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { calendarChanged } from "@/components/fitness/program/calendar-version"
import type { CalendarDay, WeekDay } from "@/lib/api/fitness/programs"
import { beginWorkout } from "@/lib/api/fitness/workouts"
import { weekdayOf } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"

/**
 * Starts a weekday's workout and opens it in the middle panel.
 *
 * On today's weekday it logs against today's calendar date, so the calendar
 * marks it done, and a workout already started today is opened again rather
 * than started twice. On any other weekday it logs that day's workout as
 * done today, which is how a workout is done early or made up.
 */
export function useStartWorkout(page: ProgramViewProps["page"], go: ProgramViewProps["go"]) {
  const [busy, setBusy] = React.useState(false)

  const start = React.useCallback(
    async (day: WeekDay, todaysRow: CalendarDay | undefined) => {
      setBusy(true)
      try {
        const onToday = day.weekday === weekdayOf(page.today) && todaysRow && todaysRow.dayId === day.id
        if (onToday && todaysRow.workoutId) {
          go({ workout: todaysRow.workoutId, pick: undefined })
          return
        }
        const { id } = onToday
          ? await beginWorkout({ from: "scheduled", scheduledId: todaysRow.id })
          : await beginWorkout({ from: "day", dayId: day.id })
        calendarChanged()
        go({ workout: id, pick: undefined })
      } catch (error) {
        reportFitnessError(error)
      } finally {
        setBusy(false)
      }
    },
    [go, page.today]
  )

  return { start, busy }
}
