import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { beenHereText } from "@/lib/travel/been-here"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { loadVisitedPins } from "@/server/travel/trip-admin"
import { binActivities, binTrip, createActivity, createTrip, loadTripPage, updateActivity } from "@/server/travel/trips"

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

const fuunji = { name: "Fuunji", address: "2-14-3 Yoyogi", lat: 35.68, lng: 139.69, placeId: "g-fuunji" }

async function trip(owner: CustomShellUser, name: string, startDate: string | null = null) {
  return (await createTrip(owner.id, { name, days: 3, currency: "JPY", startDate }, database)).id
}

async function card(owner: CustomShellUser, tripId: string, title: string, patch: Record<string, unknown> = {}) {
  const made = await createActivity(owner.id, { tripId, day: 2, title }, database)
  if (Object.keys(patch).length) await updateActivity(owner.id, { activityId: made.id, ...patch }, database)
  return made.id
}

describe("Been here before (Travel features 3, part 10)", () => {
  it("marks a card whose place was done on another trip, latest visit first", async () => {
    const march = await trip(anna, "Tokyo", "2026-03-10")
    const may = await trip(anna, "Tokyo again", "2026-05-01")
    await card(anna, march, "Ramen", { place: fuunji, done: true, rating: 4 })
    const latest = await card(anna, may, "Fuunji ramen", { place: fuunji, done: true, rating: 2 })
    const now = await trip(anna, "Tokyo 3")
    const here = await card(anna, now, "Lunch at Fuunji", { place: fuunji })

    const { beenHere } = await loadTripPage(anna.id, now, database)
    expect(beenHere).toEqual([
      { activityId: here, tripId: may, tripName: "Tokyo again", visitId: latest, date: "2026-05-02", rating: 2, more: 1 },
    ])
    expect(beenHereText(beenHere[0])).toBe("Been here: Tokyo again, May 2026, you gave it 2 of 5, and 1 more time")
  })

  it("leaves out cards with no place, cards not done, the bin, this trip and other people's trips", async () => {
    const old = await trip(anna, "Old")
    await card(anna, old, "Lunch", { done: true })
    await card(anna, old, "Not done", { place: { ...fuunji, placeId: "g-other", name: "Other" } })
    const binnedCard = await card(anna, old, "Binned", { place: { ...fuunji, placeId: "g-binned", name: "Binned" }, done: true })
    await binActivities(anna.id, [binnedCard], database)
    const gone = await trip(anna, "Gone")
    await card(anna, gone, "Gone", { place: { ...fuunji, placeId: "g-gone", name: "Gone" }, done: true })
    await binTrip(anna.id, gone, database)
    const bens = await trip(ben, "Ben's")
    await card(ben, bens, "Ben's Fuunji", { place: fuunji, done: true })

    const now = await trip(anna, "Now")
    await card(anna, now, "Lunch")
    await card(anna, now, "Other", { place: { ...fuunji, placeId: "g-other", name: "Other" } })
    await card(anna, now, "Binned", { place: { ...fuunji, placeId: "g-binned", name: "Binned" } })
    await card(anna, now, "Gone", { place: { ...fuunji, placeId: "g-gone", name: "Gone" } })
    // Done on this same trip is not "been here before".
    await card(anna, now, "Fuunji", { place: fuunji, done: true })
    expect((await loadTripPage(anna.id, now, database)).beenHere).toEqual([])
  })

  it("matches by place name when a place has no Google id, and leaves out the date on an undated trip", async () => {
    const old = await trip(anna, "Old")
    await card(anna, old, "Ramen", { place: { ...fuunji, placeId: null }, done: true })
    const now = await trip(anna, "Now")
    await card(anna, now, "Ramen night", { place: { ...fuunji, placeId: null } })
    const [visit] = (await loadTripPage(anna.id, now, database)).beenHere
    expect(beenHereText(visit)).toBe("Been here: Old")
  })
})

describe("Places I've been on the Trips map (Travel features 3, part 12)", () => {
  it("pins every place marked Done with a map position, leaving out the bin and other people's", async () => {
    const tokyo = await trip(anna, "Tokyo")
    const ramen = await card(anna, tokyo, "Fuunji", { place: fuunji, done: true, rating: 5 })
    await card(anna, tokyo, "Not done", { place: { ...fuunji, placeId: "g-2", name: "Two" } })
    await card(anna, tokyo, "No position", { place: { ...fuunji, placeId: "g-3", name: "Three", lat: null, lng: null }, done: true })
    const binned = await card(anna, tokyo, "Binned", { place: { ...fuunji, placeId: "g-4", name: "Four" }, done: true })
    await binActivities(anna.id, [binned], database)
    const gone = await trip(anna, "Gone")
    await card(anna, gone, "On a binned trip", { place: fuunji, done: true })
    await binTrip(anna.id, gone, database)
    const bens = await trip(ben, "Ben's")
    await card(ben, bens, "Ben's", { place: fuunji, done: true })

    expect(await loadVisitedPins(anna.id, database)).toEqual([
      { activityId: ramen, title: "Fuunji", tripId: tokyo, tripName: "Tokyo", rating: 5, lat: fuunji.lat, lng: fuunji.lng },
    ])
  })
})
