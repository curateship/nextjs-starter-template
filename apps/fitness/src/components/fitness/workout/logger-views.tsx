import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudOffIcon,
  CopyIcon,
  DumbbellIcon,
  EllipsisIcon,
  Link2Icon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  TimerIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PanelBody, PanelEmpty, PanelHeader, RightEmpty } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { ExercisePicker } from "@/components/fitness/exercise-picker"
import { PanelCard } from "@/components/fitness/panel-card"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { HurtsDialog, SwapDialog, type SwapTarget } from "@/components/fitness/workout/exercise-dialogs"
import { NoteField } from "@/components/fitness/workout/fields"
import { EffortPicker, FinishDialog, SummaryDialog } from "@/components/fitness/workout/finish-dialogs"
import {
  applyLive,
  bestOf,
  currentExercise,
  currentSet,
  live,
  pickFor,
  setWords,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Meter } from "@/components/ui/meter"
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
import { cn } from "@/lib/utils"

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
  return <LiveMiddle key={page.workout.workout.id} data={page.workout} pick={search.at} go={go} />
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
      go({ workout: id, open: undefined })
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
      go({ workout: undefined, open: undefined, view: "history" })
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
      go({ workout: undefined, open: undefined })
      return
    }
    setBusy(true)
    try {
      await removeWorkout(workout.id)
      forgetQueue(browserStorage(), workout.id)
      live.clear(workout.id)
      toast.success("Nothing was ticked, so the workout was thrown away.")
      go({ workout: undefined, open: undefined })
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
  const allSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
  const doneSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.done).length, 0)
  const percent = allSets ? Math.round((doneSets / allSets) * 100) : 0

  return (
    <>
      {/* Tyler's drawing of 20 Oct 2026: back, the workout's name, then the
          day, the sets ticked with a bar, the clock and Finish in one row. */}
      <PanelHeader className="@container gap-3">
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
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium">{workout.name}</h2>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-3 text-[13px] text-muted-foreground tabular-nums">
          <span className="@max-3xl:hidden">{formatDay(workout.day)}</span>
          <span className="flex items-center gap-2 border-l pl-3 @max-xl:hidden">
            <span className="font-medium text-foreground">
              {doneSets}/{allSets} sets
            </span>
            <Meter
              value={doneSets}
              max={allSets}
              size="sm"
              label="Sets ticked"
              valueText={`${doneSets} of ${allSets} sets`}
              className="w-32 @max-4xl:hidden"
            />
            <span className="@max-4xl:hidden">{percent}%</span>
          </span>
          <span className="flex items-center gap-1.5 border-l pl-3">
            <TimerIcon className="size-3.5" aria-hidden />
            <Elapsed startedAt={workout.startedAt} finishedAt={workout.finishedAt} />
          </span>
        </div>
        {canChange ? (
          finished ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" aria-label="Do this again" disabled={busy} onClick={() => void repeat()}>
                    {busy ? <Loader2Icon className="size-4 animate-spin" /> : <CopyIcon className="size-4" />}
                    <span className="@max-3xl:hidden">Do this again</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Start a new workout with the same lifts</TooltipContent>
              </Tooltip>
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
      {/* The lifts run edge to edge with a line between them, no cards (Tyler, 20 Oct 2026). */}
      <PanelBody padded={false}>
        {workout.lightWeek || finished || !canChange || waiting > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3 text-[13px] text-muted-foreground">
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
        ) : null}
        {/* A coach reads every set here, but nothing in it answers a press. */}
        <fieldset disabled={!canChange} className="contents">
          {workout.exercises.length === 0 ? (
            <PanelEmpty>Nothing here yet. Add your first exercise.</PanelEmpty>
          ) : (
            groupExercises(workout.exercises).map((group) => (
              <div key={group.map((exercise) => exercise.position).join("-")}>
                {group.length > 1 ? (
                  <p className="flex items-center gap-1.5 border-b px-5 py-2 text-xs font-medium text-muted-foreground">
                    <Link2Icon className="size-3.5" aria-hidden />
                    Superset: one set of each in turn, then rest
                  </p>
                ) : null}
                {group.map((exercise) => (
                  <SetGrid
                    key={exercise.position}
                    exercise={exercise}
                    unit={unit}
                    current={current?.position === exercise.position}
                    canChange={canChange}
                    coachNote={data.liftNotes[exercise.exerciseId]}
                    onPick={() => go({ at: pickFor(exercise.position) }, { replace: true })}
                    onSetChange={(set, change) =>
                      "weightKg" in change ? saveWeight(exercise, set, change.weightKg ?? null) : void saveSetChange(set, change)
                    }
                    onToggleDone={(set) => toggleDone(exercise, set)}
                    onAddSet={() => addSet(workout, exercise, send)}
                  />
                ))}
              </div>
            ))
          )}
          {canChange ? (
            <div className="px-5 py-4">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full border-dashed bg-transparent shadow-none"
                disabled={busy}
                onClick={() => setPicking(true)}
              >
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
              ? { workout: undefined, view: "history", open: workoutId }
              : { workout: undefined, view: "day", open: undefined }
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
  return <LiveRight key={page.workout.workout.id} data={page.workout} pick={search.at} go={go} />
}

/**
 * The exercise being done, on the right, as Tyler drew it on 20 Oct 2026:
 * the lift's name with arrows to the one before and after, then Up next (the
 * weight and reps of the set to do now, and what that set was last time),
 * Warm-ups, Last time (the best set and how many working sets), and a note on
 * the set. Remove from this workout sits under them. It follows the lift
 * picked in the middle, or else the first with a set still to do.
 *
 * Tyler took the "Change this lift" card out the same day. Add a set is under
 * each lift in the middle; Remove the last set, Swap for another lift and
 * This hurts are in the three dots in this panel's header.
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
      <RightEmpty title="Exercise" icon={DumbbellIcon} line="Add an exercise in the middle to start logging.">
        {finished && canChange ? <HowItWent workout={workout} onSaved={refresh} /> : null}
      </RightEmpty>
    )
  }

  const library = data.exercises.find((entry) => entry.id === exercise.exerciseId)
  const barbell = !exercise.isBodyweight && (library?.equipment.includes("barbell") ?? false)
  const set = currentSet(exercise.sets)
  const open = exercise.sets.find((one) => !one.done) ?? null
  const workingBefore = set ? exercise.sets.filter((one) => one.kind === "working" && one.setNumber < set.setNumber).length : 0
  const setLabel = set ? (set.kind === "warmup" ? "the warm-up" : `set ${workingBefore + 1}`) : ""
  const weight = set ? (set.weightKg ?? set.targetWeightKg) : null
  const reps = set ? (set.reps ?? set.targetReps) : null
  const lastForSet = set && set.kind === "working" ? (exercise.last?.sets[workingBefore] ?? null) : null
  const plates = barbell && weight !== null && weight > 0 ? platesFor(weight, data.preferences.barKg, data.preferences.platesKg) : null
  const warmups = exercise.sets.filter((one) => one.kind === "warmup")
  const index = workout.exercises.findIndex((one) => one.position === exercise.position)
  const before = workout.exercises[index - 1]
  const after = workout.exercises[index + 1]
  const best = bestOf(exercise.last?.sets ?? [])
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
      go({ at: undefined }, { replace: true })
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

  const step = (to: WorkoutExercise | undefined, label: string, Icon: typeof ChevronLeftIcon) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={label}
          disabled={!to}
          onClick={() => to && go({ at: pickFor(to.position) }, { replace: true })}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <>
      <DashboardCardTitleHeader
        // The name over "Exercise 1 of 2", as Tyler drew it, so a narrow panel cuts neither short.
        title={
          <span className="grid leading-tight">
            <span className="truncate">{exercise.name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              Exercise {index + 1} of {workout.exercises.length}
              {library?.avoided ? " · On your pain list" : ""}
            </span>
          </span>
        }
        action={
          <div className="flex items-center gap-1">
            {step(before, "Previous exercise", ChevronLeftIcon)}
            {step(after, "Next exercise", ChevronRightIcon)}
            {canChange ? (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`${exercise.name} actions`}>
                        <EllipsisIcon />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{exercise.name} actions</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="min-w-52">
                  {/* A lift keeps at least one set; with one left, Remove from this workout is the way out. */}
                  {exercise.sets.length > 1 ? (
                    <DropdownMenuItem onSelect={removeLastSet}>
                      <MinusIcon />
                      Remove the last set
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={() => setSwapTarget(target)}>
                    <ArrowLeftRightIcon />
                    Swap for another lift
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setHurtsTarget(target)}>
                    <TriangleAlertIcon />
                    This hurts
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
      />
      <PanelBody>
        {set ? (
          <LiveCard
            title={
              open
                ? `Up next · ${set.kind === "warmup" ? "Warm-up" : `Set ${workingBefore + 1}`}`
                : "Every set done"
            }
          >
            {exercise.measure === "load" ? (
              <dl className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-8 gap-y-1">
                <Figure label="Weight" value={formatWeightNumber(weight ?? 0, unit)} unit={exercise.isBodyweight ? `+${unit}` : unit} />
                <Figure label="Reps" value={reps === null ? "0" : String(reps)} />
                <Figure
                  label="Last time"
                  value={lastForSet ? `${formatWeightNumber(lastForSet.weightKg ?? 0, unit)}×${lastForSet.reps ?? 0}` : "None"}
                  muted
                />
              </dl>
            ) : (
              // A Calisthenics move counts no weight: just the reps, or seconds for a hold.
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-1">
                <Figure label={exercise.measure === "seconds" ? "Seconds" : "Reps"} value={reps === null ? "0" : String(reps)} />
                <Figure label="Last time" value={lastForSet ? String(lastForSet.reps ?? 0) : "None"} muted />
              </dl>
            )}
            {exercise.measure !== "load" ? null : exercise.isBodyweight ? (
              <p className="text-[13px] text-muted-foreground">
                {set.bodyweightKg != null
                  ? `With your bodyweight, ${formatWeight(set.bodyweightKg + (weight ?? 0), unit)} in all.`
                  : "Add a weigh-in on Progress to count your bodyweight."}
              </p>
            ) : plates ? (
              <p className="text-[13px] text-muted-foreground tabular-nums">
                {plates.perSide.length
                  ? `${plates.perSide.map((plate) => formatWeightNumber(plate, unit)).join(" + ")} a side on a ${formatWeight(data.preferences.barKg, unit)} bar`
                  : "Empty bar"}
                {plates.short && weight !== null
                  ? `. Can't make exactly ${formatWeight(weight, unit)}, closest ${formatWeight(plates.loadedKg, unit)}.`
                  : ""}
              </p>
            ) : null}
          </LiveCard>
        ) : null}

        {warmups.length === 0 && barbell && !finished ? (
          // A barbell lift is the one that gets warm-ups, so say why it has none.
          <LiveCard title="Warm-ups">
            <p className="text-[13px] text-muted-foreground">
              {data.preferences.warmupsOn
                ? "No warm-up sets for this lift in this workout. Lifts from the program's week get them when the workout starts."
                : "Warm-ups are off. The site admin turns them on in Settings, App settings."}
            </p>
          </LiveCard>
        ) : null}
        {warmups.length > 0 ? (
          <LiveCard title="Warm-ups" meta={`${warmups.filter((one) => one.done).length} of ${warmups.length}`}>
            <ul className="grid gap-2 text-sm">
              {warmups.map((warm) => (
                <li key={warm.id} className="flex justify-between gap-3 tabular-nums">
                  <span>{setWords({ weightKg: warm.weightKg ?? warm.targetWeightKg, reps: warm.reps ?? warm.targetReps }, unit, false)}</span>
                  <span className="text-[13px] text-muted-foreground">{warm.done ? "Done" : "To do"}</span>
                </li>
              ))}
            </ul>
          </LiveCard>
        ) : null}

        <LiveCard title="Last time" aside={exercise.last ? formatDay(exercise.last.day) : undefined}>
          {exercise.last && best ? (
            <dl className="grid grid-cols-2 gap-4">
              <Figure label="Best set" value={setWords(best, unit, exercise.isBodyweight, exercise.measure)} small />
              <Figure label="Working sets" value={String(exercise.last.sets.length)} small />
            </dl>
          ) : (
            <p className="text-[13px] text-muted-foreground">First time logging this lift.</p>
          )}
        </LiveCard>

        {set && canChange ? (
          <LiveCard title="Note" meta={setLabel || undefined}>
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
          </LiveCard>
        ) : null}

        {finished && canChange ? <HowItWent workout={workout} onSaved={refresh} /> : null}

        {canChange ? (
          <Button
            type="button"
            variant="ghost"
            className="w-fit text-destructive hover:text-destructive"
            onClick={() => setRemoving(exercise)}
          >
            <Trash2Icon className="size-4" />
            Remove from this workout
          </Button>
        ) : null}
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

/**
 * A grey card on the right of the live workout, as Tyler drew them on 20 Oct
 * 2026: a heading, a muted count after it or a date at its right, then the
 * body. It doesn't fold, because everything on it is needed mid-set.
 */
function LiveCard({
  title,
  meta,
  aside,
  children,
}: {
  title: string
  meta?: string
  aside?: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={title} className="grid min-w-0 gap-3 rounded-xl border bg-muted/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-[15px] font-semibold">
          {title}
          {meta ? <span className="font-normal text-muted-foreground"> · {meta}</span> : null}
        </h3>
        {aside ? <span className="shrink-0 text-[13px] text-muted-foreground">{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

/** One figure in a card: a small label over a number, "Weight / 17.5 kg". */
function Figure({
  label,
  value,
  unit,
  muted = false,
  small = false,
}: {
  label: string
  value: string
  unit?: string
  muted?: boolean
  small?: boolean
}) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn("truncate font-semibold tabular-nums", small ? "text-base" : "text-2xl", muted && "text-muted-foreground")}>
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span> : null}
      </dd>
    </div>
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
      // A heading until pointed at or typed in, as Tyler drew it on 20 Oct 2026.
      className="min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-[15px] font-medium shadow-none hover:border-input focus-visible:border-input dark:bg-transparent"
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
 * "0:32", hours and minutes since the start, ticking every half minute, or
 * how long a finished workout took. Drawn only once the page is running in the browser, so the
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
  const minutes = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 60000))
  const text = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
  return (
    <span>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">
        {finishedAt ? "Took " : ""}
        {Math.floor(minutes / 60)} h {minutes % 60} min{finishedAt ? "" : " so far"}
      </span>
    </span>
  )
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
