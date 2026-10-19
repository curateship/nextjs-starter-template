import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  CloudOffIcon,
  CopyIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PanelBody, PanelEmpty, PanelHeader } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { ExercisePicker } from "@/components/fitness/exercise-picker"
import { PanelCard } from "@/components/fitness/panel-card"
import { HurtsDialog, SwapDialog, type SwapTarget } from "@/components/fitness/workout/exercise-dialogs"
import { NoteField } from "@/components/fitness/workout/fields"
import { EffortPicker, FinishDialog, SummaryDialog } from "@/components/fitness/workout/finish-dialogs"
import {
  applyLive,
  currentExercise,
  currentSet,
  live,
  pickFor,
  useLiveState,
} from "@/components/fitness/workout/live-workout"
import { browserStorage, forgetQueue } from "@/components/fitness/workout/offline-queue"
import { RestTimer } from "@/components/fitness/workout/rest-timer"
import { SetGrid } from "@/components/fitness/workout/set-grid"
import { useSetSync } from "@/components/fitness/workout/use-set-sync"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  beginWorkout,
  changeWorkoutExercise,
  finishTheWorkout,
  removeWorkout,
  saveWorkoutDetails,
  type FinishSummary,
  type SetView,
  type WorkoutExercise,
  type WorkoutView,
} from "@/lib/api/fitness/workouts"
import { formatDay } from "@/lib/fitness/dates"
import { platesFor } from "@/lib/fitness/plates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight, formatWeightNumber } from "@/lib/fitness/weights"

/**
 * The workout being logged, inside its program's dashboard (Tyler, 18 Oct
 * 2026: "Inside the program dashboard"). Pressing Start swaps the middle panel
 * to the live workout; the right panel shows the exercise being done. On a
 * phone the middle panel is its own tab, full width.
 *
 * Every tick and number saves the moment it is made, so closing the tab
 * halfway loses nothing. With no signal, changes wait on the phone and go when
 * it is back (`use-set-sync.ts`). A finished workout opens the same way, with
 * its effort and note editable and no Finish button.
 */

type WorkoutData = NonNullable<ProgramViewProps["page"]["workout"]>

/** Runs of exercises that share a superset group, kept in order. */
function groupExercises(exercises: readonly WorkoutExercise[]) {
  const groups: WorkoutExercise[][] = []
  for (const exercise of exercises) {
    const last = groups[groups.length - 1]
    if (last && exercise.groupKey && last[0].groupKey === exercise.groupKey) last.push(exercise)
    else groups.push([exercise])
  }
  return groups
}

/** A rest countdown starting now. Kept out of the component so it reads the clock only when pressed. */
function startRest(seconds: number, exerciseName: string) {
  return { endsAt: Date.now() + seconds * 1000, seconds, exerciseName }
}

/** The live workout: this tab's changes laid over the server's copy. */
function useWorkout(data: WorkoutData) {
  const state = useLiveState(data.workout.id)
  const workout = React.useMemo(() => applyLive(data.workout, state), [data.workout, state])
  return { workout, timer: state.timer }
}

export function WorkoutMiddle({ page, search, go }: ProgramViewProps) {
  if (!page.workout) return <PanelEmpty>That workout couldn't be opened.</PanelEmpty>
  return <LiveMiddle key={page.workout.workout.id} data={page.workout} pick={search.pick} go={go} />
}

function LiveMiddle({ data, pick, go }: { data: WorkoutData; pick: string | undefined; go: ProgramViewProps["go"] }) {
  const router = useRouter()
  const { workout, timer } = useWorkout(data)
  const { send, waiting } = useSetSync(workout.id)
  const finished = workout.finishedAt !== null
  const canChange = data.canChange
  const unit = data.preferences.unit
  const current = currentExercise(workout, pick)
  const [picking, setPicking] = React.useState(false)
  const [finishOpen, setFinishOpen] = React.useState(false)
  const [finishing, setFinishing] = React.useState(false)
  const [summary, setSummary] = React.useState<FinishSummary | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function saveSetChange(set: SetView, change: Partial<SetView>) {
    live.patchSet(workout.id, set.id, change)
    const { weightKg, reps, done, note } = change
    const result = await send({ kind: "saveSet", setId: set.id, change: { weightKg, reps, done, note } })
    if (result === "refused") await router.invalidate()
  }

  /**
   * A weight typed on one set fills the open working sets after it that have
   * no weight yet, the way a gym app carries the weight down, so a lift added
   * mid-workout needs its weight typed once.
   */
  function saveWeight(exercise: WorkoutExercise, set: SetView, weightKg: number | null) {
    void saveSetChange(set, { weightKg })
    if (weightKg === null || set.kind !== "working") return
    const after = exercise.sets.slice(exercise.sets.findIndex((one) => one.id === set.id) + 1)
    for (const later of after) {
      if (later.kind === "working" && !later.done && later.weightKg === null && later.targetWeightKg === null) {
        void saveSetChange(later, { weightKg })
      }
    }
  }

  function toggleDone(exercise: WorkoutExercise, set: SetView) {
    if (set.done) {
      void saveSetChange(set, { done: false })
      return
    }
    // A set left blank takes the numbers of the set above it, the way gym apps do.
    const above = exercise.sets[exercise.sets.findIndex((one) => one.id === set.id) - 1]
    const sameKind = above && above.kind === set.kind ? above : null
    void saveSetChange(set, {
      done: true,
      reps: set.reps ?? set.targetReps ?? sameKind?.reps ?? null,
      weightKg: set.weightKg ?? set.targetWeightKg ?? sameKind?.weightKg ?? null,
    })
    if (finished || set.kind !== "working") return
    // A superset rests only after its last lift.
    const index = workout.exercises.findIndex((one) => one.position === exercise.position)
    const next = workout.exercises[index + 1]
    const endsGroup = !exercise.groupKey || next?.groupKey !== exercise.groupKey
    if (endsGroup && exercise.restSeconds > 0) {
      live.setTimer(workout.id, startRest(exercise.restSeconds, exercise.name))
    }
  }

  async function finish(input: { effort: number | null; note: string }) {
    setFinishing(true)
    try {
      const result = await finishTheWorkout({ workoutId: workout.id, ...input })
      forgetQueue(browserStorage(), workout.id)
      live.setTimer(workout.id, null)
      setFinishOpen(false)
      setSummary(result)
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setFinishing(false)
    }
  }

  async function repeat() {
    setBusy(true)
    try {
      const { id } = await beginWorkout({ from: "repeat", workoutId: workout.id })
      go({ workout: id, pick: undefined })
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  async function deleteIt() {
    setBusy(true)
    try {
      await removeWorkout(workout.id)
      forgetQueue(browserStorage(), workout.id)
      live.clear(workout.id)
      toast.success("Workout deleted.")
      setDeleting(false)
      go({ workout: undefined, pick: undefined, view: "history" })
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  // Tyler, 18 Oct 2026: a workout left with no set ticked is thrown away, so an
  // abandoned Start never sits in History as an empty "Unfinished" row.
  const ticked = workout.exercises.some((exercise) => exercise.sets.some((set) => set.done))
  const throwsAway = !finished && !ticked && canChange

  async function leave() {
    if (!throwsAway) {
      go({ workout: undefined, pick: undefined })
      return
    }
    setBusy(true)
    try {
      await removeWorkout(workout.id)
      forgetQueue(browserStorage(), workout.id)
      live.clear(workout.id)
      toast.success("Nothing was ticked, so the workout was thrown away.")
      go({ workout: undefined, pick: undefined })
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  const openSets = workout.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => set.kind === "working" && !set.done).length,
    0
  )

  return (
    <>
      <PanelHeader>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Back to the week"
              disabled={busy}
              onClick={() => void leave()}
            >
              <ArrowLeftIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {finished || !canChange
              ? "Back to the week"
              : throwsAway
                ? "Back to the week. Nothing is ticked, so this workout is thrown away."
                : "Back to the week. The workout stays open."}
          </TooltipContent>
        </Tooltip>
        {canChange ? (
          <WorkoutName
            value={workout.name}
            onCommit={(name) => void saveWorkoutDetails({ workoutId: workout.id, name }).then(() => router.invalidate(), reportFitnessError)}
          />
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{workout.name}</h2>
        )}
        {canChange ? (
          finished ? (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void repeat()}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <CopyIcon className="size-4" />}
                <span className="hidden sm:inline">Do this again</span>
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Delete this workout" onClick={() => setDeleting(true)}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <Button type="button" onClick={() => setFinishOpen(true)}>
              Finish
            </Button>
          )
        ) : null}
      </PanelHeader>
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2 text-xs text-muted-foreground">
        <span>{formatDay(workout.day)}</span>
        <span aria-hidden="true">·</span>
        <Elapsed startedAt={workout.startedAt} finishedAt={workout.finishedAt} />
        {workout.lightWeek ? <Badge variant="secondary">Light week</Badge> : null}
        {finished ? <Badge variant="outline">Finished</Badge> : null}
        {canChange ? null : <span className="basis-full">You're reading a client's workout. Only they can log or change it.</span>}
        {waiting > 0 ? (
          <span className="flex basis-full items-center gap-1.5" role="status">
            <CloudOffIcon className="size-3.5 shrink-0" aria-hidden="true" />
            Saved on this phone. Will send when you're back online.
          </span>
        ) : null}
      </div>
      <PanelBody padded={false}>
        {/* A coach reads every set here, but nothing in it answers a press. */}
        <fieldset disabled={!canChange} className="contents">
          {workout.exercises.length === 0 ? (
            <PanelEmpty>Nothing here yet. Add your first exercise.</PanelEmpty>
          ) : (
            <div className="divide-y">
              {groupExercises(workout.exercises).map((group) => (
                <div key={group.map((exercise) => exercise.position).join("-")}>
                  {group.length > 1 ? (
                    <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">
                      Superset: one set of each in turn, then rest
                    </p>
                  ) : null}
                  <div className={group.length > 1 ? "ml-3 border-l" : undefined}>
                    {group.map((exercise) => (
                      <SetGrid
                        key={exercise.position}
                        exercise={exercise}
                        unit={unit}
                        picked={current?.position === exercise.position}
                        canChange={canChange}
                        onPick={() => go({ pick: pickFor(exercise.position) }, { replace: true })}
                        onSetChange={(set, change) =>
                          "weightKg" in change ? saveWeight(exercise, set, change.weightKg ?? null) : void saveSetChange(set, change)
                        }
                        onToggleDone={(set) => toggleDone(exercise, set)}
                        onAddSet={() => addSet(workout, exercise, send)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {canChange ? (
            <div className="p-3">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setPicking(true)}>
                <PlusIcon className="size-4" />
                Add exercise
              </Button>
            </div>
          ) : null}
        </fieldset>
      </PanelBody>
      <RestTimer
        timer={timer}
        onAdd={(seconds) =>
          live.setTimer(workout.id, (running) =>
            running
              ? { ...running, endsAt: Math.max(running.endsAt, Date.now()) + seconds * 1000, seconds: running.seconds + seconds }
              : running
          )
        }
        onSkip={() => live.setTimer(workout.id, null)}
      />

      <ExercisePicker
        open={picking}
        onOpenChange={setPicking}
        exercises={data.exercises}
        onPick={(exercise) =>
          void changeWorkoutExercise({ action: "add", workoutId: workout.id, exerciseId: exercise.id }).then(async () => {
            toast.success(`${exercise.name} added.`)
            await router.invalidate()
          }, reportFitnessError)
        }
      />
      <FinishDialog
        open={finishOpen}
        initialNote={workout.note}
        openSets={openSets}
        busy={finishing}
        onClose={() => setFinishOpen(false)}
        onFinish={(input) => void finish(input)}
      />
      <SummaryDialog
        summary={summary}
        unit={unit}
        onDone={(to) => {
          const workoutId = workout.id
          setSummary(null)
          live.clear(workoutId)
          go(
            to === "history"
              ? { workout: undefined, view: "history", pick: workoutId }
              : { workout: undefined, view: "day", pick: undefined }
          )
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this workout?"
        description="Its sets leave your history, records and charts. If it was on the calendar, that day goes back to planned."
        confirmLabel="Delete workout"
        destructive
        loading={busy}
        onConfirm={() => void deleteIt()}
      />
    </>
  )
}

/** Adds a set to a lift, copying the last set's weight. Its id is made here, so a resend saves it once. */
function addSet(
  workout: WorkoutView,
  exercise: WorkoutExercise,
  send: ReturnType<typeof useSetSync>["send"]
) {
  const last = exercise.sets[exercise.sets.length - 1]
  if (!last) return
  const id = crypto.randomUUID()
  live.addSet(workout.id, exercise.position, {
    ...last,
    id,
    setNumber: last.setNumber + 1,
    kind: "working",
    weightKg: last.weightKg ?? last.targetWeightKg,
    reps: null,
    done: false,
    note: "",
  })
  void send({ kind: "addSet", workoutId: workout.id, position: exercise.position, id })
}

export function WorkoutRight({ page, search, go }: ProgramViewProps) {
  if (!page.workout) return null
  return <LiveRight key={page.workout.workout.id} data={page.workout} pick={search.pick} go={go} />
}

/**
 * The exercise being done, on the right: the plates for its next set, its
 * warm-ups, what was lifted last time, a note, and what can be done to it.
 * It follows the lift picked in the middle, or else the first with a set
 * still to do.
 */
function LiveRight({ data, pick, go }: { data: WorkoutData; pick: string | undefined; go: ProgramViewProps["go"] }) {
  const router = useRouter()
  const { workout } = useWorkout(data)
  const { send } = useSetSync(workout.id)
  const [swapTarget, setSwapTarget] = React.useState<SwapTarget | null>(null)
  const [hurtsTarget, setHurtsTarget] = React.useState<SwapTarget | null>(null)
  const [removing, setRemoving] = React.useState<WorkoutExercise | null>(null)
  const [busy, setBusy] = React.useState(false)
  const exercise = currentExercise(workout, pick)
  const finished = workout.finishedAt !== null
  const canChange = data.canChange
  const unit = data.preferences.unit
  const noteId = React.useId()

  const refresh = () => router.invalidate()

  if (!exercise) {
    return (
      <>
        <PanelHeader>
          <h2 className="text-sm font-semibold">Exercise</h2>
        </PanelHeader>
        <PanelBody>
          <p className="text-sm text-muted-foreground">Add an exercise in the middle to start logging.</p>
          {finished && canChange ? <HowItWent workout={workout} onSaved={refresh} /> : null}
        </PanelBody>
      </>
    )
  }

  const library = data.exercises.find((entry) => entry.id === exercise.exerciseId)
  const barbell = !exercise.isBodyweight && (library?.equipment.includes("barbell") ?? false)
  const set = currentSet(exercise.sets)
  const setLabel = set ? (set.kind === "warmup" ? "the warm-up" : `set ${set.setNumber - exercise.sets.filter((one) => one.kind === "warmup").length}`) : ""
  const weight = set ? (set.weightKg ?? set.targetWeightKg) : null
  const plates = barbell && weight !== null && weight > 0 ? platesFor(weight, data.preferences.barKg, data.preferences.platesKg) : null
  const warmups = exercise.sets.filter((one) => one.kind === "warmup")
  const index = workout.exercises.findIndex((one) => one.position === exercise.position)
  const target: SwapTarget = {
    position: exercise.position,
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    fromPlan: exercise.dayExerciseId !== null,
  }

  async function removeExercise() {
    if (!removing) return
    setBusy(true)
    try {
      await changeWorkoutExercise({ action: "remove", workoutId: workout.id, position: removing.position })
      setRemoving(null)
      go({ pick: undefined }, { replace: true })
      await refresh()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  function removeLastSet() {
    const last = exercise?.sets[exercise.sets.length - 1]
    if (!exercise || !last || exercise.sets.length <= 1) return
    live.removeSet(workout.id, last.id)
    void send({ kind: "removeSet", setId: last.id })
  }

  return (
    <>
      <PanelHeader>
        <div className="grid min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{exercise.name}</h2>
          <span className="text-xs text-muted-foreground">
            Exercise {index + 1} of {workout.exercises.length}
            {library?.avoided ? " · On your pain list" : ""}
          </span>
        </div>
      </PanelHeader>
      <PanelBody>
        {exercise.isBodyweight ? (
          <PanelCard storageId="fitness-live-bodyweight" title="Bodyweight">
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-[13px] [&_dd]:text-right [&_dd]:tabular-nums">
              <dt className="text-muted-foreground">Your bodyweight</dt>
              <dd>{set?.bodyweightKg != null ? formatWeight(set.bodyweightKg, unit) : "Not given"}</dd>
              <dt className="text-muted-foreground">Added</dt>
              <dd>{formatWeight(weight ?? 0, unit)}</dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd>{set?.bodyweightKg != null ? formatWeight(set.bodyweightKg + (weight ?? 0), unit) : "Add a weigh-in"}</dd>
            </dl>
          </PanelCard>
        ) : barbell ? (
          <PanelCard storageId="fitness-live-plates" title="Plates" meta={set ? `for ${setLabel}` : undefined}>
            {plates && weight !== null ? (
              <div className="grid gap-1">
                <p className="text-lg font-medium tabular-nums">
                  {plates.perSide.length
                    ? `${plates.perSide.map((plate) => formatWeightNumber(plate, unit)).join(" + ")} a side`
                    : "Empty bar"}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {plates.short
                    ? `Can't make exactly ${formatWeight(weight, unit)}. Closest: ${formatWeight(plates.loadedKg, unit)}.`
                    : `${formatWeight(weight, unit)} on a ${formatWeight(data.preferences.barKg, unit)} bar.`}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">Type a weight on the set to see its plates.</p>
            )}
          </PanelCard>
        ) : null}

        <PanelCard storageId="fitness-live-warmups" title="Warm-ups" meta={warmups.length || undefined}>
          {warmups.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {exercise.isBodyweight || !barbell
                ? "No warm-up sets for this lift."
                : data.preferences.warmupsOn
                  ? "No warm-up sets for this lift in this workout. Lifts from the program's week get them when the workout starts."
                  : "Warm-ups are off. The site admin turns them on in Settings, App settings."}
            </p>
          ) : (
            <ul className="grid gap-1 text-[13px]">
              {warmups.map((warm) => (
                <li key={warm.id} className="flex justify-between gap-3 tabular-nums">
                  <span>
                    {formatWeight(warm.weightKg ?? warm.targetWeightKg ?? 0, unit)} x {warm.reps ?? warm.targetReps ?? 0}
                  </span>
                  <span className="text-muted-foreground">{warm.done ? "Done" : "To do"}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard
          storageId="fitness-live-last"
          title="Last time"
          meta={exercise.last ? formatDay(exercise.last.day) : undefined}
        >
          {exercise.last ? (
            <p className="text-[13px] tabular-nums">
              {exercise.last.sets
                .map((one) => `${one.weightKg === null ? "0" : formatWeightNumber(one.weightKg, unit)} x ${one.reps ?? 0}`)
                .join(", ")}{" "}
              <span className="text-muted-foreground">{unit}</span>
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">First time logging this lift.</p>
          )}
        </PanelCard>

        {set && canChange ? (
          <PanelCard storageId="fitness-live-note" title="Note" meta={setLabel || undefined}>
            <div className="grid gap-2">
              <Label htmlFor={noteId} className="sr-only">
                Note on {setLabel}
              </Label>
              <NoteField
                id={noteId}
                label={`Note on ${setLabel}`}
                value={set.note}
                onCommit={(note) => {
                  live.patchSet(workout.id, set.id, { note })
                  void send({ kind: "saveSet", setId: set.id, change: { note } })
                }}
              />
            </div>
          </PanelCard>
        ) : null}

        {canChange ? (
          <PanelCard storageId="fitness-live-actions" title="Change this lift">
            <div className="grid gap-2">
              <Button type="button" variant="outline" className="justify-start" onClick={() => addSet(workout, exercise, send)}>
                <PlusIcon className="size-4" />
                Add a set
              </Button>
              <Button type="button" variant="outline" className="justify-start" onClick={removeLastSet}>
                <MinusIcon className="size-4" />
                Remove the last set
              </Button>
              <Button type="button" variant="outline" className="justify-start" onClick={() => setSwapTarget(target)}>
                <ArrowLeftRightIcon className="size-4" />
                Swap for another lift
              </Button>
              <Button type="button" variant="outline" className="justify-start" onClick={() => setHurtsTarget(target)}>
                <TriangleAlertIcon className="size-4" />
                This hurts
              </Button>
              <Button type="button" variant="ghost" className="justify-start" onClick={() => setRemoving(exercise)}>
                <Trash2Icon className="size-4" />
                Remove from this workout
              </Button>
            </div>
          </PanelCard>
        ) : null}

        {finished && canChange ? <HowItWent workout={workout} onSaved={refresh} /> : null}
      </PanelBody>

      <SwapDialog
        workoutId={workout.id}
        target={swapTarget}
        equipment={data.equipment}
        onClose={() => setSwapTarget(null)}
        onSwapped={async () => {
          await refresh()
        }}
      />
      <HurtsDialog
        target={hurtsTarget}
        onClose={() => setHurtsTarget(null)}
        onSaved={(saved) => {
          setHurtsTarget(null)
          void refresh()
          setSwapTarget(saved)
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title={`Remove ${removing?.name ?? "this exercise"}?`}
        description="Its sets in this workout go with it. The program's week stays as it is."
        confirmLabel="Remove exercise"
        destructive
        loading={busy}
        onConfirm={() => void removeExercise()}
      />
    </>
  )
}

/** The workout's name, changed in place and saved when the field is left. */
function WorkoutName({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = React.useState(value)
  const [lastValue, setLastValue] = React.useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  return (
    <Input
      aria-label="Workout name"
      maxLength={80}
      className="min-w-0 flex-1 font-medium"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const name = draft.trim()
        if (!name) setDraft(value)
        else if (name !== value) onCommit(name)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
    />
  )
}

/**
 * "32 min" since the start, ticking every half minute, or how long a finished
 * workout took. Drawn only once the page is running in the browser, so the
 * server's clock never disagrees with the phone's.
 */
function Elapsed({ startedAt, finishedAt }: { startedAt: string; finishedAt: string | null }) {
  const [now, setNow] = React.useState<number | null>(null)
  React.useEffect(() => {
    const update = () => setNow(Date.now())
    const first = window.setTimeout(update, 0)
    const tick = finishedAt ? null : window.setInterval(update, 30_000)
    return () => {
      window.clearTimeout(first)
      if (tick !== null) window.clearInterval(tick)
    }
  }, [finishedAt])
  if (now === null) return null
  const end = finishedAt ? new Date(finishedAt).getTime() : now
  const minutes = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60000))
  const text = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
  return <span>{finishedAt ? `Took ${text}` : text}</span>
}

/** A finished workout's effort and note, each saved as it changes. */
function HowItWent({ workout, onSaved }: { workout: WorkoutView; onSaved: () => Promise<void> }) {
  const effortLabelId = React.useId()
  const noteId = React.useId()

  function save(change: { effort?: number | null; note?: string }) {
    void saveWorkoutDetails({ workoutId: workout.id, ...change }).then(async () => {
      toast.success("Saved.")
      await onSaved()
    }, reportFitnessError)
  }

  return (
    <PanelCard storageId="fitness-live-how-it-went" title="How it went">
      <div className="grid gap-2">
        <span id={effortLabelId} className="text-sm font-medium">
          How hard it was
        </span>
        <EffortPicker value={workout.effort} onChange={(effort) => save({ effort })} labelId={effortLabelId} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={noteId}>Note</Label>
        <NoteField
          id={noteId}
          label="Workout note"
          value={workout.note}
          placeholder="Anything to remember"
          maxLength={2000}
          onCommit={(note) => save({ note })}
        />
      </div>
    </PanelCard>
  )
}
