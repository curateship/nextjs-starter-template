import * as React from "react"
import { TrendingUpIcon } from "lucide-react"

import { PanelCard } from "@/components/fitness/panel-card"
import { BodyweightCard, NewWeighIn } from "@/components/fitness/progress/bodyweight-card"
import { LiftChart, type LiftMetric } from "@/components/fitness/progress/lift-chart"
import { ONE_REP_MAX_HINT, RecordsList } from "@/components/fitness/progress/records-list"
import { WeeklySets } from "@/components/fitness/progress/weekly-sets"
import { PanelBody, RightEmpty, RightHeader } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { ownRecords } from "@/components/fitness/dashboard/view-rows"
import { SegmentedChoice } from "@/components/fitness/segmented-choice"
import { Button } from "@/components/ui/button"
import type { LiftRecord } from "@/lib/api/fitness/progress"
import { formatDay } from "@/lib/fitness/dates"
import { formatWeight, formatWeightNumber } from "@/lib/fitness/weights"
import { useSelection } from "@/lib/hooks/use-selection"
import { cn } from "@/lib/utils"

/** The lift on the chart: the picked one, or the one trained most recently. */
function shownLift(records: readonly LiftRecord[], pick: string | undefined) {
  return records.find((record) => record.exerciseId === pick) ?? records[0] ?? null
}

const METRIC_LABELS: Record<LiftMetric, string> = {
  oneRepMax: "best one-rep max",
  heaviest: "heaviest lifted",
}

const METRIC_CHOICES: { value: LiftMetric; label: string }[] = [
  { value: "oneRepMax", label: "One-rep max" },
  { value: "heaviest", label: "Heaviest" },
]

/**
 * A grey card in the Progress view's middle panel, as Tyler drew them on
 * 18 Oct 2026: a heading with a muted note and its own buttons at the right,
 * then the body. It doesn't fold: the view is short, and everything on it is
 * worth seeing.
 */
function ProgressCard({
  title,
  meta,
  actions,
  flush = false,
  label,
  children,
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  /** The body runs to the card's edges, for a table. */
  flush?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={label} className="min-w-0 rounded-xl border bg-muted/40">
      <div className="flex min-h-14 flex-wrap items-center gap-2 px-4 py-3">
        <h3 className="min-w-40 flex-1 truncate text-[15px] font-semibold">
          {title}
          {meta ? <span className="font-normal text-muted-foreground"> · {meta}</span> : null}
        </h3>
        {actions}
      </div>
      <div className={flush ? "border-t" : "px-4 pb-4"}>{children}</div>
    </section>
  )
}

/**
 * Progress in the middle panel, as Tyler drew it on 18 Oct 2026: four figures
 * in one strip, the chart of one lift (or up to four compared), every lift's
 * records, and sets per muscle, each in a card. Clicking a lift puts it on
 * the chart and opens its numbers on the right. Compare shows a tick box on
 * each lift; ticking two to four draws them together.
 */
export function ProgressMiddle({ page, search, go }: ProgramViewProps) {
  const [metric, setMetric] = React.useState<LiftMetric>("oneRepMax")
  const [comparing, setComparing] = React.useState(false)
  const selection = useSelection()
  if (page.viewData.view !== "progress") return null
  const { weeklyGoal, weighIns, weeklySets, preferences, personId } = page.viewData.progress
  const records = ownRecords(page)
  const unit = preferences.unit
  const shown = shownLift(records, search.open)
  const ticked = records.map((record) => record.exerciseId).filter((id) => selection.selected.has(id))
  const compared = comparing && ticked.length > 1 ? ticked : null
  const chartIds = compared ?? (shown ? [shown.exerciseId] : [])
  const latest = weighIns[weighIns.length - 1]

  return (
    <PanelBody>
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border bg-muted/40 @container sm:grid-cols-4 [&>div]:grid [&>div]:content-start [&>div]:gap-1 [&>div]:p-4">
        <div className="border-r border-b sm:border-b-0">
          <dt className="text-[13px] text-muted-foreground">This week</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {weeklyGoal.thisWeek}
            <span className="text-base font-normal text-muted-foreground"> of {weeklyGoal.goal}</span>
          </dd>
          <dd className="text-[13px] text-muted-foreground">Workouts against your goal</dd>
        </div>
        <div className="border-b sm:border-r sm:border-b-0">
          <dt className="text-[13px] text-muted-foreground">Weeks in a row</dt>
          <dd className="text-2xl font-semibold tabular-nums">{weeklyGoal.streak}</dd>
          <dd className="text-[13px] text-muted-foreground">
            {weeklyGoal.streak === 0 ? "Hit the goal to start a run" : "Weeks the goal was hit"}
          </dd>
        </div>
        <div className="border-r">
          <dt className="text-[13px] text-muted-foreground">Lifts tracked</dt>
          <dd className="text-2xl font-semibold tabular-nums">{records.length}</dd>
          <dd className="text-[13px] text-muted-foreground">Each with its own records</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted-foreground">Bodyweight</dt>
          <dd className={cn("text-2xl font-semibold tabular-nums", !latest && "text-muted-foreground")}>
            {latest ? (
              <>
                {formatWeightNumber(latest.weightKg, unit)}
                <span className="text-base font-normal text-muted-foreground"> {unit}</span>
              </>
            ) : (
              "None yet"
            )}
          </dd>
          <dd className="text-[13px] text-muted-foreground">
            {latest ? `7-day average ${formatWeight(latest.averageKg, unit)}` : "Add one in the side panel"}
          </dd>
        </div>
      </dl>

      <ProgressCard
        label="Lift chart"
        title={compared ? "Lifts compared" : (shown?.name ?? "Lift")}
        meta={METRIC_LABELS[metric]}
        actions={
          records.length ? (
            <div className="flex items-center gap-2">
              <SegmentedChoice
                label="What the line shows"
                value={metric}
                options={METRIC_CHOICES}
                className="w-auto [&>button]:flex-none [&>button]:px-3"
                onChange={setMetric}
              />
              <Button
                type="button"
                variant="outline"
                aria-pressed={comparing}
                onClick={() => {
                  if (comparing) selection.clear()
                  setComparing(!comparing)
                }}
              >
                {comparing ? "Stop comparing" : "Compare"}
              </Button>
            </div>
          ) : null
        }
      >
        {comparing && !compared ? (
          <p className="pb-3 text-[13px] text-muted-foreground">
            Tick two to four lifts in Records below to draw them together.
          </p>
        ) : null}
        <LiftChart personId={personId} records={records} exerciseIds={chartIds} metric={metric} unit={unit} />
      </ProgressCard>

      <ProgressCard
        label="Records"
        title="Records"
        meta={`${records.length} ${records.length === 1 ? "lift" : "lifts"}`}
        flush
      >
        <RecordsList
          records={records}
          unit={unit}
          shownId={compared ? null : (shown?.exerciseId ?? null)}
          selection={comparing ? selection : null}
          onShow={(pick) => go({ open: pick }, { replace: true })}
        />
      </ProgressCard>

      <ProgressCard label="Sets per muscle" title="Sets per muscle" meta="last 8 weeks" flush>
        <WeeklySets weeks={weeklySets} />
      </ProgressCard>
    </PanelBody>
  )
}

/** Progress's tools in the middle header: New weigh-in, for the person who trains. */
export function ProgressTools({ page }: ProgramViewProps) {
  if (page.viewData.view !== "progress" || !page.program.mine) return null
  const { preferences } = page.viewData.progress
  return <NewWeighIn unit={preferences.unit} timeZone={preferences.timeZone} />
}

/**
 * Progress on the right, as Tyler drew it on 18 Oct 2026: the lift picked,
 * with its four best numbers in a grid, then bodyweight with its weigh-ins.
 * With no lift picked, the bodyweight stays under the line saying what to click.
 */
export function ProgressRight({ page, search, go }: ProgramViewProps) {
  if (page.viewData.view !== "progress") return null
  const { weighIns, preferences } = page.viewData.progress
  const records = ownRecords(page)
  const unit = preferences.unit
  const lift = records.find((record) => record.exerciseId === search.open) ?? null
  const bodyweight = <BodyweightCard weighIns={weighIns} unit={unit} canEdit={page.program.mine} />
  if (!lift) {
    return (
      <RightEmpty
        title="Lift"
        icon={TrendingUpIcon}
        line={records.length ? "Click a lift in Records to see its best numbers here." : "Finish a workout, then click a lift to see its records here."}
      >
        {bodyweight}
      </RightEmpty>
    )
  }
  return (
    <>
      <RightHeader
        title={lift.name}
        meta={`${lift.sessions} ${lift.sessions === 1 ? "session" : "sessions"} · last trained ${formatDay(lift.lastDay)}`}
        closeLabel="Close this lift"
        onClose={() => go({ open: undefined })}
      />
      <PanelBody>
          <PanelCard storageId="fitness-right-lift" title="Records" flush>
            <dl className="grid grid-cols-2 border-b [&>div]:grid [&>div]:gap-1 [&>div]:p-4 [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-r">
              <div>
                <dt className="text-[13px] text-muted-foreground">Heaviest lifted</dt>
                <dd className="text-2xl font-semibold tabular-nums">{formatWeight(lift.heaviestKg, unit)}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted-foreground">Best one-rep max</dt>
                <dd className="text-2xl font-semibold tabular-nums">{formatWeight(lift.oneRepMaxKg, unit)}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted-foreground">Most reps</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {lift.mostReps}
                  <span className="text-base font-normal text-muted-foreground">
                    {" "}
                    at {formatWeight(lift.mostRepsAtKg, unit)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted-foreground">Last trained</dt>
                <dd className="pt-1 text-lg font-semibold">{formatDay(lift.lastDay)}</dd>
              </div>
            </dl>
            <p className="p-4 text-[13px] text-muted-foreground">One-rep max: {ONE_REP_MAX_HINT.toLowerCase()}</p>
          </PanelCard>
        {bodyweight}
      </PanelBody>
    </>
  )
}
