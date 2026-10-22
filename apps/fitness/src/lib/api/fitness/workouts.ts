import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import { liftNotesFor, loadCoachNotes } from "@/server/fitness/coach-notes"
import { preferencesFor } from "@/server/fitness/profile"
import {
  addExerciseToWorkout,
  addSet,
  deleteWorkout,
  finishWorkout,
  loadHistory,
  loadWorkout,
  removeExerciseFromWorkout,
  removeSet,
  saveSet,
  saveWorkoutNotes,
  startWorkout,
  swapExercise,
} from "@/server/fitness/workouts"
import { listExercises, swapsFor } from "@/server/fitness/exercises"
import { loadBaseline } from "@/server/fitness/week"
import { programFor } from "@/server/fitness/access"

export type {
  FinishSummary,
  HistoryRow,
  PersonalRecord,
  SetView,
  WorkoutExercise,
  WorkoutView,
} from "@/server/fitness/workouts"

const id = z.string().min(1).max(36)

const startFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("from", [
      z.object({ from: z.literal("scheduled"), scheduledId: id }),
      z.object({ from: z.literal("day"), dayId: id }),
      z.object({ from: z.literal("empty"), programId: id.optional(), name: z.string().max(80).optional() }),
      z.object({ from: z.literal("repeat"), workoutId: id }),
    ])
  )
  .handler(async ({ data, context }) => startWorkout(context.user.id, data))

export function beginWorkout(data: Parameters<typeof startFn>[0]["data"]) {
  return startFn({ data })
}

/**
 * A workout being logged on its program's dashboard: the workout, the
 * person's units and plates, the lifts it can add (only its program's
 * routine type), and the equipment the program's starting data lists.
 */
const loadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ workoutId: id }))
  .handler(async ({ data, context }) => {
    const workout = await loadWorkout(context.user.id, data.workoutId)
    const program = workout.programId ? await programFor(context.user.id, workout.programId) : null
    return {
      workout,
      /** False for a coach reading a client's workout: only the person logs or changes it. */
      canChange: workout.userId === context.user.id,
      /** A coach reading a client's workout may leave notes on it; the person can't. */
      canNote: workout.userId !== context.user.id,
      coachNotes: await loadCoachNotes(context.user.id, workout.id),
      liftNotes: await liftNotesFor(
        context.user.id,
        workout.userId,
        workout.exercises.map((exercise) => exercise.exerciseId),
        workout.id
      ),
      preferences: await preferencesFor(workout.userId),
      exercises: await listExercises(workout.userId, undefined, program?.routineType),
      equipment: program ? (await loadBaseline(program.id)).equipment : [],
    }
  })

export function loadWorkoutPage(workoutId: string) {
  return loadFn({ data: { workoutId } })
}

const setFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({
        action: z.literal("save"),
        setId: id,
        change: z
          .object({
            weightKg: z.number().min(0).max(1000).nullable(),
            reps: z.number().int().min(0).max(1000).nullable(),
            done: z.boolean(),
            note: z.string().max(500),
          })
          .partial(),
      }),
      z.object({ action: z.literal("add"), workoutId: id, position: z.number().int().min(0).max(200), id: z.string().uuid().optional() }),
      z.object({ action: z.literal("remove"), setId: id }),
    ])
  )
  .handler(async ({ data, context }): Promise<{ id?: string }> => {
    if (data.action === "save") {
      await saveSet(context.user.id, data.setId, data.change)
      return {}
    }
    if (data.action === "add") return addSet(context.user.id, data.workoutId, data)
    await removeSet(context.user.id, data.setId)
    return {}
  })

export function changeSet(data: Parameters<typeof setFn>[0]["data"]) {
  return setFn({ data })
}

const exerciseFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("add"), workoutId: id, exerciseId: id }),
      z.object({ action: z.literal("remove"), workoutId: id, position: z.number().int().min(0).max(200) }),
      z.object({
        action: z.literal("swap"),
        workoutId: id,
        position: z.number().int().min(0).max(200),
        exerciseId: id,
        changePlan: z.boolean(),
      }),
    ])
  )
  .handler(async ({ data, context }) => {
    if (data.action === "add") await addExerciseToWorkout(context.user.id, data.workoutId, data.exerciseId)
    else if (data.action === "remove") await removeExerciseFromWorkout(context.user.id, data.workoutId, data.position)
    else await swapExercise(context.user.id, data.workoutId, data)
  })

export function changeWorkoutExercise(data: Parameters<typeof exerciseFn>[0]["data"]) {
  return exerciseFn({ data })
}

const swapsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ exerciseId: id, equipment: z.array(z.string().max(40)).max(20) }))
  .handler(async ({ data, context }) => swapsFor(context.user.id, data.exerciseId, data.equipment))

export function loadSwaps(exerciseId: string, equipment: string[]) {
  return swapsFn({ data: { exerciseId, equipment } })
}

const finishFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ workoutId: id, effort: z.number().int().min(1).max(10).nullable(), note: z.string().max(2000) })
  )
  .handler(async ({ data, context }) => finishWorkout(context.user.id, data.workoutId, data))

export function finishTheWorkout(data: Parameters<typeof finishFn>[0]["data"]) {
  return finishFn({ data })
}

const notesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      workoutId: id,
      effort: z.number().int().min(1).max(10).nullable().optional(),
      note: z.string().max(2000).optional(),
      name: z.string().max(80).optional(),
    })
  )
  .handler(async ({ data, context }) => saveWorkoutNotes(context.user.id, data.workoutId, data))

export function saveWorkoutDetails(data: Parameters<typeof notesFn>[0]["data"]) {
  return notesFn({ data })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ workoutId: id }))
  .handler(async ({ data, context }) => deleteWorkout(context.user.id, data.workoutId))

export function removeWorkout(workoutId: string) {
  return deleteFn({ data: { workoutId } })
}

const historyFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ personId: id.optional() }))
  .handler(async ({ data, context }) => {
    const personId = data.personId ?? context.user.id
    return {
      personId,
      rows: await loadHistory(context.user.id, personId),
      preferences: await preferencesFor(personId),
      exercises: await listExercises(personId),
    }
  })

export function loadWorkoutHistory(personId?: string) {
  return historyFn({ data: { personId } })
}
