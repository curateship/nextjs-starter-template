import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { travelTrips } from "@/server/travel/schema"
import { guessTripTimeZone } from "@/server/travel/trip-time-zone"
import { createTrip, updateTrip } from "@/server/travel/trips"
import { findPlace, forgetWeather, type Point } from "@/server/travel/weather"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
})

afterEach(async () => {
  await client.close()
  vi.unstubAllGlobals()
  forgetWeather()
})

const ZONES: Record<string, string> = { Tokyo: "Asia/Tokyo", Lisbon: "Europe/Lisbon" }

/** A place search that knows Tokyo and Lisbon, remembering what it was asked. */
function places() {
  const asked: string[] = []
  const find = async (name: string): Promise<Point | null> => {
    asked.push(name)
    const timeZone = ZONES[name] ?? null
    return timeZone ? { latitude: 0, longitude: 0, countryCode: null, timeZone } : null
  }
  return { find, asked }
}

async function zoneOf(tripId: string) {
  const [row] = await database
    .select({ timeZone: travelTrips.timeZone, guessed: travelTrips.timeZoneGuessed })
    .from(travelTrips)
    .where(eq(travelTrips.id, tripId))
  return row
}

async function newTrip(destination: string) {
  const { id } = await createTrip(anna.id, { name: "Away", destination, days: 3, currency: "USD", startDate: null }, database)
  return id
}

describe("guessTripTimeZone", () => {
  it("fills a new trip's time zone from its destination", async () => {
    const id = await newTrip("Tokyo")
    await guessTripTimeZone(anna.id, id, places().find, database)
    expect(await zoneOf(id)).toEqual({ timeZone: "Asia/Tokyo", guessed: true })
  })

  it("changes a guessed time zone when the destination changes", async () => {
    const id = await newTrip("Tokyo")
    const { find } = places()
    await guessTripTimeZone(anna.id, id, find, database)
    await updateTrip(anna.id, { tripId: id, destination: "Lisbon" }, database)
    await guessTripTimeZone(anna.id, id, find, database)
    expect(await zoneOf(id)).toEqual({ timeZone: "Europe/Lisbon", guessed: true })
  })

  it("never changes a time zone picked in Trip settings", async () => {
    const id = await newTrip("Tokyo")
    const { find, asked } = places()
    await guessTripTimeZone(anna.id, id, find, database)
    await updateTrip(anna.id, { tripId: id, timeZone: "America/New_York" }, database)
    await updateTrip(anna.id, { tripId: id, destination: "Lisbon" }, database)
    await guessTripTimeZone(anna.id, id, find, database)
    expect(await zoneOf(id)).toEqual({ timeZone: "America/New_York", guessed: false })
    expect(asked).toEqual(["Tokyo"])
  })

  it("leaves the time zone as it was when the destination can't be placed", async () => {
    const id = await newTrip("Tokyo")
    const { find } = places()
    await guessTripTimeZone(anna.id, id, find, database)
    await updateTrip(anna.id, { tripId: id, destination: "Nowhere at all" }, database)
    await guessTripTimeZone(anna.id, id, find, database)
    expect(await zoneOf(id)).toEqual({ timeZone: "Asia/Tokyo", guessed: true })
  })

  it("asks nothing for a trip with no destination", async () => {
    const { id } = await createTrip(anna.id, { name: "Away", destination: "", days: 3, currency: "USD", startDate: null }, database)
    const { find, asked } = places()
    await guessTripTimeZone(anna.id, id, find, database)
    expect(asked).toEqual([])
    expect(await zoneOf(id)).toEqual({ timeZone: null, guessed: false })
  })
})

describe("findPlace's time zone", () => {
  it("keeps a real time zone from the place search and drops one Intl doesn't know", async () => {
    const answer = (timezone: string) =>
      new Response(JSON.stringify({ results: [{ latitude: 35.7, longitude: 139.7, country_code: "JP", timezone }] }))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(answer("Asia/Tokyo")).mockResolvedValueOnce(answer("Mars/Olympus")))
    expect((await findPlace("Tokyo"))?.timeZone).toBe("Asia/Tokyo")
    expect((await findPlace("Olympus"))?.timeZone).toBeNull()
  })
})
