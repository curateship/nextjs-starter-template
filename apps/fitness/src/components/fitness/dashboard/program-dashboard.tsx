import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { PanelHeader } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { newestFirst, ownRecords, shownHistory } from "@/components/fitness/dashboard/view-rows"
import { HistoryMiddle, HistoryRight, HistoryTools } from "@/components/fitness/history/history-views"
import { PhotosMiddle, PhotosRight, PhotosTools } from "@/components/fitness/photos/photos-views"
import { CalendarMiddle, CalendarRight } from "@/components/fitness/program/calendar-views"
import { DayMenu, DayMiddle, DayNew, DayRight, StartWorkoutButton, WeekLeft } from "@/components/fitness/program/week-views"
import { ProgressMiddle, ProgressRight, ProgressTools } from "@/components/fitness/progress/progress-views"
import { UnderlineTabs } from "@/components/fitness/underline-tabs"
import { WorkoutMiddle, WorkoutRight } from "@/components/fitness/workout/logger-views"
import { ThreePanels } from "@/components/shared/three-panels"
import { weekdayOf } from "@/lib/fitness/dates"
import { NO_HISTORY_FILTERS } from "@/lib/fitness/history-filters"
import { PROGRAM_PANEL_LAYOUT_KEY, programPlaceKey } from "@/lib/fitness/panel-keys"
import type { ProgramPage } from "@/lib/fitness/program-page"
import {
  PROGRAM_VIEWS,
  PROGRAM_VIEW_LABELS,
  type ProgramSearch,
  type ProgramView,
} from "@/lib/fitness/program-search"

type Part = (props: ProgramViewProps) => React.ReactNode

type View = {
  middle: Part
  right: Part
  rightLabel: string
  /** The view's own buttons in the middle header, left of the day's menu: History's search, Filter and Views. */
  tools?: Part
  /** The view's "New …", right of the day's menu. */
  create?: Part
  /** The rows the middle lists, first row first, for opening the first on arrival. */
  ids: (props: ProgramViewProps) => string[]
}

const VIEWS: Record<ProgramView, View> = {
  day: {
    middle: DayMiddle,
    right: DayRight,
    rightLabel: "Exercise",
    create: DayNew,
    ids: ({ page, search }) => page.week.find((day) => day.weekday === search.day)?.exercises.map((row) => row.id) ?? [],
  },
  // The calendar loads its own months, so nothing on it opens by itself.
  calendar: { middle: CalendarMiddle, right: CalendarRight, rightLabel: "Date", ids: () => [] },
  history: {
    middle: HistoryMiddle,
    right: HistoryRight,
    rightLabel: "Workout",
    tools: HistoryTools,
    ids: (props) => shownHistory(props).map((row) => row.id),
  },
  progress: {
    middle: ProgressMiddle,
    right: ProgressRight,
    rightLabel: "Lift",
    create: ProgressTools,
    ids: ({ page }) => ownRecords(page).map((record) => record.exerciseId),
  },
  photos: {
    middle: PhotosMiddle,
    right: PhotosRight,
    rightLabel: "Photo day",
    create: PhotosTools,
    ids: ({ page }) => (page.viewData.view === "photos" ? newestFirst(page.viewData.photos.sessions).map((session) => session.id) : []),
  },
}

/**
 * One program's dashboard, on the shell's three-column frame and laid out by
 * the UI standard's three-column rules. Tyler, 18 Oct 2026: you get here only
 * after making a program on the Programs dashboard.
 *
 * - Left: the program's header, banner and picture, then its fixed week,
 *   Monday to Sunday, each day a workout or Rest. Picking a day opens it in
 *   the middle.
 * - Middle: Day, Calendar, History, Progress or Photos as underlined tabs
 *   (five tabs, so the line rather than pills), then the view's own tools,
 *   the day's menu, the view's "New …" and Start workout. While a workout is
 *   being logged (`?workout=`), the middle panel is that live workout.
 * - Right: whatever is open, `?open=`: an exercise, a date, a workout, a
 *   lift or a photo day.
 *
 * On arrival at a bare address the dashboard goes back to where it was left
 * on this program, then opens the first row of the view if nothing is open
 * (`useDashboardPlace`). The workout being logged is never put back.
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
          const next: Record<string, unknown> = { ...previous }
          // History's search and filters belong to History, however the view changes.
          if (patch.view !== undefined && patch.view !== (previous.view ?? "day")) Object.assign(next, NO_HISTORY_FILTERS)
          // A workout opened, closed or swapped starts on its own first lift.
          if ("workout" in patch && !("at" in patch)) next.at = undefined
          Object.assign(next, patch)
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )
  const props: ProgramViewProps = { page, search: { ...search, view, day }, go }
  const logging = Boolean(search.workout && page.workout)
  const current = VIEWS[view]
  const { middle: Middle, right: Right, rightLabel } = logging
    ? { middle: WorkoutMiddle, right: WorkoutRight, rightLabel: "Exercise" }
    : current
  const switchView = (next: ProgramView) => go({ view: next, open: undefined, compare: undefined })
  // The workout being logged, and the lift open in it, are never put back on a later visit.
  const place = Object.fromEntries(Object.entries(search).filter(([key]) => key !== "workout" && key !== "at"))
  const Tools = current.tools
  const Create = current.create

  return (
    <ThreePanels
      layoutKey={PROGRAM_PANEL_LAYOUT_KEY}
      place={{ key: programPlaceKey(page.program.id), search: place, ids: logging ? [] : current.ids(props) }}
      showRightFor={logging ? search.at : search.open}
      left={{ label: "Week", showLabel: "Show the week", content: <WeekLeft {...props} /> }}
      middle={{
        // On a narrow screen the panels are pills. The middle one is "Program"
        // rather than the view's name, because the tabs under it already say
        // Day, Calendar or History, and "Day" twice read as a mistake.
        label: logging ? "Workout" : "Program",
        content: logging ? (
          <Middle {...props} />
        ) : (
          <>
            <PanelHeader className="@container">
                <UnderlineTabs
                  label="View"
                  value={view}
                  onValueChange={(next) => switchView(next as ProgramView)}
                  tabs={PROGRAM_VIEWS.map((entry) => ({ value: entry, label: PROGRAM_VIEW_LABELS[entry] }))}
                />
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {Tools ? <Tools {...props} /> : null}
                  {/* The day's menu and Start workout sit in the header on
                      every view, as Tyler drew Progress on 18 Oct 2026. Away
                      from the Day view they act on the weekday last picked,
                      today's by default. */}
                  <DayMenu {...props} />
                  {Create ? <Create {...props} /> : null}
                  <StartWorkoutButton {...props} />
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
