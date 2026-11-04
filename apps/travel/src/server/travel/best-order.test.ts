import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { bestOrderForDay, type RouteMinutes } from "@/server/travel/best-order"
import { createActivity, createTrip, loadTripPage, updateActivity } from "@/server/travel/trips"
import { boardColumns } from "@/lib/travel/board"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database, { name: "Anna" })
  ben = await insertUser(database, { name: "Ben" })
})

afterEach(async () => {
  await client.close()
})

/** Every place sits on one street, at `lng` minutes from its start, so a walk is the gap between two numbers. */
const street: RouteMinutes = async (from, to) => Math.round(Math.abs(from.lng - to.lng) * 1000)

async function placed(tripId: string, day: number, title: string, at: number, extra: Record<string, unknown> = {}) {
  const { id } = await createActivity(anna.id, { tripId, day, title }, database)
  await updateActivity(
    anna.id,
    { activityId: id, place: { name: title, address: "", lat: 35, lng: at / 1000, placeId: null }, ...extra },
    database
  )
  return id
}

async function dayTitles(tripId: string, day: number) {
  const page = await loadTripPage(anna.id, tripId, database)
  return boardColumns(page.trip.days, page.activities).get(`day-${day}`)!.map((activity) => activity.title)
}

describe("best order for a day (Travel features part 5)", () => {
  it("orders the untimed cards for the shortest walk from the hotel, leaving timed cards where they are", async () => {
    const { id: tripId } = await createTrip(anna.id, { name: "Tokyo", days: 3, currency: "JPY", startDate: null, destination: "Tokyo" }, database)
    await placed(tripId, 1, "Hotel", 0, { nights: 3 })
    await placed(tripId, 2, "Far", 30)
    await placed(tripId, 2, "Near", 10)
    await placed(tripId, 2, "Lunch", 25, { startTime: "12:30" })
    await placed(tripId, 2, "Middle", 20)

    const asked: string[] = []
    const minutes: RouteMinutes = async (from, to, mode) => {
      asked.push(mode)
      return street(from, to, mode)
    }
    const result = await bestOrderForDay(anna.id, { tripId, day: 2 }, { database, minutes })
    // The lunch has a time, so it stays first; the three sights go out from the hotel and back.
    const titles = await dayTitles(tripId, 2)
    expect(titles[0]).toBe("Lunch")
    expect([["Near", "Middle", "Far"], ["Far", "Middle", "Near"]]).toContainEqual(titles.slice(1))
    expect(result).toEqual({ ordered: 3, savedMinutes: 20, from: "stay", missing: 0 })
    // Three sights and a hotel are six pairs, asked once each, walking (the trip's way of getting around).
    expect(asked).toHaveLength(6)
    expect(new Set(asked)).toEqual(new Set(["walk"]))
  })

  it("keeps the first card first with no hotel, and leaves cards with no place after the rest", async () => {
    const { id: tripId } = await createTrip(anna.id, { name: "Kyoto", days: 1, currency: "JPY", startDate: null, destination: "Kyoto" }, database)
    await placed(tripId, 1, "Start", 20)
    await createActivity(anna.id, { tripId, day: 1, title: "Somewhere" }, database)
    await placed(tripId, 1, "Up", 40)
    await placed(tripId, 1, "Down", 10)
    await placed(tripId, 1, "Up a bit", 30)
    const result = await bestOrderForDay(anna.id, { tripId, day: 1 }, { database, minutes: street })
    expect(await dayTitles(tripId, 1)).toEqual(["Start", "Down", "Up a bit", "Up", "Somewhere"])
    expect(result.from).toBe("first")
  })

  it("asks nothing for a day with fewer than two cards to order", async () => {
    const { id: tripId } = await createTrip(anna.id, { name: "Short", days: 2, currency: "USD", startDate: null, destination: null }, database)
    await placed(tripId, 1, "Only", 10)
    const minutes: RouteMinutes = async () => {
      throw new Error("asked")
    }
    expect(await bestOrderForDay(anna.id, { tripId, day: 1 }, { database, minutes })).toEqual({
      ordered: 1,
      savedMinutes: 0,
      from: "first",
      missing: 0,
    })
  })

  it("says nothing was saved when Google found no route for a pair, and keeps someone else's trip out", async () => {
    const { id: tripId } = await createTrip(anna.id, { name: "Gaps", days: 1, currency: "USD", startDate: null, destination: null }, database)
    await placed(tripId, 1, "A", 10)
    await placed(tripId, 1, "B", 20)
    await placed(tripId, 1, "C", 30)
    const result = await bestOrderForDay(anna.id, { tripId, day: 1 }, { database, minutes: async () => null })
    expect(result.missing).toBe(3)
    expect(result.savedMinutes).toBeNull()
    await expect(bestOrderForDay(ben.id, { tripId, day: 1 }, { database, minutes: street })).rejects.toThrow(
      TRAVEL_ERRORS.tripNotFound
    )
    await expect(bestOrderForDay(anna.id, { tripId, day: 2 }, { database, minutes: street })).rejects.toThrow(
      TRAVEL_ERRORS.dayOutOfRange
    )
  })
})
