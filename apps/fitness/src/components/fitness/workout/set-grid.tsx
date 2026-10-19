import { CheckIcon, CircleIcon, PlusIcon } from "lucide-react"

import { WeightInput } from "@/components/fitness/weight-input"
import { RepsInput } from "@/components/fitness/workout/fields"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SetView, WorkoutExercise } from "@/lib/api/fitness/workouts"
import { formatDay } from "@/lib/fitness/dates"
import { formatWeightNumber, type WeightUnit } from "@/lib/fitness/weights"
import { cn } from "@/lib/utils"

/** The grid's columns: Set, Previous, weight, reps, tick. */
const GRID = "grid grid-cols-[2rem_minmax(0,8rem)_5.5rem_4rem_2rem] items-center gap-2"

/**
 * One lift in the live workout, as a gym app draws it: a row per set with
 * the set's number (W for a warm-up), what was done last time, the weight in
 * the person's unit, the reps and a tick. A done set shows a tick and an open
 * one an empty circle, so its state never rests on colour.
 *
 * Clicking the lift's name opens it on the right, where its plates, last
 * session, notes and actions are.
 */
export function SetGrid({
  exercise,
  unit,
  picked,
  canChange,
  onPick,
  onSetChange,
  onToggleDone,
  onAddSet,
}: {
  exercise: WorkoutExercise
  unit: WeightUnit
  /** This lift is the one open on the right. */
  picked: boolean
  canChange: boolean
  onPick: () => void
  onSetChange: (set: SetView, change: Partial<Pick<SetView, "weightKg" | "reps">>) => void
  onToggleDone: (set: SetView) => void
  onAddSet: () => void
}) {
  const lastSets = exercise.last?.sets ?? []
  const weightLabel = exercise.isBodyweight ? `+${unit}` : unit
  let working = 0

  return (
    <section aria-label={exercise.name} className={cn("grid gap-1 px-3 py-2", picked && "bg-muted/40")}>
      <button
        type="button"
        aria-current={picked ? "true" : undefined}
        className="flex min-w-0 items-baseline gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onPick}
      >
        <span className="truncate text-sm font-semibold">{exercise.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {exercise.last ? `Last done ${formatDay(exercise.last.day)}` : "First time"}
        </span>
      </button>
      <div className={cn(GRID, "text-xs text-muted-foreground")} aria-hidden="true">
        <span>Set</span>
        <span>Previous</span>
        <span>{exercise.isBodyweight ? `Added ${unit}` : unit}</span>
        <span>Reps</span>
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
            <li key={set.id} className={GRID}>
              {warmup ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm font-medium text-muted-foreground" tabIndex={0}>
                      W
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Warm-up</TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-sm font-medium">{label}</span>
              )}
              <span className="truncate text-sm text-muted-foreground tabular-nums">
                {previous ? `${previous.weightKg === null ? "0" : formatWeightNumber(previous.weightKg, unit)} x ${previous.reps ?? 0}` : "None"}
              </span>
              <div className="relative">
                <WeightInput
                  aria-label={`${exercise.isBodyweight ? "Added weight" : "Weight"}, ${spoken}, in ${unit}`}
                  valueKg={set.weightKg ?? set.targetWeightKg}
                  unit={unit}
                  placeholder="0"
                  className="pr-9 tabular-nums"
                  onCommit={(kg) => onSetChange(set, { weightKg: kg })}
                />
                <span
                  className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground"
                  aria-hidden="true"
                >
                  {weightLabel}
                </span>
              </div>
              <RepsInput
                id={`reps-${set.id}`}
                label={`Reps, ${spoken}`}
                value={set.reps}
                placeholder={set.targetReps === null ? "0" : String(set.targetReps)}
                onCommit={(reps) => onSetChange(set, { reps })}
              />
              <Button
                type="button"
                size="icon"
                variant={set.done ? "default" : "outline"}
                aria-pressed={set.done}
                aria-label={set.done ? `${spoken} done. Press to undo.` : `Mark ${spoken} done`}
                onClick={() => onToggleDone(set)}
              >
                {set.done ? <CheckIcon className="size-4" /> : <CircleIcon className="size-4" />}
              </Button>
            </li>
          )
        })}
      </ul>
      {canChange ? (
        <Button type="button" variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={onAddSet}>
          <PlusIcon className="size-4" />
          Add a set
        </Button>
      ) : null}
    </section>
  )
}
