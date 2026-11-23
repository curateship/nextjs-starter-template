import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { builtInBySlug } from "@/server/fitness/exercises"
import { createProgram } from "@/server/fitness/programs"
import { addDayExercise, loadWeek, reorderDayExercises, setSuperset, setWeekDay } from "@/server/fitness/week"
import { loadWorkout, startWorkout } from "@/server/fitness/workouts"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * A day's exercises are kept body part by body part, the order the Day view
 * shows (Tyler, 20 Oct 2026), so its numbers and the workout always agree.
 */

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let lifts: Awaited<ReturnType<typeof builtInBySlug>>

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  lifts = await builtInBySlug(database)
})

afterEach(async () => {
  await client.close()
})

async function dayWith(slugs: string[]) {
  const { id: programId } = await createProgram(anna.id, anna.id, { name: "Upper", routineType: "strength" }, database)
  const { id: dayId } = await setWeekDay(anna.id, programId, 1, "Upper", database)
  const ids: Record<string, string> = {}
  for (const slug of slugs) {
    const { id } = await addDayExercise(
      anna.id,
      dayId,
      lifts.get(slug)!.id,
      { sets: 3, reps: 8, weightKg: 20, restSeconds: 90 },
      database
    )
    ids[slug] = id
  }
  return { programId, dayId, ids }
}

async function slugsOf(programId: string) {
  const [day] = await loadWeek(programId, database)
  const bySlugId = new Map([...lifts.entries()].map(([slug, lift]) => [lift.id, slug]))
  return day.exercises.map((row) => bySlugId.get(row.exerciseId))
}

describe("a day's order", () => {
  it("files each new lift at the end of its body part", async () => {
    const { programId } = await dayWith(["bench-press", "barbell-row", "dumbbell-fly", "barbell-curl"])
    expect(await slugsOf(programId)).toEqual(["bench-press", "dumbbell-fly", "barbell-row", "barbell-curl"])
  })

  it("puts an order sent across body parts back into body part order", async () => {
    const { programId, dayId, ids } = await dayWith(["bench-press", "dumbbell-fly", "barbell-row"])
    await reorderDayExercises(anna.id, dayId, [ids["barbell-row"], ids["bench-press"], ids["dumbbell-fly"]], database)
    // Back now comes first, and chest keeps its two lifts together.
    expect(await slugsOf(programId)).toEqual(["barbell-row", "bench-press", "dumbbell-fly"])
  })

  it("keeps a superset together under its first lift's body part", async () => {
    const { programId, ids } = await dayWith(["bench-press", "dumbbell-fly", "barbell-row"])
    // Row joins the fly above it, so it moves up under Chest with its partner.
    await setSuperset(anna.id, ids["barbell-row"], true, database)
    expect(await slugsOf(programId)).toEqual(["bench-press", "dumbbell-fly", "barbell-row"])
    const [day] = await loadWeek(programId, database)
    expect(day.exercises[1].groupKey).not.toBeNull()
    expect(day.exercises[2].groupKey).toBe(day.exercises[1].groupKey)
  })

  it("starts a workout in the order the day shows", async () => {
    const { programId, dayId } = await dayWith(["bench-press", "barbell-row", "dumbbell-fly"])
    const { id } = await startWorkout(anna.id, { from: "day", dayId }, database)
    const workout = await loadWorkout(anna.id, id, database)
    expect(workout.exercises.map((exercise) => exercise.exerciseId)).toEqual(
      ["bench-press", "dumbbell-fly", "barbell-row"].map((slug) => lifts.get(slug)!.id)
    )
    expect(await slugsOf(programId)).toEqual(["bench-press", "dumbbell-fly", "barbell-row"])
  })
})
