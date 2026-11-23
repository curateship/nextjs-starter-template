import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { addDays } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { CustomShellDb } from "@/server/db"
import { loadCalendar, moveScheduled, todayFor } from "@/server/fitness/calendar"
import { createExercise } from "@/server/fitness/exercises"
import { createProgram } from "@/server/fitness/programs"
import { fitnessWorkouts } from "@/server/fitness/schema"
import { addDayExercise, applyTemplate, restWeekDay, setWeekDay } from "@/server/fitness/week"
import { addExerciseToWorkout, finishWorkout, loadWorkout, saveSet, startWorkout } from "@/server/fitness/workouts"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
})

afterEach(async () => {
  await client.close()
})

/** A 5x5 week (Mon A, Wed B, Fri A) and its calendar for the next four weeks. */
async function fiveByFive() {
  const { id } = await createProgram(anna.id, anna.id, { name: "Strong", routineType: "strength" }, database)
  await applyTemplate(anna.id, id, "five-by-five", database)
  const today = await todayFor(anna.id, database)
  const calendar = () => loadCalendar(anna.id, id, { from: today, to: addDays(today, 27) }, database)
  return { programId: id, today, calendar }
}

describe("the calendar when the week changes", () => {
  it("keeps a started workout on its date", async () => {
    const { programId, calendar } = await fiveByFive()
    const [first] = (await calendar()).days
    const { id: workoutId } = await startWorkout(anna.id, { from: "scheduled", scheduledId: first.id }, database)

    await setWeekDay(anna.id, programId, 6, "Extra", database)

    const after = (await calendar()).days.find((day) => day.day === first.day)
    expect(after?.id).toBe(first.id)
    expect(after?.workoutId).toBe(workoutId)
    const [workout] = await database
      .select({ scheduledId: fitnessWorkouts.scheduledId })
      .from(fitnessWorkouts)
      .where(eq(fitnessWorkouts.id, workoutId))
    expect(workout.scheduledId).toBe(first.id)
  })

  it("never lays a moved workout back onto the date it left", async () => {
    const { programId, calendar } = await fiveByFive()
    const [first] = (await calendar()).days
    // Mon, Wed and Fri train, so the day after any of them is free.
    const nextDay = addDays(first.day, 1)
    await moveScheduled(anna.id, first.id, nextDay, database)

    await setWeekDay(anna.id, programId, 0, "Extra", database)

    const days = (await calendar()).days
    expect(days.filter((day) => day.day === first.day)).toEqual([])
    expect(days.find((day) => day.day === nextDay)).toMatchObject({ id: first.id, moved: true })
  })

  it("keeps a finished workout when its weekday becomes a rest day", async () => {
    const { calendar } = await fiveByFive()
    const [first] = (await calendar()).days
    const { id: workoutId } = await startWorkout(anna.id, { from: "scheduled", scheduledId: first.id }, database)
    const workout = await loadWorkout(anna.id, workoutId, database)
    await saveSet(anna.id, workout.exercises[0].sets[0].id, { done: true }, database)
    await finishWorkout(anna.id, workoutId, { effort: null, note: "" }, database)

    await restWeekDay(anna.id, first.dayId!, database)

    const days = (await calendar()).days
    expect(days.find((day) => day.day === first.day)).toMatchObject({
      id: first.id,
      dayId: null,
      dayName: first.dayName,
      status: "done",
    })
    // The rest of that weekday's dates are gone; the other weekdays stay.
    const sameWeekday = [7, 14, 21].map((offset) => addDays(first.day, offset))
    expect(days.filter((day) => sameWeekday.includes(day.day))).toEqual([])
    expect(days.length).toBeGreaterThan(1)
  })
})

describe("routine types", () => {
  it("keeps a program to lifts of its own routine type", async () => {
    const { calendar } = await fiveByFive()
    const [first] = (await calendar()).days
    const handstand = await createExercise(
      anna.id,
      {
        name: "Handstand push-up",
        routineType: "calisthenics",
        muscles: [],
        equipment: [],
        movement: "isolation",
        isBodyweight: true,
        isTimed: false,
        pictureUrl: null,
      },
      database
    )
    await expect(
      addDayExercise(anna.id, first.dayId!, handstand.id, { sets: 3, reps: 5, weightKg: 0, restSeconds: 90 }, database)
    ).rejects.toThrow(FITNESS_ERRORS.wrongRoutineType)
    const { id: workoutId } = await startWorkout(anna.id, { from: "scheduled", scheduledId: first.id }, database)
    await expect(addExerciseToWorkout(anna.id, workoutId, handstand.id, database)).rejects.toThrow(
      FITNESS_ERRORS.wrongRoutineType
    )
  })
})
