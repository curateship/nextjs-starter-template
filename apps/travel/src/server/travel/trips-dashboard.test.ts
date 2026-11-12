import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_TRIPS_WIDGETS } from "@/lib/travel/trips-widgets"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  addSavedPlaceToTrip,
  changeSavedPlaces,
  createSavedPlace,
  emptySavedPlacesBin,
  listSavedPlaces,
} from "@/server/travel/saved-places"
import {
  countSavedPlaces,
  getTripsPage,
  getTripsSections,
  getTripsWidgets,
  listTripPlaces,
  loadTripsOverview,
  saveTripsPageBody,
  saveTripsSections,
  saveTripsWidgets,
  setTripsPageLock,
} from "@/server/travel/trips-dashboard"
import { createActivity, createTrip, loadTripPage, loadTripsPage, updateActivity } from "@/server/travel/trips"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let tripId: string

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
  ben = await insertUser(database)
  ;({ id: tripId } = await createTrip(anna.id, { name: "Kyoto", days: 3, currency: "JPY", startDate: null }, database))
})

afterEach(async () => {
  await client.close()
})

const place = (title: string) => ({ title, typeId: null, place: null, website: null, phone: null })

describe("the Trips dashboard's left page", () => {
  it("starts with the Dashboards and Tags blocks, and keeps the Dashboards block whatever is saved", async () => {
    const first = JSON.parse((await getTripsPage(anna.id, database)).body)
    expect(first.content.map((node: { type: string }) => node.type)).toEqual(["noteTripsSections", "noteTripsTags", "paragraph"])

    const typed = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Next: Lisbon" }] }] }
    await saveTripsPageBody(anna.id, JSON.stringify(typed), database)
    const saved = JSON.parse((await getTripsPage(anna.id, database)).body)
    expect(saved.content.map((node: { type: string }) => node.type)).toEqual(["noteTripsSections", "paragraph"])
    // Each person's page is their own.
    expect(JSON.parse((await getTripsPage(ben.id, database)).body).content).toHaveLength(3)
  })

  it("refuses to save a locked page", async () => {
    await setTripsPageLock(anna.id, true, database)
    await expect(saveTripsPageBody(anna.id, JSON.stringify({ type: "doc", content: [] }), database)).rejects.toThrow(
      TRAVEL_ERRORS.tripsPageLocked
    )
  })

  it("keeps the sections hidden and their order, and never Overview", async () => {
    expect(await getTripsSections(anna.id, database)).toEqual({ hidden: [], order: [] })
    await saveTripsSections(anna.id, { hidden: ["places"], order: ["places", "trips"] }, database)
    expect(await getTripsSections(anna.id, database)).toEqual({ hidden: ["places"], order: ["places", "trips"] })
  })

  it("starts Overview with its own widgets and cleans a saved layout", async () => {
    expect(await getTripsWidgets(anna.id, database)).toEqual(DEFAULT_TRIPS_WIDGETS)
    const saved = await saveTripsWidgets(
      anna.id,
      { top: { columns: 2, spots: ["map", "map"] }, bottom: { columns: 1, spots: ["not-a-widget"] } },
      database
    )
    // A widget shows once, and one nobody knows is emptied.
    expect(saved).toEqual({ top: { columns: 2, spots: ["map", null] }, bottom: { columns: 1, spots: [null] } })
    expect(await getTripsWidgets(anna.id, database)).toEqual(saved)
  })
})

describe("saved places in Places", () => {
  it("makes one, bins it, puts it back and deletes it for good, skipping someone else's", async () => {
    const { id } = await createSavedPlace(anna.id, place("Okutan"), database)
    const { id: bens } = await createSavedPlace(ben.id, place("Ben's"), database)
    expect(await countSavedPlaces(anna.id, database)).toBe(1)

    expect(await changeSavedPlaces(anna.id, { ids: [id, bens], change: "bin" }, database)).toEqual({ done: [id], skipped: [bens] })
    expect(await listSavedPlaces(anna.id, database)).toEqual([])
    expect((await listSavedPlaces(anna.id, database, { inBin: true })).map((each) => each.id)).toEqual([id])
    expect(await countSavedPlaces(anna.id, database)).toBe(0)
    // A place in the bin can't be added to a trip.
    await expect(addSavedPlaceToTrip(anna.id, { tripId, savedPlaceId: id }, database)).rejects.toThrow(TRAVEL_ERRORS.savedPlaceNotFound)

    await changeSavedPlaces(anna.id, { ids: [id], change: "restore" }, database)
    expect((await listSavedPlaces(anna.id, database)).map((each) => each.id)).toEqual([id])
    // Delete for good only takes what is in the bin.
    expect(await changeSavedPlaces(anna.id, { ids: [id], change: "purge" }, database)).toEqual({ done: [], skipped: [id] })
    await changeSavedPlaces(anna.id, { ids: [id], change: "bin" }, database)
    await changeSavedPlaces(anna.id, { ids: [id], change: "purge" }, database)
    expect(await listSavedPlaces(anna.id, database, { inBin: true })).toEqual([])
  })

  it("empties places in the bin more than 30 days", async () => {
    const { id } = await createSavedPlace(anna.id, place("Okutan"), database)
    await changeSavedPlaces(anna.id, { ids: [id], change: "bin" }, database)
    await emptySavedPlacesBin(anna.id, database, new Date(Date.now() + 29 * 86_400_000))
    expect(await listSavedPlaces(anna.id, database, { inBin: true })).toHaveLength(1)
    await emptySavedPlacesBin(anna.id, database, new Date(Date.now() + 31 * 86_400_000))
    expect(await listSavedPlaces(anna.id, database, { inBin: true })).toHaveLength(0)
  })

  it("adds a copy to the end of the day picked, and refuses a day the trip hasn't got", async () => {
    const { id } = await createSavedPlace(anna.id, place("Okutan"), database)
    await createActivity(anna.id, { tripId, day: 2, title: "Temple" }, database)
    const copy = await addSavedPlaceToTrip(anna.id, { tripId, savedPlaceId: id, day: 2 }, database)
    const dayTwo = (await loadTripPage(anna.id, tripId, database)).activities
      .filter((activity) => activity.day === 2)
      .sort((a, b) => a.position - b.position)
    expect(dayTwo.map((activity) => activity.id).at(-1)).toBe(copy.id)

    const { id: second } = await createSavedPlace(anna.id, place("Nanzen-ji"), database)
    await expect(addSavedPlaceToTrip(anna.id, { tripId, savedPlaceId: second, day: 9 }, database)).rejects.toThrow(
      TRAVEL_ERRORS.dayOutOfRange
    )
  })
})

describe("Overview's figures and the places from trips", () => {
  it("lists Must do still to do, Ideas, each trip's money, and cards done or ticked Go again", async () => {
    const { id: must } = await createActivity(anna.id, { tripId, day: 1, title: "Fushimi Inari" }, database)
    await updateActivity(anna.id, { activityId: must, mustDo: true, costCents: 1500 }, database)
    const { id: idea } = await createActivity(anna.id, { tripId, day: null, title: "Tea house" }, database)
    await updateActivity(anna.id, { activityId: idea, costCents: 9900 }, database)
    const { id: done } = await createActivity(anna.id, { tripId, day: 2, title: "Okutan" }, database)
    await updateActivity(anna.id, { activityId: done, done: true, rating: 5 }, database)

    const overview = await loadTripsOverview(anna.id, database)
    expect(overview.mustDo.map((card) => card.title)).toEqual(["Fushimi Inari"])
    expect(overview.ideas.map((card) => card.title)).toEqual(["Tea house"])
    // Ideas' costs aren't planned yet, so they're left out, as the Budget block does.
    expect(overview.money).toEqual([{ tripId, currency: "JPY", plannedCents: 1500, budgetCents: null }])

    const places = await listTripPlaces(anna.id, database)
    expect(places.map((each) => [each.title, each.done, each.rating])).toEqual([["Okutan", true, 5]])
    expect(await listTripPlaces(ben.id, database)).toEqual([])

    // The Trips table's Rating column: the average of the stars given.
    expect((await loadTripsPage(anna.id, database)).trips[0].rating).toBe(5)
  })
})
