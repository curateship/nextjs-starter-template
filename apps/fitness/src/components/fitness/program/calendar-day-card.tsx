import * as React from "react"
import { Loader2Icon, PlayIcon, SkipForwardIcon, Undo2Icon } from "lucide-react"

import { PanelCard } from "@/components/fitness/panel-card"
import { moveCalendarDay, SCHEDULE_STATUS, skipCalendarDay } from "@/components/fitness/program/calendar-actions"
import { useCalendarVersion } from "@/components/fitness/program/calendar-version"
import { dateToDay, dayToDate } from "@/components/fitness/program/program-data"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { loadCalendarDay, type CalendarDay } from "@/lib/api/fitness/programs"
import { beginWorkout } from "@/lib/api/fitness/workouts"
import { formatDay, type Day } from "@/lib/fitness/dates"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The calendar date picked in the middle panel, at the top of the right panel:
 * what it is, and the buttons to start it, carry on with it, open the logged
 * workout, skip it on purpose, or move it to another day. Every workout opens inside the
 * program's dashboard.
 */
export function CalendarDayCard({
  scheduledId,
  canLog,
  onOpenWorkout,
}: {
  scheduledId: string
  /** False for a coach: only the person who trains logs a workout. */
  canLog: boolean
  onOpenWorkout: (workoutId: string) => void
}) {
  const version = useCalendarVersion()
  const [loaded, setLoaded] = React.useState<{ key: string; entry: CalendarDay } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [retryAt, setRetryAt] = React.useState(0)
  const [moveTo, setMoveTo] = React.useState<Day | null>(null)
  const [busy, setBusy] = React.useState<"start" | "move" | "skip" | null>(null)
  const moveId = React.useId()
  const key = `${scheduledId}:${version}`
  const [shownId, setShownId] = React.useState(scheduledId)
  if (shownId !== scheduledId) {
    setShownId(scheduledId)
    setMoveTo(null)
    setBusy(null)
  }

  React.useEffect(() => {
    let live = true
    loadCalendarDay(scheduledId).then(
      (entry) => {
        if (!live) return
        setLoaded({ key: `${scheduledId}:${version}`, entry })
        setError(null)
      },
      (failure: unknown) => {
        if (live) setError(getFitnessErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [scheduledId, version, retryAt])

  // Another day picked shows the loading row, never the last day's buttons.
  const entry = loaded && loaded.key.startsWith(`${scheduledId}:`) ? loaded.entry : null
  const fresh = loaded?.key === key
  const movable = entry ? entry.status === "planned" || entry.status === "missed" : false
  const skippable = entry ? movable && !entry.workoutId : false

  async function start(target: CalendarDay) {
    setBusy("start")
    try {
      const { id } = await beginWorkout({ from: "scheduled", scheduledId: target.id })
      onOpenWorkout(id)
    } catch (failure) {
      reportFitnessError(failure)
    } finally {
      setBusy(null)
    }
  }

  async function skip(target: CalendarDay, skipped: boolean) {
    setBusy("skip")
    await skipCalendarDay(target, skipped)
    setBusy(null)
  }

  async function move(target: CalendarDay) {
    if (!moveTo) {
      showErrorToast("Pick the day to move it to.")
      return
    }
    setBusy("move")
    const moved = await moveCalendarDay(target, moveTo)
    setBusy(null)
    if (moved) setMoveTo(null)
  }

  return (
    <PanelCard
      storageId="fitness-right-calendar-day"
      title={entry?.dayName ?? "Date"}
      meta={entry ? formatDay(entry.day) : undefined}
    >
      {error && !entry ? (
        <ErrorRow message={error} onRetry={() => setRetryAt(Date.now())} />
      ) : !entry ? (
        <LoadingRow label="Loading the day" />
      ) : (
        <>
          <dl className="grid grid-cols-[minmax(0,auto)_auto] justify-between gap-x-3 gap-y-2 text-[13px]">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{SCHEDULE_STATUS[entry.status].label}</dd>
            {entry.lightWeek ? (
              <>
                <dt className="text-muted-foreground">Week</dt>
                <dd>Light week</dd>
              </>
            ) : null}
            {entry.moved ? (
              <>
                <dt className="text-muted-foreground">Date</dt>
                <dd>Moved by hand</dd>
              </>
            ) : null}
          </dl>
          {entry.status === "paused" ? (
            <p className="text-sm text-muted-foreground">This day falls in a pause. Resume the program to train on it.</p>
          ) : null}
          {entry.status === "done" && entry.workoutId ? (
            <Button type="button" onClick={() => onOpenWorkout(entry.workoutId as string)}>
              Open workout
            </Button>
          ) : null}
          {movable && canLog ? (
            <Button type="button" disabled={busy !== null || !fresh} onClick={() => void start(entry)}>
              {busy === "start" ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
              {entry.workoutId ? "Carry on with this workout" : "Start this workout"}
            </Button>
          ) : null}
          {entry.status === "skipped" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Skipped on purpose. It doesn&apos;t count as missed or break the streak.
              </p>
              <Button type="button" variant="outline" disabled={busy !== null || !fresh} onClick={() => void skip(entry, false)}>
                {busy === "skip" ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />}
                Don&apos;t skip
              </Button>
            </>
          ) : null}
          {skippable ? (
            <Button type="button" variant="outline" disabled={busy !== null || !fresh} onClick={() => void skip(entry, true)}>
              {busy === "skip" ? <Loader2Icon className="animate-spin" /> : <SkipForwardIcon />}
              Skip this day
            </Button>
          ) : null}
          {movable || entry.status === "skipped" ? (
            <div className="grid gap-2">
              <Label htmlFor={moveId}>Move to another day</Label>
              <DatePicker
                id={moveId}
                value={moveTo ? dayToDate(moveTo) : undefined}
                onChange={(date) => setMoveTo(date ? dateToDay(date) : null)}
              />
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void move(entry)}>
                {busy === "move" ? <Loader2Icon className="animate-spin" /> : null}
                Move
              </Button>
            </div>
          ) : null}
        </>
      )}
    </PanelCard>
  )
}
