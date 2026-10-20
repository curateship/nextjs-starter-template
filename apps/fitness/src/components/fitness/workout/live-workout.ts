import * as React from "react"

import type { RestTimerState } from "@/components/fitness/workout/rest-timer"
import type { SetView, WorkoutView } from "@/lib/api/fitness/workouts"
import { formatWeightNumber, type WeightUnit } from "@/lib/fitness/weights"

/**
 * What the person has done to a workout in this tab, laid over what the
 * server last sent.
 *
 * The live workout is drawn in two panels at once: the sets in the middle and
 * the current exercise on the right. Both read this one store, so ticking a set
 * in the middle moves the plates on the right straight away. Every change is
 * also sent to the server (or held on the phone with no signal), and kept here
 * until the page closes, so a reload of the server's copy never flickers a
 * ticked set back to open.
 */
type LiveState = {
  /** Changes to sets, by set id. */
  patches: Readonly<Record<string, Partial<SetView>>>
  /** Sets added here, by exercise position, until the server's copy has them. */
  added: Readonly<Record<number, readonly SetView[]>>
  /** Ids of sets removed here. */
  removed: readonly string[]
  timer: RestTimerState
}

const EMPTY: LiveState = { patches: {}, added: {}, removed: [], timer: null }
const states = new Map<string, LiveState>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function update(workoutId: string, change: (state: LiveState) => LiveState) {
  states.set(workoutId, change(states.get(workoutId) ?? EMPTY))
  for (const listener of listeners) listener()
}

export function useLiveState(workoutId: string): LiveState {
  return React.useSyncExternalStore(
    subscribe,
    () => states.get(workoutId) ?? EMPTY,
    () => EMPTY
  )
}

export const live = {
  patchSet(workoutId: string, setId: string, change: Partial<SetView>) {
    update(workoutId, (state) => ({
      ...state,
      patches: { ...state.patches, [setId]: { ...state.patches[setId], ...change } },
    }))
  },
  addSet(workoutId: string, position: number, set: SetView) {
    update(workoutId, (state) => ({
      ...state,
      added: { ...state.added, [position]: [...(state.added[position] ?? []), set] },
    }))
  },
  removeSet(workoutId: string, setId: string) {
    update(workoutId, (state) => ({ ...state, removed: [...state.removed, setId] }))
  },
  setTimer(workoutId: string, timer: RestTimerState | ((current: RestTimerState) => RestTimerState)) {
    update(workoutId, (state) => ({ ...state, timer: typeof timer === "function" ? timer(state.timer) : timer }))
  },
  /** Forgets everything for a workout once it is finished or deleted. */
  clear(workoutId: string) {
    states.delete(workoutId)
    for (const listener of listeners) listener()
  },
}

/** The server's workout with this tab's changes laid over it. */
export function applyLive(workout: WorkoutView, state: LiveState): WorkoutView {
  const removed = new Set(state.removed)
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => {
      const known = new Set(exercise.sets.map((set) => set.id))
      const extra = (state.added[exercise.position] ?? []).filter((set) => !known.has(set.id))
      return {
        ...exercise,
        sets: [...exercise.sets, ...extra]
          .filter((set) => !removed.has(set.id))
          .map((set) => (state.patches[set.id] ? { ...set, ...state.patches[set.id] } : set)),
      }
    }),
  }
}

/**
 * The exercise the right panel shows: the one picked (`pick` is "pos-2"), or
 * else the first with a working set still open, or else the first.
 */
export function currentExercise(workout: WorkoutView, pick: string | undefined) {
  const picked = pick?.startsWith("pos-") ? Number(pick.slice(4)) : null
  return (
    workout.exercises.find((exercise) => exercise.position === picked) ??
    workout.exercises.find((exercise) => exercise.sets.some((set) => set.kind === "working" && !set.done)) ??
    workout.exercises[0] ??
    null
  )
}

export function pickFor(position: number) {
  return `pos-${position}`
}

/** The set the plates are worked out for: the first one still open, or the last. */
export function currentSet(sets: readonly SetView[]) {
  return sets.find((set) => !set.done) ?? sets[sets.length - 1] ?? null
}

type SetFigures = { weightKg: number | null; reps: number | null }

/** "30 kg × 6"; on a bodyweight lift, the weight added: "+10 kg × 12". */
export function setWords(set: SetFigures, unit: WeightUnit, bodyweight: boolean) {
  const weight = `${formatWeightNumber(set.weightKg ?? 0, unit)} ${unit}`
  return `${bodyweight ? "+" : ""}${weight} × ${set.reps ?? 0}`
}

/** Last time's best set: the heaviest, and of those the one with most reps. */
export function bestOf<Set extends SetFigures>(sets: readonly Set[]): Set | null {
  return sets.reduce<Set | null>((best, set) => {
    if (!best) return set
    const weight = set.weightKg ?? 0
    const bestWeight = best.weightKg ?? 0
    return weight > bestWeight || (weight === bestWeight && (set.reps ?? 0) > (best.reps ?? 0)) ? set : best
  }, null)
}
