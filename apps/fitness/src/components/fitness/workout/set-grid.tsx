import { MessageSquareIcon, PlusIcon } from "lucide-react"

import { TONE } from "@/components/fitness/status-tones"
import { WeightInput } from "@/components/fitness/weight-input"
import { RepsInput } from "@/components/fitness/workout/fields"
import { bestOf, setWords } from "@/components/fitness/workout/live-workout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { LiftNote } from "@/lib/api/fitness/coaching"
import type { SetView, WorkoutExercise } from "@/lib/api/fitness/workouts"
import { type WeightUnit } from "@/lib/fitness/weights"
import { cn } from "@/lib/utils"

/** The table's columns: Set, Previous, weight, reps, Done. */
const GRID = "grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(4.5rem,1fr)_minmax(3.5rem,1fr)_2.5rem] items-center gap-2 @2xl:gap-3"

/** A Calisthenics move's columns: Set, Previous, reps or seconds, Done. Its weight is never counted. */
const GRID_COUNT = "grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(4.5rem,1fr)_2.5rem] items-center gap-2 @2xl:gap-3"

/**
 * One lift in the live workout, as a band across the middle panel with a
 * line under it, the way Tyler's drawings of 20 Oct 2026 lay it out (the
 * second one took the cards away): the name with last time's best set, "Now" on the lift
 * being done and how many of its sets are ticked, then a row per set (W in
 * amber for a warm-up, else its number), what was done last time, the weight
 * with its unit written in the box, the reps and a Done tick. The set to do
 * next is shaded. "Add a set" sits under the rows.
 *
 * The lift being done is white; the others are grey. Clicking the heading
 * opens the lift on the right. A note a coach left on this lift in an earlier
 * workout shows under the heading, "Coach: keep the elbows in".
 *
 * A Calisthenics move has no weight box: its sets are reps, or seconds for a
 * hold such as a plank.
 */
export function SetGrid({
  exercise,
  unit,
  current,
  canChange,
  coachNote,
  onPick,
  onSetChange,
  onToggleDone,
  onAddSet,
}: {
  exercise: WorkoutExercise
  unit: WeightUnit
  coachNote?: LiftNote
  /** This lift is the one being done, shown on the right. */
  current: boolean
  canChange: boolean
  onPick: () => void
  onSetChange: (set: SetView, change: Partial<Pick<SetView, "weightKg" | "reps">>) => void
  onToggleDone: (set: SetView) => void
  onAddSet: () => void
}) {
  const lastSets = exercise.last?.sets ?? []
  const best = bestOf(lastSets)
  const done = exercise.sets.filter((set) => set.done).length
  const next = current ? exercise.sets.find((set) => !set.done) : undefined
  const suffix = exercise.isBodyweight ? `+${unit}` : unit
  const counted = exercise.measure !== "load"
  const grid = counted ? GRID_COUNT : GRID
  const countLabel = exercise.measure === "seconds" ? "Seconds" : "Reps"
  let working = 0

  return (
    <section
      aria-label={exercise.name}
      className={cn("@container min-w-0 border-b", current ? "bg-card" : "bg-muted/40")}
    >
      <button
        type="button"
        aria-current={current ? "true" : undefined}
        className="flex w-full min-w-0 items-center gap-2 border-b px-5 py-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        onClick={onPick}
      >
        <span className="truncate text-base font-semibold">{exercise.name}</span>
        <span className="shrink-0 truncate text-[13px] text-muted-foreground">
          {best ? `Last: ${setWords(best, unit, exercise.isBodyweight, exercise.measure)}` : "First time"}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground tabular-nums">
          {next ? (
            <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">Now</span>
          ) : null}
          {done}/{exercise.sets.length}
        </span>
      </button>
      {coachNote ? (
        <p className="flex items-start gap-1.5 border-b px-5 py-2 text-[13px]">
          <MessageSquareIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0">
            <span className="font-medium">{coachNote.coachName}: </span>
            <span className="whitespace-pre-line">{coachNote.text}</span>
          </span>
        </p>
      ) : null}
      <div className="grid gap-1 px-3 pt-2 pb-3">
        <div className={cn(grid, "px-2 py-1 text-[13px] text-muted-foreground")} aria-hidden="true">
          <span>Set</span>
          <span>Previous</span>
          {counted ? null : <span>{exercise.isBodyweight ? `Added ${unit}` : unit}</span>}
          <span>{countLabel}</span>
          <span className="text-center">Done</span>
        </div>
        <ul className="grid gap-1">
          {exercise.sets.map((set) => {
            const warmup = set.kind === "warmup"
            const index = warmup ? -1 : working++
            const label = warmup ? "W" : String(index + 1)
            const spoken = warmup ? "warm-up" : `set ${label}`
            const previous = warmup ? null : (lastSets[index] ?? null)
            return (
              <li key={set.id} className={cn(grid, "rounded-lg px-2 py-1.5", set.id === next?.id && "bg-muted")}>
                <SetBadge warmup={warmup} label={label} />
                <span className="truncate text-sm text-muted-foreground tabular-nums">
                  {previous ? setWords(previous, unit, exercise.isBodyweight, exercise.measure) : "None"}
                </span>
                {counted ? null : (
                  <WeightInput
                    aria-label={`${exercise.isBodyweight ? "Added weight" : "Weight"}, ${spoken}, in ${unit}`}
                    valueKg={set.weightKg ?? set.targetWeightKg}
                    unit={unit}
                    placeholder="0"
                    className="bg-background tabular-nums"
                    showUnit
                    unitLabel={suffix}
                    onCommit={(kg) => onSetChange(set, { weightKg: kg })}
                  />
                )}
                <RepsInput
                  id={`reps-${set.id}`}
                  label={`${countLabel}, ${spoken}`}
                  // The target shows as the value, as the weight's does, so ticking
                  // Done without typing logs exactly what is written.
                  value={set.reps ?? set.targetReps}
                  placeholder="0"
                  className="bg-background tabular-nums"
                  onCommit={(reps) => onSetChange(set, { reps })}
                />
                {/* The whole cell is the tap target, not just the 20px box: it is tapped after every set. */}
                <label className="flex size-10 cursor-pointer items-center justify-center justify-self-center rounded-md">
                  <Checkbox
                    checked={set.done}
                    aria-label={set.done ? `${spoken} done. Press to undo.` : `Mark ${spoken} done`}
                    className="size-5 bg-background"
                    onCheckedChange={() => onToggleDone(set)}
                  />
                </label>
              </li>
            )
          })}
        </ul>
        {canChange ? (
          <Button type="button" variant="ghost" size="sm" className="ml-1 w-fit text-muted-foreground" onClick={onAddSet}>
            <PlusIcon className="size-4" />
            Add a set
          </Button>
        ) : null}
      </div>
    </section>
  )
}

/** "W" in amber for a warm-up, else the set's number in a small box. */
function SetBadge({ warmup, label }: { warmup: boolean; label: string }) {
  const box = "flex size-6 items-center justify-center rounded-md text-xs font-medium tabular-nums"
  if (!warmup) return <span className={cn(box, "border bg-background")}>{label}</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(box, TONE.warning)} tabIndex={0}>
          W
        </span>
      </TooltipTrigger>
      <TooltipContent>Warm-up</TooltipContent>
    </Tooltip>
  )
}
