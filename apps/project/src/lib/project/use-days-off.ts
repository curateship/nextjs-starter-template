import * as React from "react"

import { loadTeamDaysOff } from "@/lib/api/project/team-running"
import type { DaysOff } from "@/lib/project/days-off"
import { useTeamId } from "@/lib/project/team-scope"

/**
 * The team's coming days off, read each time `active` turns on (a picker or
 * form opening), for the warning under a due date. Null until it arrives,
 * and after a failed read, when the date still saves without the warning.
 */
export function useDaysOff(active = true): DaysOff | null {
  const [daysOff, setDaysOff] = React.useState<DaysOff | null>(null)
  const teamId = useTeamId()
  React.useEffect(() => {
    if (!active) return
    let live = true
    loadTeamDaysOff(teamId).then(
      (next) => live && setDaysOff(next),
      () => undefined
    )
    return () => {
      live = false
    }
  }, [active, teamId])
  return daysOff
}
