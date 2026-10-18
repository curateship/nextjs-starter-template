import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { PanelHeader } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { HistoryMiddle, HistoryRight } from "@/components/fitness/history/history-views"
import { PhotosMiddle, PhotosRight } from "@/components/fitness/photos/photos-views"
import { CalendarMiddle, CalendarRight } from "@/components/fitness/program/calendar-views"
import { DayActions, DayMiddle, DayRight, WeekLeft } from "@/components/fitness/program/week-views"
import { ProgressMiddle, ProgressRight } from "@/components/fitness/progress/progress-views"
import { ThreePanels } from "@/components/fitness/three-panels"
import { WorkoutMiddle, WorkoutRight } from "@/components/fitness/workout/logger-views"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { weekdayOf } from "@/lib/fitness/dates"
import { PROGRAM_PANEL_LAYOUT_KEY } from "@/lib/fitness/panel-keys"
import type { ProgramPage } from "@/lib/fitness/program-page"
import {
  PROGRAM_VIEWS,
  PROGRAM_VIEW_LABELS,
  type ProgramSearch,
  type ProgramView,
} from "@/lib/fitness/program-search"

type Part = (props: ProgramViewProps) => React.ReactNode

const VIEWS: Record<ProgramView, { middle: Part; right: Part; rightLabel: string }> = {
  day: { middle: DayMiddle, right: DayRight, rightLabel: "Exercise" },
  calendar: { middle: CalendarMiddle, right: CalendarRight, rightLabel: "Date" },
  history: { middle: HistoryMiddle, right: HistoryRight, rightLabel: "Workout" },
  progress: { middle: ProgressMiddle, right: ProgressRight, rightLabel: "Lift" },
  photos: { middle: PhotosMiddle, right: PhotosRight, rightLabel: "Photo day" },
}

/**
 * One program's dashboard, laid out like Project's pages. Tyler, 18 Oct 2026:
 * you get here only after making a program on the Programs dashboard.
 *
 * - Left: the program and its fixed week, Monday to Sunday, each day a
 *   workout or Rest. Picking a day opens it in the middle.
 * - Middle: the picked day's exercises, the calendar, history, progress or
 *   photos. While a workout is being logged (`?workout=`), the middle panel
 *   is that live workout and the tabs give way to it.
 * - Right: whatever is picked: an exercise's sets, a date, a workout, a lift.
 *
 * Everything that decides what shows is in the address
 * (`src/lib/fitness/program-search.ts`).
 */
export function ProgramDashboard({ page, search }: { page: ProgramPage; search: ProgramSearch }) {
  const navigate = useNavigate()
  const view = search.view ?? "day"
  const day = search.day ?? weekdayOf(page.today)
  const go = React.useCallback<ProgramViewProps["go"]>(
    (patch, options = {}) =>
      void navigate({
        to: ".",
        replace: options.replace,
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )
  const props: ProgramViewProps = { page, search: { ...search, view, day }, go }
  const logging = Boolean(search.workout && page.workout)
  const { middle: Middle, right: Right, rightLabel } = logging
    ? { middle: WorkoutMiddle, right: WorkoutRight, rightLabel: "Exercise" }
    : VIEWS[view]
  const switchView = (next: ProgramView) => go({ view: next, pick: undefined, compare: undefined })

  return (
    <ThreePanels
      layoutKey={PROGRAM_PANEL_LAYOUT_KEY}
      showRightFor={search.pick}
      left={{ label: "Week", showLabel: "Show the week", content: <WeekLeft {...props} /> }}
      middle={{
        // On a phone the panels are tabs. The middle one is "Program" rather
        // than the view's name, because the view dropdown under it already
        // says Day, Calendar or History, and "Day" twice read as a mistake.
        label: logging ? "Workout" : "Program",
        content: logging ? (
          <Middle {...props} />
        ) : (
          <>
            <PanelHeader plain>
              {/* Five tabs don't fit a phone, so below 640px the same choice is a dropdown. */}
              <Tabs value={view} onValueChange={(next) => switchView(next as ProgramView)} className="hidden min-w-0 sm:flex">
                <TabsList className="max-w-full justify-start">
                  {PROGRAM_VIEWS.map((entry) => (
                    <TabsTrigger key={entry} value={entry}>
                      {PROGRAM_VIEW_LABELS[entry]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Select value={view} onValueChange={(next) => switchView(next as ProgramView)}>
                <SelectTrigger aria-label="View" className="sm:hidden">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROGRAM_VIEWS.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {PROGRAM_VIEW_LABELS[entry]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* The day's menu and Start workout sit beside the tabs on every
                  view, as Tyler drew Progress on 18 Oct 2026. Away from the Day
                  view they act on the weekday last picked, today by default. */}
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <DayActions {...props} />
              </div>
            </PanelHeader>
            <Middle {...props} />
          </>
        ),
      }}
      right={{ label: rightLabel, showLabel: `Show the ${rightLabel.toLowerCase()}`, content: <Right {...props} /> }}
    />
  )
}
