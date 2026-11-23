import * as React from "react"

import { useCalendarVersion } from "@/components/fitness/program/calendar-version"
import { loadProgramCalendar, type CalendarDay } from "@/lib/api/fitness/programs"
import { addDays, weekStart, weekdayOf, type Day } from "@/lib/fitness/dates"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"

/**
 * This week's calendar for one program, Monday to Sunday, by weekday. The
 * week list on the left reads each day's status from it, and the Day view
 * reads today's row so Start logs against today's calendar date. Read again
 * whenever a calendar day changes.
 */
export function useThisWeek(programId: string, today: Day) {
  const version = useCalendarVersion()
  const monday = weekStart(today)
  const [loaded, setLoaded] = React.useState<{ key: string; days: CalendarDay[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    loadProgramCalendar(programId, monday, addDays(monday, 6)).then(
      (result) => {
        if (!live) return
        setLoaded({ key: `${programId}:${monday}:${version}`, days: result.days })
        setError(null)
      },
      (failure: unknown) => {
        if (live) setError(getFitnessErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [programId, monday, version])

  // A reload keeps showing last week's rows until the new ones land, rather than flashing empty.
  const days = loaded && loaded.key.startsWith(`${programId}:${monday}:`) ? loaded.days : null
  const byWeekday = React.useMemo(
    () => new Map((days ?? []).map((entry) => [weekdayOf(entry.day), entry])),
    [days]
  )
  return { monday, byWeekday, loading: days === null && !error, error }
}
