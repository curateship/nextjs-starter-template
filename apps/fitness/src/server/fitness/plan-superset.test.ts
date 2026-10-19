import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { builtInBySlug } from "@/server/fitness/exercises"
import { addDayExercise, loadWeek, setSuperset, setWeekDay } from "@/server/fitness/week"
import { createProgram } from "@/server/fitness/programs"
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

/** A day with four lifts in order, returning their plan ids. */
async function dayOfFour() {
  const { id: programId } = await createProgram(anna.id, anna.id, { name: "Arms", routineType: "strength" }, database)
  const { id: dayId } = await setWeekDay(anna.id, programId, 1, "Arms", database)
  const lifts = await builtInBySlug(database)
  const ids: string[] = []
  for (const slug of ["barbell-curl", "triceps-pushdown", "hammer-curl", "skull-crusher"]) {
    const { id } = await addDayExercise(
      anna.id,
      dayId,
      lifts.get(slug)!.id,
      { sets: 3, reps: 10, weightKg: 20, restSeconds: 60 },
      database
    )
    ids.push(id)
  }
  return { programId, ids }
}

async function keys(programId: string) {
  const [day] = await loadWeek(programId, database)
  return day.exercises.map((exercise) => exercise.groupKey)
}

describe("supersets", () => {
  it("joins three lifts into one group", async () => {
    const { programId, ids } = await dayOfFour()
    await setSuperset(anna.id, ids[1], true, database)
    await setSuperset(anna.id, ids[2], true, database)
    const [a, b, c, d] = await keys(programId)
    expect(a).not.toBeNull()
    expect([b, c]).toEqual([a, a])
    expect(d).toBeNull()
  })

  it("taking out the middle lift leaves neither end joined", async () => {
    const { programId, ids } = await dayOfFour()
    await setSuperset(anna.id, ids[1], true, database)
    await setSuperset(anna.id, ids[2], true, database)
    await setSuperset(anna.id, ids[1], false, database)
    expect(await keys(programId)).toEqual([null, null, null, null])
  })

  it("splits a run of four into two pairs when a middle lift leaves the top pair", async () => {
    const { programId, ids } = await dayOfFour()
    for (const id of ids.slice(1)) await setSuperset(anna.id, id, true, database)
    // Taking out the second lift: the first is left alone, the last two stay a pair of their own.
    await setSuperset(anna.id, ids[1], false, database)
    const [a, b, c, d] = await keys(programId)
    expect([a, b]).toEqual([null, null])
    expect(c).not.toBeNull()
    expect(d).toBe(c)
  })

  it("joining a lift that leads a pair below brings the pair along", async () => {
    const { programId, ids } = await dayOfFour()
    await setSuperset(anna.id, ids[3], true, database)
    await setSuperset(anna.id, ids[2], true, database)
    const [, b, c, d] = await keys(programId)
    expect(b).not.toBeNull()
    expect([c, d]).toEqual([b, b])
  })
})
