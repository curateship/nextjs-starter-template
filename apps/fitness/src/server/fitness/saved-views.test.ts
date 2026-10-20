import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { CustomShellDb } from "@/server/db"
import { answerCoach, inviteClient } from "@/server/fitness/coach"
import { createProgram } from "@/server/fitness/programs"
import { SAVED_VIEW_LIMIT, deleteView, listSavedViews, saveView } from "@/server/fitness/saved-views"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * A saved History view belongs to the person who saved it, on one program.
 * Their coach keeps views of their own on the same program, and a stranger
 * can't list, save or delete any.
 */

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let coach: CustomShellUser
let stranger: CustomShellUser
let programId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  coach = await insertUser(database, { name: "Cleo", email: "cleo@example.test", role: "coach" })
  stranger = await insertUser(database, { name: "Sam", email: "sam@example.test" })
  await inviteClient(coach.id, "anna@example.test", database)
  await answerCoach(anna.id, coach.id, true, database)
  programId = (await createProgram(anna.id, anna.id, { name: "Strong", routineType: "strength" }, database)).id
})

afterEach(async () => {
  await client.close()
})

describe("saved History views", () => {
  it("keeps each person's views to themselves on the program", async () => {
    await saveView(anna.id, programId, "  Leg days  ", { name: "Legs", group: "month" }, database)
    await saveView(coach.id, programId, "Unfinished", { status: "unfinished" }, database)

    const annas = await listSavedViews(anna.id, programId, database)
    expect(annas).toEqual([{ id: expect.any(String), name: "Leg days", filters: { name: "Legs", group: "month" } }])
    expect((await listSavedViews(coach.id, programId, database)).map((view) => view.name)).toEqual(["Unfinished"])
  })

  it("refuses a stranger and a view without a name", async () => {
    const missing = FITNESS_ERRORS.programNotFound
    await expect(listSavedViews(stranger.id, programId, database)).rejects.toThrow(missing)
    await expect(saveView(stranger.id, programId, "Mine", {}, database)).rejects.toThrow(missing)
    await expect(saveView(anna.id, programId, "   ", {}, database)).rejects.toThrow(FITNESS_ERRORS.nameNeeded)
  })

  it("lets only the owner of a view delete it", async () => {
    const view = await saveView(anna.id, programId, "Leg days", { name: "Legs" }, database)
    await expect(deleteView(coach.id, view.id, database)).rejects.toThrow(FITNESS_ERRORS.viewNotFound)
    await deleteView(anna.id, view.id, database)
    expect(await listSavedViews(anna.id, programId, database)).toEqual([])
  })

  it(`stops at ${SAVED_VIEW_LIMIT} views on one program`, async () => {
    for (let index = 0; index < SAVED_VIEW_LIMIT; index++) {
      await saveView(anna.id, programId, `View ${index}`, {}, database)
    }
    await expect(saveView(anna.id, programId, "One more", {}, database)).rejects.toThrow(FITNESS_ERRORS.tooManyViews)
  })
})
