import { PanelBody, PanelEmpty, PanelHeader } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { CalendarDayCard } from "@/components/fitness/program/calendar-day-card"
import { ProgramCalendar } from "@/components/fitness/program/program-calendar"
import { Button } from "@/components/ui/button"

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
      pickedId={search.pick}
      onPick={(pick) => go({ pick })}
    />
  )
}

/**
 * The right panel on the Calendar view: the picked date, to start it, open
 * what was logged, or move it. With nothing picked, it says what to pick.
 */
export function CalendarRight({ page, search, go }: ProgramViewProps) {
  if (!search.pick) {
    return (
      <>
        <PanelHeader>
          <h2 className="text-sm font-semibold">Date</h2>
        </PanelHeader>
        <PanelEmpty>Pick a date on the calendar to start, open or move its workout here.</PanelEmpty>
      </>
    )
  }
  return (
    <>
      <PanelHeader>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Date</h2>
        <Button type="button" variant="ghost" onClick={() => go({ pick: undefined })}>
          Close
        </Button>
      </PanelHeader>
      <PanelBody>
        <CalendarDayCard
          key={search.pick}
          scheduledId={search.pick}
          canLog={page.program.mine && !page.program.archived}
          onClose={() => go({ pick: undefined })}
          onOpenWorkout={(workout) => go({ workout, pick: undefined })}
        />
      </PanelBody>
    </>
  )
}
