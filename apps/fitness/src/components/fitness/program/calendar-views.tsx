import { CalendarDaysIcon } from "lucide-react"

import { PanelBody, RightEmpty, RightHeader } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { CalendarDayCard } from "@/components/fitness/program/calendar-day-card"
import { ProgramCalendar } from "@/components/fitness/program/program-calendar"

/**
 * The Calendar view: the program's week repeated through the month. A date
 * is picked into the right panel; a planned date drags onto another.
 */
export function CalendarMiddle({ page, search, go }: ProgramViewProps) {
  return (
    <ProgramCalendar
      key={page.program.id}
      programId={page.program.id}
      today={page.today}
      hasPlan={page.week.length > 0}
      pickedId={search.open}
      onPick={(pick) => go({ open: pick })}
    />
  )
}

/**
 * The right panel on the Calendar view: the picked date, to start it, open
 * what was logged, or move it. With nothing picked, it says what to click.
 */
export function CalendarRight({ page, search, go }: ProgramViewProps) {
  if (!search.open) {
    return (
      <RightEmpty title="Date" icon={CalendarDaysIcon} line="Click a date on the calendar to start, open or move its workout here." />
    )
  }
  return (
    <>
      <RightHeader title="Date" closeLabel="Close this date" onClose={() => go({ open: undefined })} />
      <PanelBody>
        <CalendarDayCard
          key={search.open}
          scheduledId={search.open}
          canLog={page.program.mine && !page.program.archived}
          onOpenWorkout={(workout) => go({ workout, open: undefined })}
        />
      </PanelBody>
    </>
  )
}
