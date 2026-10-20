import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CopyIcon, ExternalLinkIcon, HistoryIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { PanelCard } from "@/components/fitness/panel-card"
import { PanelBody, RightEmpty, RightHeader } from "@/components/fitness/dashboard/panel-parts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import type { HistoryRow } from "@/lib/api/fitness/workouts"
import { beginWorkout, loadWorkoutPage, removeWorkout, type WorkoutView } from "@/lib/api/fitness/workouts"
import { addDays, formatDay, todayIn } from "@/lib/fitness/dates"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight, formatWeightNumber, type WeightUnit } from "@/lib/fitness/weights"

/**
 * The History view's right panel. With nothing picked it shows how the last
 * four weeks went; with a workout picked it shows that workout's figures,
 * every lift with its sets, and Open, Do this again and Delete. A coach sees
 * the same figures without the three buttons that change things.
 */
export function WorkoutDetail({
  workoutId,
  rows,
  unit,
  timeZone,
  canChange,
  onClose,
  onOpen,
}: {
  workoutId: string | undefined
  rows: HistoryRow[]
  unit: WeightUnit
  /** The person's own zone, so "four weeks" ends on their today. */
  timeZone: string
  canChange: boolean
  onClose: () => void
  /** Opens a workout in the middle panel to log or change it. */
  onOpen: (workoutId: string) => void
}) {
  if (!workoutId) return <NothingPicked rows={rows} unit={unit} timeZone={timeZone} />
  return (
    <PickedWorkout
      key={workoutId}
      workoutId={workoutId}
      unit={unit}
      canChange={canChange}
      onClose={onClose}
      onOpen={onOpen}
    />
  )
}

function NothingPicked({ rows, unit, timeZone }: { rows: HistoryRow[]; unit: WeightUnit; timeZone: string }) {
  const finished = rows.filter((row) => row.finished)
  // The day four weeks back, worked out once when the panel opens.
  const [since] = React.useState(() => addDays(todayIn(timeZone), -27))
  const recent = finished.filter((row) => row.day >= since)
  return (
    <RightEmpty title="Workout" icon={HistoryIcon} line="Click a workout to see its lifts and sets here.">
        <PanelCard storageId="fitness-history-totals" title="Last four weeks" flush>
          <dl className="grid grid-cols-2 [&>div]:grid [&>div]:gap-1 [&>div]:p-4 [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-r">
            <div>
              <dt className="text-[13px] text-muted-foreground">Workouts finished</dt>
              <dd className="text-2xl font-semibold tabular-nums">{recent.length}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-foreground">Sets done</dt>
              <dd className="text-2xl font-semibold tabular-nums">{recent.reduce((sum, row) => sum + row.setsDone, 0)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-foreground">Total lifted</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {formatWeightNumber(recent.reduce((sum, row) => sum + row.totalKg, 0), unit)}
                <span className="ml-1 text-base font-normal text-muted-foreground">{unit}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-foreground">All time</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {finished.length}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  {finished.length === 1 ? "workout" : "workouts"}
                </span>
              </dd>
            </div>
          </dl>
        </PanelCard>
    </RightEmpty>
  )
}

function PickedWorkout({
  workoutId,
  unit,
  canChange,
  onClose,
  onOpen,
}: {
  workoutId: string
  unit: WeightUnit
  canChange: boolean
  onClose: () => void
  onOpen: (workoutId: string) => void
}) {
  const router = useRouter()
  const [workout, setWorkout] = React.useState<WorkoutView | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)

  React.useEffect(() => {
    let current = true
    loadWorkoutPage(workoutId).then(
      (page) => current && setWorkout(page.workout),
      (error) => current && setFailed(getFitnessErrorMessage(error))
    )
    return () => {
      current = false
    }
  }, [workoutId])

  async function again() {
    setBusy(true)
    try {
      const { id } = await beginWorkout({ from: "repeat", workoutId })
      onOpen(id)
    } catch (error) {
      reportFitnessError(error)
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await removeWorkout(workoutId)
      toast.success("Workout deleted.")
      setConfirming(false)
      onClose()
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
      setBusy(false)
    }
  }

  const minutes =
    workout?.finishedAt != null
      ? Math.max(1, Math.round((Date.parse(workout.finishedAt) - Date.parse(workout.startedAt)) / 60000))
      : null
  const working = workout?.exercises.flatMap((exercise) =>
    exercise.sets.filter((set) => set.kind === "working" && set.done)
  )
  const total = (working ?? []).reduce(
    (sum, set) => sum + ((set.weightKg ?? 0) + (set.bodyweightKg ?? 0)) * (set.reps ?? 0),
    0
  )

  return (
    <>
      <RightHeader
        title={workout?.name ?? "Workout"}
        meta={workout ? formatDay(workout.day) : undefined}
        closeLabel="Close the workout"
        onClose={onClose}
      />
      <PanelBody>
        {failed ? (
          <p className="text-sm text-muted-foreground">{failed}</p>
        ) : !workout ? (
          <LoadingRow label="Loading the workout" />
        ) : (
          <>
            <PanelCard
              storageId="fitness-history-summary"
              title="Summary"
              badge={workout.finishedAt ? null : <Badge variant="outline">Unfinished</Badge>}
            >
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-[13px]">
                <dt className="text-muted-foreground">Day</dt>
                <dd>{formatDay(workout.day)}</dd>
                <dt className="text-muted-foreground">Minutes</dt>
                <dd>{minutes ?? "Not finished"}</dd>
                <dt className="text-muted-foreground">Sets done</dt>
                <dd>{working?.length ?? 0}</dd>
                <dt className="text-muted-foreground">Total lifted</dt>
                <dd>{formatWeight(total, unit)}</dd>
                <dt className="text-muted-foreground">How hard</dt>
                <dd>{workout.effort === null ? "Not given" : `${workout.effort} of 10`}</dd>
              </dl>
              {workout.note ? <p className="text-sm whitespace-pre-wrap">{workout.note}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={canChange ? "outline" : "default"} size="sm" onClick={() => onOpen(workoutId)}>
                  <ExternalLinkIcon className="size-4" />
                  Open
                </Button>
                {canChange ? (
                  <>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void again()}>
                      {busy ? <Loader2Icon className="size-4 animate-spin" /> : <CopyIcon className="size-4" />}
                      Do this again
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
                      <Trash2Icon className="size-4" />
                      Delete
                    </Button>
                  </>
                ) : null}
              </div>
            </PanelCard>
            <PanelCard
              storageId="fitness-history-lifts"
              title="Lifts"
              meta={workout.exercises.length || undefined}
            >
              {workout.exercises.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lifts in this workout.</p>
              ) : (
                <ul className="grid gap-3">
                  {workout.exercises.map((exercise) => {
                    const sets = exercise.sets.filter((set) => set.kind === "working" && set.done)
                    return (
                      <li key={exercise.position} className="grid gap-0.5">
                        <span className="text-sm font-medium">{exercise.name}</span>
                        <span className="text-[13px] text-muted-foreground">
                          {sets.length === 0
                            ? "No sets done"
                            : sets
                                .map(
                                  (set) =>
                                    `${formatWeightNumber((set.weightKg ?? 0) + (set.bodyweightKg ?? 0), unit)} x ${set.reps ?? 0}`
                                )
                                .join(", ")}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {workout.exercises.some((exercise) => exercise.isBodyweight) ? (
                <p className="text-xs text-muted-foreground">Bodyweight lifts show your bodyweight plus what you added.</p>
              ) : null}
            </PanelCard>
          </>
        )}
      </PanelBody>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => (open ? undefined : setConfirming(false))}
        title="Delete this workout?"
        description="Its sets leave your history, records and charts. A day it was on goes back to planned on the calendar."
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}
