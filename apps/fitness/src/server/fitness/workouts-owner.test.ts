import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { addDays } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { CustomShellDb } from "@/server/db"
import { loadCalendar, todayFor } from "@/server/fitness/calendar"
import { answerCoach, inviteClient } from "@/server/fitness/coach"
import { applyTemplate, loadWeek } from "@/server/fitness/week"
import { createProgram } from "@/server/fitness/programs"
import {
  addExerciseToWorkout,
  addSet,
  deleteWorkout,
  finishWorkout,
  loadHistory,
  loadWorkout,
  removeSet,
  saveSet,
  saveWorkoutNotes,
  startWorkout,
  swapExercise,
} from "@/server/fitness/workouts"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * A coach linked to a client may read the client's workouts, but only the
 * client starts, logs, changes, finishes or deletes one.
 */

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let coach: CustomShellUser
let programId: string
let workoutId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  coach = await insertUser(database, { name: "Cleo", email: "cleo@example.test", role: "coach" })
  await inviteClient(coach.id, "anna@example.test", database)
  await answerCoach(anna.id, coach.id, true, database)
  programId = (await createProgram(anna.id, anna.id, { name: "Strong", routineType: "strength" }, database)).id
  await applyTemplate(anna.id, programId, "five-by-five", database)
  const plan = await loadWeek(programId, database)
  workoutId = (await startWorkout(anna.id, { from: "day", dayId: plan[0].id }, database)).id
})

afterEach(async () => {
  await client.close()
})

describe("a coach reading a client's workouts", () => {
  it("can read the workout and the history", async () => {
    const workout = await loadWorkout(coach.id, workoutId, database)
    expect(workout.userId).toBe(anna.id)
    // History lists a workout once a set is ticked.
    await saveSet(anna.id, workout.exercises[0].sets[0].id, { done: true, reps: 5 }, database)
    expect((await loadHistory(coach.id, anna.id, database)).map((row) => row.id)).toContain(workoutId)
  })

  it("can't log, change, finish or delete it", async () => {
    const workout = await loadWorkout(anna.id, workoutId, database)
    const set = workout.exercises[0].sets[0]
    const refused = FITNESS_ERRORS.notYourWorkout
    await expect(saveSet(coach.id, set.id, { done: true, reps: 5 }, database)).rejects.toThrow(refused)
    await expect(addSet(coach.id, workoutId, { position: 0 }, database)).rejects.toThrow(refused)
    await expect(removeSet(coach.id, set.id, database)).rejects.toThrow(refused)
    await expect(
      addExerciseToWorkout(coach.id, workoutId, workout.exercises[0].exerciseId, database)
    ).rejects.toThrow(refused)
    await expect(
      swapExercise(coach.id, workoutId, { position: 0, exerciseId: workout.exercises[1].exerciseId, changePlan: false }, database)
    ).rejects.toThrow(refused)
    await expect(saveWorkoutNotes(coach.id, workoutId, { note: "Coach was here" }, database)).rejects.toThrow(refused)
    await expect(finishWorkout(coach.id, workoutId, { effort: 7, note: "" }, database)).rejects.toThrow(refused)
    await expect(deleteWorkout(coach.id, workoutId, database)).rejects.toThrow(refused)

    const after = await loadWorkout(anna.id, workoutId, database)
    expect(after.exercises[0].sets[0].done).toBe(false)
    expect(after.finishedAt).toBeNull()
    expect(after.note).toBe("")
  })

  it("can't start one for the client", async () => {
    const plan = await loadWeek(programId, database)
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 28) }, database)
    const refused = FITNESS_ERRORS.notYourWorkout
    await expect(startWorkout(coach.id, { from: "day", dayId: plan[1].id }, database)).rejects.toThrow(refused)
    await expect(startWorkout(coach.id, { from: "scheduled", scheduledId: days[0].id }, database)).rejects.toThrow(refused)
    await expect(startWorkout(coach.id, { from: "repeat", workoutId }, database)).rejects.toThrow(
      FITNESS_ERRORS.notYourWorkout
    )
  })

  it("leaves the client free to do all of it", async () => {
    const workout = await loadWorkout(anna.id, workoutId, database)
    await saveSet(anna.id, workout.exercises[0].sets[0].id, { done: true, reps: 5 }, database)
    const summary = await finishWorkout(anna.id, workoutId, { effort: 7, note: "" }, database)
    expect(summary.workoutId).toBe(workoutId)
    await deleteWorkout(anna.id, workoutId, database)
    expect(await loadHistory(anna.id, anna.id, database)).toHaveLength(0)
  })
})
