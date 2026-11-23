import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { GOOGLE_DAILY_LOOKUPS, loadGoogleUse, spendGoogleLookup } from "@/server/travel/google-usage"
import { travelGoogleLookups } from "@/server/travel/schema"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

const MORNING = new Date("2099-03-04T08:00:00Z")
const NEXT_DAY = new Date("2099-03-05T00:00:01Z")

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database, { name: "Anna", email: "anna@example.com" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.com" })
})

afterEach(async () => {
  await client.close()
})

describe("Google lookups a day (Travel features 4, part 4)", () => {
  it("allows 100 a day, refuses the 101st, and starts again the next day", async () => {
    await database.insert(travelGoogleLookups).values({ userId: anna.id, day: "2099-03-04", lookups: GOOGLE_DAILY_LOOKUPS - 1 })
    await spendGoogleLookup(anna.id, database, MORNING)
    await expect(spendGoogleLookup(anna.id, database, MORNING)).rejects.toThrow(TRAVEL_ERRORS.googleLimit)
    // Someone else's lookups are their own.
    await spendGoogleLookup(ben.id, database, MORNING)
    await spendGoogleLookup(anna.id, database, NEXT_DAY)
    const use = await loadGoogleUse(database, NEXT_DAY)
    expect(use.today).toBe(1)
  })

  it("never lets two lookups at once both take the last one", async () => {
    await database.insert(travelGoogleLookups).values({ userId: anna.id, day: "2099-03-04", lookups: GOOGLE_DAILY_LOOKUPS - 1 })
    const results = await Promise.allSettled([spendGoogleLookup(anna.id, database, MORNING), spendGoogleLookup(anna.id, database, MORNING)])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  })

  it("adds up today, the month, and the five people who used the most this month", async () => {
    await database.insert(travelGoogleLookups).values([
      { userId: anna.id, day: "2099-03-04", lookups: 7 },
      { userId: anna.id, day: "2099-03-01", lookups: 20 },
      { userId: ben.id, day: "2099-03-04", lookups: 3 },
      // Last month counts for neither.
      { userId: ben.id, day: "2099-02-28", lookups: 90 },
    ])
    const use = await loadGoogleUse(database, MORNING)
    expect(use.today).toBe(10)
    expect(use.month).toBe(30)
    expect(use.top).toEqual([
      { name: "Anna", email: "anna@example.com", lookups: 27 },
      { name: "Ben", email: "ben@example.com", lookups: 3 },
    ])
  })

  it("reads zero with no lookups at all", async () => {
    expect(await loadGoogleUse(database, MORNING)).toEqual({ today: 0, month: 0, top: [] })
  })
})
