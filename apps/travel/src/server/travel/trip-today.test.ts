import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { travelTrips } from "@/server/travel/schema"
import { findTripOnToday } from "@/server/travel/trip-today"
import { binTrip, createTrip, updateTrip } from "@/server/travel/trips"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

/** 3 March 2099, 10 AM in London. */
const AT = new Date("2099-03-03T10:00:00Z")

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
  ben = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

async function trip(startDate: string | null, days: number, timeZone: string | null = null, owner = anna) {
  const { id } = await createTrip(owner.id, { name: "Away", days, currency: "USD", startDate }, database)
  if (timeZone) await updateTrip(owner.id, { tripId: id, timeZone }, database)
  return id
}

describe("the trip that's on today (Travel features 4, part 8)", () => {
  it("finds a trip that started yesterday, and nothing for trips before, after or with no dates", async () => {
    await trip("2099-03-10", 5)
    await trip("2099-02-01", 3)
    await trip(null, 4)
    expect(await findTripOnToday(anna.id, database, AT)).toBeNull()
    const on = await trip("2099-03-02", 4)
    expect(await findTripOnToday(anna.id, database, AT)).toBe(on)
  })

  it("picks the one that started last when two are on", async () => {
    await trip("2099-03-01", 10)
    const later = await trip("2099-03-03", 2)
    expect(await findTripOnToday(anna.id, database, AT)).toBe(later)
  })

  it("reads today where the trip is", async () => {
    // At noon in London on 3 March it is already 1 AM on 4 March in Auckland.
    const noon = new Date("2099-03-03T12:00:00Z")
    const auckland = await trip("2099-03-04", 2, "Pacific/Auckland")
    expect(await findTripOnToday(anna.id, database, noon)).toBe(auckland)
  })

  it("leaves out archived trips, trips in the bin, and someone else's", async () => {
    const archived = await trip("2099-03-02", 4)
    await database.update(travelTrips).set({ archivedAt: AT }).where(eq(travelTrips.id, archived))
    const binned = await trip("2099-03-02", 4)
    await binTrip(anna.id, binned, database)
    await trip("2099-03-02", 4, null, ben)
    expect(await findTripOnToday(anna.id, database, AT)).toBeNull()
  })
})
