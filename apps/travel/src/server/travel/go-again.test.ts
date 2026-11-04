import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { spendingByType, tripTotals } from "@/lib/travel/budget"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { addGoAgainToTrip, listGoAgain } from "@/server/travel/saved-places"
import { binActivities, binTrip, createActivity, createTrip, loadTripPage, markActivitiesDone, updateActivity } from "@/server/travel/trips"
import { listTypes } from "@/server/travel/types"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
  ben = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

async function trip(name: string) {
  return (await createTrip(anna.id, { name, days: 3, currency: "JPY", startDate: null }, database)).id
}

describe("Go again (More Travel features part 14)", () => {
  it("lists ticked places from every trip, leaving out the bin and other people's", async () => {
    const tokyo = await trip("Tokyo")
    const ramen = await createActivity(anna.id, { tripId: tokyo, day: 2, title: "Fuunji" }, database)
    await updateActivity(anna.id, { activityId: ramen.id, goAgain: true, notes: "" }, database)
    const binned = await createActivity(anna.id, { tripId: tokyo, day: 1, title: "Binned" }, database)
    await updateActivity(anna.id, { activityId: binned.id, goAgain: true }, database)
    await binActivities(anna.id, [binned.id], database)
    await createActivity(anna.id, { tripId: tokyo, day: 1, title: "Not ticked" }, database)
    const gone = await trip("Gone")
    const old = await createActivity(anna.id, { tripId: gone, day: 1, title: "On a binned trip" }, database)
    await updateActivity(anna.id, { activityId: old.id, goAgain: true }, database)
    await binTrip(anna.id, gone, database)

    expect(await listGoAgain(anna.id, database)).toEqual([
      expect.objectContaining({ id: ramen.id, title: "Fuunji", tripId: tokyo, tripName: "Tokyo", day: 2 }),
    ])
    expect(await listGoAgain(ben.id, database)).toEqual([])
  })

  it("adds a copy to another trip's Ideas, but never one already there or an unticked card", async () => {
    const tokyo = await trip("Tokyo")
    const ramen = await createActivity(anna.id, { tripId: tokyo, day: 2, title: "Fuunji", costCents: 120000 }, database)
    await updateActivity(anna.id, { activityId: ramen.id, goAgain: true, rating: 5, done: true }, database)
    const again = await trip("Tokyo again")
    const { id } = await addGoAgainToTrip(anna.id, { tripId: again, activityId: ramen.id }, database)
    const copy = (await loadTripPage(anna.id, again, database)).activities.find((item) => item.id === id)!
    expect(copy).toMatchObject({ title: "Fuunji", day: null, done: false, rating: null, goAgain: false, costCents: null })
    await expect(addGoAgainToTrip(anna.id, { tripId: again, activityId: ramen.id }, database)).rejects.toThrow(
      "Fuunji is already on Ideas."
    )
    const plain = await createActivity(anna.id, { tripId: tokyo, day: 1, title: "Plain" }, database)
    await expect(addGoAgainToTrip(anna.id, { tripId: again, activityId: plain.id }, database)).rejects.toThrow(
      TRAVEL_ERRORS.activityNotFound
    )
    await expect(addGoAgainToTrip(ben.id, { tripId: again, activityId: ramen.id }, database)).rejects.toThrow(
      TRAVEL_ERRORS.tripNotFound
    )
  })
})

describe("Mass select's Mark done (More Travel features part 12)", () => {
  it("marks every ticked card in one go, and skips cards that aren't the person's", async () => {
    const tokyo = await trip("Tokyo")
    const a = await createActivity(anna.id, { tripId: tokyo, day: 1, title: "A" }, database)
    const b = await createActivity(anna.id, { tripId: tokyo, day: 2, title: "B" }, database)
    const bens = await createTrip(ben.id, { name: "Ben's", days: 1, currency: "USD", startDate: null }, database)
    const other = await createActivity(ben.id, { tripId: bens.id, day: 1, title: "Ben's card" }, database)
    expect(await markActivitiesDone(anna.id, { activityIds: [a.id, b.id, other.id], done: true }, database)).toEqual({
      changed: 2,
      skipped: 1,
    })
    expect((await loadTripPage(anna.id, tokyo, database)).activities.every((item) => item.done)).toBe(true)
    expect((await loadTripPage(ben.id, bens.id, database)).activities[0].done).toBe(false)
    // The same card twice counts once.
    expect(await markActivitiesDone(anna.id, { activityIds: [a.id, a.id], done: false }, database)).toEqual({ changed: 1, skipped: 0 })
    expect((await loadTripPage(anna.id, tokyo, database)).activities.find((item) => item.id === a.id)!.done).toBe(false)
  })
})

describe("spending by type (More Travel features part 13)", () => {
  it("adds the days' costs up by type, biggest first, with no type and removed types under Other", async () => {
    const types = await listTypes(anna.id, database)
    const of = (builtin: string) => types.find((type) => type.builtin === builtin)!.id
    const cards = [
      { day: 1, costCents: 900_00, typeId: of("hotel") },
      { day: 2, costCents: 300_00, typeId: of("food") },
      { day: 3, costCents: 120_00, typeId: of("food") },
      { day: 1, costCents: 50_00, typeId: null },
      { day: 2, costCents: 25_00, typeId: "removed-type" },
      { day: null, costCents: 999_00, typeId: of("sight") },
    ]
    const { total, perType } = tripTotals(3, cards)
    const rows = spendingByType(perType, types)
    expect(rows.map((row) => [row.type?.name, row.cents])).toEqual([
      ["Hotel", 900_00],
      ["Food", 420_00],
      ["Other", 75_00],
    ])
    // By type adds up to the same total as By day; Ideas stay out of both.
    expect(rows.reduce((sum, row) => sum + row.cents, 0)).toBe(total)
  })
})
