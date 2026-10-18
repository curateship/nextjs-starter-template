import * as React from "react"
import { LineChartIcon, SquareMousePointerIcon } from "lucide-react"

import { PanelCard } from "@/components/fitness/panel-card"
import { BodyweightCard } from "@/components/fitness/progress/bodyweight-card"
import { LiftChart } from "@/components/fitness/progress/lift-chart"
import { MOST_COMPARED, ONE_REP_MAX_HINT, RecordsList } from "@/components/fitness/progress/records-list"
import { WeeklySets } from "@/components/fitness/progress/weekly-sets"
import { PanelBody, PanelHeader, PanelToolbar } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { LiftRecord } from "@/lib/api/fitness/progress"
import { formatDay } from "@/lib/fitness/dates"
import { formatWeight } from "@/lib/fitness/weights"
import { useSelection } from "@/lib/hooks/use-selection"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The person's lifts of this program's routine type only: a program never lists another type's lifts. */
function ownRecords(page: ProgramViewProps["page"]) {
  if (page.viewData.view !== "progress") return []
  return page.viewData.progress.records.filter((record) => record.routineType === page.program.routineType)
}

/** The lift on the chart: the picked one, or the one trained most recently. */
function shownLift(records: readonly LiftRecord[], pick: string | undefined) {
  return records.find((record) => record.exerciseId === pick) ?? records[0] ?? null
}

/**
 * Progress in the middle panel: four tiles, the chart of one lift (or up to
 * four compared), every lift's records, and sets per muscle. Clicking a lift
 * puts it on the chart and opens its numbers on the right.
 */
export function ProgressMiddle({ page, search, go }: ProgramViewProps) {
  const [query, setQuery] = React.useState("")
  const [compared, setCompared] = React.useState<string[]>([])
  const selection = useSelection()
  if (page.viewData.view !== "progress") return null
  const { weeklyGoal, weighIns, weeklySets, preferences, personId } = page.viewData.progress
  const records = ownRecords(page)
  const unit = preferences.unit
  const shown = shownLift(records, search.pick)
  const chartIds = compared.length > 1 ? compared : shown ? [shown.exerciseId] : []
  const latest = weighIns[weighIns.length - 1]

  function compare() {
    const ids = records.map((record) => record.exerciseId).filter((id) => selection.selected.has(id))
    if (ids.length < 2) {
      showErrorToast("Tick at least two lifts to compare them.")
      return
    }
    if (ids.length > MOST_COMPARED) {
      showErrorToast(`Compare at most ${MOST_COMPARED} lifts at once, so each keeps a colour of its own.`)
      return
    }
    setCompared(ids)
  }

  return (
    <>
      <PanelToolbar>
        <DashboardToolbarSearch
          aria-label="Search lifts"
          placeholder="Search lifts"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {compared.length > 1 ? (
          <DashboardToolbarButton type="button" variant="outline" onClick={() => setCompared([])}>
            Stop comparing
          </DashboardToolbarButton>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <DashboardToolbarButton type="button" variant="outline" onClick={compare}>
                <LineChartIcon />
                Compare
              </DashboardToolbarButton>
            </TooltipTrigger>
            <TooltipContent>Tick two to four lifts below, then compare their lines</TooltipContent>
          </Tooltip>
        )}
      </PanelToolbar>
      <PanelBody padded={false}>
        <div className="grid grid-cols-2 gap-2 border-b p-3 @container">
          <Tile label="This week" value={`${weeklyGoal.thisWeek} of ${weeklyGoal.goal}`} note="Workouts against your goal" />
          <Tile
            label="Weeks in a row"
            value={String(weeklyGoal.streak)}
            note={weeklyGoal.streak === 0 ? "Hit the goal to start a run" : "Weeks the goal was hit"}
          />
          <Tile label="Lifts tracked" value={String(records.length)} note="Each with its own records" />
          <Tile
            label="Bodyweight"
            value={latest ? formatWeight(latest.weightKg, unit) : "None yet"}
            note={latest ? `7-day average ${formatWeight(latest.averageKg, unit)}` : "Add one under Bodyweight"}
          />
        </div>
        <LiftChart personId={personId} records={records} exerciseIds={chartIds} unit={unit} />
        <RecordsList
          records={records}
          query={query}
          unit={unit}
          shownId={compared.length > 1 ? null : (shown?.exerciseId ?? null)}
          selection={selection}
          onShow={(pick) => {
            setCompared([])
            go({ pick }, { replace: true })
          }}
        />
        <WeeklySets weeks={weeklySets} />
      </PanelBody>
    </>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-medium tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

/**
 * Progress on the right: the lift on the chart, with its best numbers in
 * words, then bodyweight with its weigh-ins.
 */
export function ProgressRight({ page, search }: ProgramViewProps) {
  if (page.viewData.view !== "progress") return null
  const { weighIns, preferences } = page.viewData.progress
  const records = ownRecords(page)
  const unit = preferences.unit
  const lift = shownLift(records, search.pick)
  return (
    <>
      <PanelHeader>
        <h2 className="min-w-0 truncate text-sm font-semibold">{lift ? lift.name : "Progress"}</h2>
      </PanelHeader>
      <PanelBody>
        {lift ? (
          <PanelCard storageId="fitness-right-lift" title="Records" meta={`${lift.sessions} ${lift.sessions === 1 ? "session" : "sessions"}`}>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-[13px] [&_dd]:text-right [&_dd]:tabular-nums">
              <dt className="text-muted-foreground">Heaviest lifted</dt>
              <dd>{formatWeight(lift.heaviestKg, unit)}</dd>
              <dt className="text-muted-foreground">Best one-rep max</dt>
              <dd>{formatWeight(lift.oneRepMaxKg, unit)}</dd>
              <dt className="text-muted-foreground">Most reps</dt>
              <dd>
                {lift.mostReps} at {formatWeight(lift.mostRepsAtKg, unit)}
              </dd>
              <dt className="text-muted-foreground">Last trained</dt>
              <dd>{formatDay(lift.lastDay)}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">One-rep max: {ONE_REP_MAX_HINT.toLowerCase()}</p>
          </PanelCard>
        ) : (
          <div className="grid justify-items-center gap-2 p-6 text-center">
            <SquareMousePointerIcon className="size-5 text-muted-foreground" aria-hidden />
            <p className="max-w-56 text-sm text-muted-foreground">
              Finish a workout, then click a lift to see its records here.
            </p>
          </div>
        )}
        <BodyweightCard
          weighIns={weighIns}
          unit={unit}
          timeZone={preferences.timeZone}
          canEdit={page.program.mine}
        />
      </PanelBody>
    </>
  )
}
