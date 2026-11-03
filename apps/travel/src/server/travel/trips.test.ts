import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { addDay, copyDay, duplicateActivity, moveActivities, moveDay, removeDay, restoreActivities } from "@/server/travel/days"
import { createTripNote, deleteTripNote, duplicateTripNote, saveTripNote } from "@/server/travel/trip-notes"
import { giveSampleTrip } from "@/server/travel/sample"
import { addSavedPlaceToTrip, saveActivityAsPlace } from "@/server/travel/saved-places"
import { travelActivities, travelTrips } from "@/server/travel/schema"
import { copyTrip, listBin, markEndedTripsDone, restoreFromBin, setTripArchived } from "@/server/travel/trip-admin"
import {
  binActivities,
  createActivity,
  createTrip,
  loadTripPage,
  loadTripsPage,
  moveActivity,
  setDayInfo,
  updateActivity,
  updateTrip,
} from "@/server/travel/trips"
import { deleteType, listTypes } from "@/server/travel/types"

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

async function trip(days = 4, startDate: string | null = null) {
  return (await createTrip(anna.id, { name: "Tokyo", days, currency: "JPY", startDate, destination: "Tokyo" }, database)).id
}

async function add(tripId: string, day: number | null, title: string) {
  return (await createActivity(anna.id, { tripId, day, title }, database)).id
}

async function titlesOn(tripId: string, day: number | null) {
  const page = await loadTripPage(anna.id, tripId, database)
  return page.activities
    .filter((activity) => activity.day === day)
    .sort((a, b) => a.position - b.position)
    .map((activity) => activity.title)
}

describe("who sees a trip", () => {
  it("answers someone else's trip and activity like ones that don't exist", async () => {
    const tripId = await trip()
    const activityId = await add(tripId, 1, "Senso-ji")
    await expect(loadTripPage(ben.id, tripId, database)).rejects.toThrow(TRAVEL_ERRORS.tripNotFound)
    await expect(updateActivity(ben.id, { activityId, title: "Mine now" }, database)).rejects.toThrow(
      TRAVEL_ERRORS.activityNotFound
    )
    await expect(moveActivity(ben.id, { activityId, day: 2, order: [] }, database)).rejects.toThrow(
      TRAVEL_ERRORS.activityNotFound
    )
    expect((await loadTripsPage(ben.id, database)).trips).toEqual([])
  })

  it("refuses a day past the trip's last", async () => {
    const tripId = await trip(3)
    await expect(add(tripId, 4, "Too far")).rejects.toThrow(TRAVEL_ERRORS.dayOutOfRange)
  })

  it("refuses a type another person owns", async () => {
    const tripId = await trip()
    const bensType = (await listTypes(ben.id, database))[0]
    await expect(
      createActivity(anna.id, { tripId, day: 1, title: "x", typeId: bensType.id }, database)
    ).rejects.toThrow(TRAVEL_ERRORS.typeNotFound)
  })
})

describe("moving cards (parts 3 and 5)", () => {
  it("saves the dropped order and closes the gap in the column it left", async () => {
    const tripId = await trip()
    const a = await add(tripId, 1, "A")
    const b = await add(tripId, 1, "B")
    const c = await add(tripId, 2, "C")
    await moveActivity(anna.id, { activityId: a, day: 2, order: [c, a] }, database)
    expect(await titlesOn(tripId, 2)).toEqual(["C", "A"])
    expect(await titlesOn(tripId, 1)).toEqual(["B"])
    const page = await loadTripPage(anna.id, tripId, database)
    expect(page.activities.find((activity) => activity.id === b)?.position).toBe(0)
  })

  it("never loses a card the screen forgot to send, nor moves one from another column", async () => {
    const tripId = await trip()
    const a = await add(tripId, 1, "A")
    const b = await add(tripId, 1, "B")
    const other = await add(tripId, 3, "Other")
    await moveActivity(anna.id, { activityId: b, day: 1, order: [b, other] }, database)
    expect(await titlesOn(tripId, 1)).toEqual(["B", "A"])
    expect(await titlesOn(tripId, 3)).toEqual(["Other"])
    expect(a).toBeTruthy()
  })

  it("moves to Ideas and keeps every other field", async () => {
    const tripId = await trip()
    const a = await add(tripId, 2, "Ghibli")
    await updateActivity(anna.id, { activityId: a, costCents: 100_000 }, database)
    await moveActivity(anna.id, { activityId: a, day: null, order: [a] }, database)
    const moved = (await loadTripPage(anna.id, tripId, database)).activities.find((activity) => activity.id === a)!
    expect(moved.day).toBeNull()
    expect(moved.costCents).toBe(100_000)
  })

  it("moves several at once onto the end of a day, in the order given (part 14)", async () => {
    const tripId = await trip()
    const a = await add(tripId, 1, "A")
    const b = await add(tripId, 2, "B")
    await add(tripId, 4, "Already")
    await moveActivities(anna.id, { activityIds: [b, a], day: 4 }, database)
    expect(await titlesOn(tripId, 4)).toEqual(["Already", "B", "A"])
  })
})

describe("days (parts 7, 10 and 11)", () => {
  it("adds a day after Day 2 and moves later days and their descriptions along", async () => {
    const tripId = await trip(4, "2020-01-01")
    await add(tripId, 3, "On day 3")
    await setDayInfo(anna.id, { tripId, day: 3, note: "Kyoto day" }, database)
    await addDay(anna.id, { tripId, after: 2 }, database)
    const page = await loadTripPage(anna.id, tripId, database)
    expect(page.trip.days).toBe(5)
    expect(await titlesOn(tripId, 4)).toEqual(["On day 3"])
    expect(page.trip.dayInfo[3].note).toBe("Kyoto day")
    expect(page.trip.dayInfo[2].note).toBe("")
  })

  it("removes Day 2 sending its cards to Ideas, and moves later days back", async () => {
    const tripId = await trip(4)
    await add(tripId, 2, "On day 2")
    await add(tripId, 3, "On day 3")
    await removeDay(anna.id, { tripId, day: 2, activities: "ideas" }, database)
    expect((await loadTripPage(anna.id, tripId, database)).trip.days).toBe(3)
    expect(await titlesOn(tripId, null)).toEqual(["On day 2"])
    expect(await titlesOn(tripId, 2)).toEqual(["On day 3"])
  })

  it("won't remove the last day", async () => {
    const tripId = await trip(1)
    await expect(removeDay(anna.id, { tripId, day: 1, activities: "ideas" }, database)).rejects.toThrow(
      TRAVEL_ERRORS.lastDay
    )
  })

  it("moves Day 1 to the end and the others shift up", async () => {
    const tripId = await trip(3)
    await add(tripId, 1, "One")
    await add(tripId, 2, "Two")
    await add(tripId, 3, "Three")
    await moveDay(anna.id, { tripId, from: 1, to: 3 }, database)
    expect(await titlesOn(tripId, 1)).toEqual(["Two"])
    expect(await titlesOn(tripId, 3)).toEqual(["One"])
  })

  it("copies a day's cards onto another, without Done or the rating", async () => {
    const tripId = await trip()
    const a = await add(tripId, 2, "Beach")
    await updateActivity(anna.id, { activityId: a, done: true, rating: 5 }, database)
    await add(tripId, 4, "Dinner")
    const { created } = await copyDay(anna.id, { tripId, from: 2, to: 4 }, database)
    expect(created).toHaveLength(1)
    expect(await titlesOn(tripId, 4)).toEqual(["Dinner", "Beach"])
    const copy = (await loadTripPage(anna.id, tripId, database)).activities.find((activity) => activity.id === created[0])!
    expect(copy.done).toBe(false)
    expect(copy.rating).toBeNull()
  })

  it("puts a duplicate right under its original (part 15)", async () => {
    const tripId = await trip()
    const a = await add(tripId, 1, "A")
    await add(tripId, 1, "B")
    await duplicateActivity(anna.id, a, database)
    expect(await titlesOn(tripId, 1)).toEqual(["A", "A", "B"])
  })
})

describe("undo (part 16)", () => {
  it("puts deleted cards back exactly and removes copies", async () => {
    const tripId = await trip()
    const a = await add(tripId, 1, "A")
    const b = await add(tripId, 1, "B")
    const before = (await loadTripPage(anna.id, tripId, database)).activities.map((activity) => ({
      id: activity.id,
      day: activity.day,
      position: activity.position,
      inBin: false,
    }))
    await binActivities(anna.id, [a], database)
    const { id: copy } = await duplicateActivity(anna.id, b, database)
    await restoreActivities(anna.id, { tripId, places: before, created: [copy] }, database)
    expect(await titlesOn(tripId, 1)).toEqual(["A", "B"])
  })

  it("can't be used on another person's trip", async () => {
    const tripId = await trip()
    const a = await add(tripId, 1, "A")
    await expect(
      restoreActivities(ben.id, { tripId, places: [{ id: a, day: 2, position: 0, inBin: false }], created: [] }, database)
    ).rejects.toThrow(TRAVEL_ERRORS.tripNotFound)
  })
})

describe("the bin, archive and copy (parts 38 and 39)", () => {
  it("lists a deleted card and puts it back on its day, or Ideas when the day is gone", async () => {
    const tripId = await trip(3)
    const a = await add(tripId, 3, "Late")
    await binActivities(anna.id, [a], database)
    expect((await listBin(anna.id, tripId, database)).map((entry) => entry.title)).toEqual(["Late"])
    await removeDay(anna.id, { tripId, day: 2, activities: "ideas" }, database)
    await removeDay(anna.id, { tripId, day: 2, activities: "ideas" }, database)
    await restoreFromBin(anna.id, a, database)
    expect(await titlesOn(tripId, null)).toEqual(["Late"])
  })

  it("empties the bin of anything older than 30 days", async () => {
    const tripId = await trip()
    const a = await add(tripId, 1, "Old")
    await binActivities(anna.id, [a], database)
    await database
      .update(travelActivities)
      .set({ deletedAt: new Date("2020-01-01T00:00:00Z") })
      .where(eq(travelActivities.id, a))
    expect(await listBin(anna.id, tripId, database)).toEqual([])
  })

  it("archives and brings back", async () => {
    const tripId = await trip()
    await setTripArchived(anna.id, tripId, true, database)
    expect((await loadTripsPage(anna.id, database)).trips[0].archived).toBe(true)
    await setTripArchived(anna.id, tripId, false, database)
    expect((await loadTripsPage(anna.id, database)).trips[0].archived).toBe(false)
  })

  it("copies days and cards, and drops what belonged to the trip that happened", async () => {
    const tripId = await trip(3, "2020-01-01")
    const a = await add(tripId, 2, "Senso-ji")
    await updateActivity(
      anna.id,
      { activityId: a, done: true, rating: 4, costCents: 500 },
      database
    )
    const { id } = await copyTrip(anna.id, { tripId, name: "Copy of Tokyo" }, database)
    const copy = await loadTripPage(anna.id, id, database)
    expect(copy.trip.name).toBe("Copy of Tokyo")
    expect(copy.trip.startDate).toBeNull()
    expect(copy.trip.days).toBe(3)
    const card = copy.activities[0]
    expect([card.title, card.day, card.done, card.rating, card.costCents]).toEqual(["Senso-ji", 2, false, null, 500])
  })

  it("turns a trip Done the day after it ends (part 36)", async () => {
    const tripId = await trip(2, "2020-01-01")
    await markEndedTripsDone(anna.id, database, new Date("2020-01-03T12:00:00Z"))
    const [row] = await database.select({ status: travelTrips.status }).from(travelTrips).where(eq(travelTrips.id, tripId))
    expect(row.status).toBe("done")
  })
})

describe("types, notes and saved places", () => {
  it("moves a removed type's cards to Other, and won't remove Other (part 19)", async () => {
    const tripId = await trip()
    const types = await listTypes(anna.id, database)
    const food = types.find((type) => type.builtin === "food")!
    const other = types.find((type) => type.builtin === "other")!
    const a = (await createActivity(anna.id, { tripId, day: 1, title: "Ramen", typeId: food.id }, database)).id
    await deleteType(anna.id, food.id, database)
    const card = (await loadTripPage(anna.id, tripId, database)).activities.find((activity) => activity.id === a)!
    expect(card.typeId).toBe(other.id)
    await expect(deleteType(anna.id, other.id, database)).rejects.toThrow(TRAVEL_ERRORS.otherTypeStays)
  })

  it("keeps notes as the editor's own document and drops anything else (part 23)", async () => {
    const tripId = await trip()
    const a = await add(tripId, 1, "A")
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "ok", marks: [{ type: "bold" }] }] },
        { type: "script", content: [{ type: "text", text: "evil()" }] },
        { type: "paragraph", content: [{ type: "text", text: "bad", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
      ],
    }
    await updateActivity(anna.id, { activityId: a, notes: JSON.stringify(doc) }, database)
    const notes = (await loadTripPage(anna.id, tripId, database)).activities[0].notes
    expect(notes).toContain('"bold"')
    expect(notes).not.toContain("script")
    expect(notes).not.toContain("javascript:")
    await updateActivity(anna.id, { activityId: a, notes: "<p>not a document</p>" }, database)
    expect((await loadTripPage(anna.id, tripId, database)).activities[0].notes).toBe("")
  })

  it("keeps a trip's notes and description as documents, private to the owner", async () => {
    const tripId = await trip()
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ryokan ideas" }] }] })
    const { id } = await createTripNote(anna.id, tripId, database)
    await saveTripNote(anna.id, { noteId: id, body: doc }, database)
    await updateTrip(anna.id, { tripId, description: doc }, database)
    const page = await loadTripPage(anna.id, tripId, database)
    expect(page.notes.map((note) => note.body)).toEqual([doc])
    expect(page.trip.description).toBe(doc)
    await expect(saveTripNote(ben.id, { noteId: id, body: doc }, database)).rejects.toThrow(TRAVEL_ERRORS.noteNotFound)
    await expect(deleteTripNote(ben.id, id, database)).rejects.toThrow(TRAVEL_ERRORS.noteNotFound)
    await expect(createTripNote(ben.id, tripId, database)).rejects.toThrow(TRAVEL_ERRORS.tripNotFound)
    await expect(duplicateTripNote(ben.id, id, database)).rejects.toThrow(TRAVEL_ERRORS.noteNotFound)
    const copy = await duplicateTripNote(anna.id, id, database)
    expect((await loadTripPage(anna.id, tripId, database)).notes.map((note) => [note.id, note.body])).toEqual([
      [copy.id, doc],
      [id, doc],
    ])
    await deleteTripNote(anna.id, id, database)
    await deleteTripNote(anna.id, copy.id, database)
    expect((await loadTripPage(anna.id, tripId, database)).notes).toEqual([])
  })

  it("saves a place and adds a separate copy to another trip's Ideas (part 41)", async () => {
    const first = await trip()
    const a = await add(first, 1, "Fuunji")
    await updateActivity(
      anna.id,
      { activityId: a, place: { name: "Fuunji", address: "Yoyogi", lat: 35.6, lng: 139.6, placeId: null } },
      database
    )
    const { id: savedId } = await saveActivityAsPlace(anna.id, a, database)
    const second = await trip()
    const { id } = await addSavedPlaceToTrip(anna.id, { tripId: second, savedPlaceId: savedId }, database)
    await updateActivity(anna.id, { activityId: id, title: "Fuunji again" }, database)
    expect(await titlesOn(second, null)).toEqual(["Fuunji again"])
    expect(await titlesOn(first, 1)).toEqual(["Fuunji"])
    await expect(addSavedPlaceToTrip(ben.id, { tripId: second, savedPlaceId: savedId }, database)).rejects.toThrow()
  })
})

describe("the sample trip (part 2)", () => {
  it("is given once, and a deleted one never comes back", async () => {
    await giveSampleTrip(anna.id, database)
    await giveSampleTrip(anna.id, database)
    const trips = (await loadTripsPage(anna.id, database)).trips
    expect(trips.map((row) => [row.name, row.isSample, row.days])).toEqual([["Tokyo, 5 days", true, 5]])
    await database.delete(travelTrips).where(eq(travelTrips.id, trips[0].id))
    await giveSampleTrip(anna.id, database)
    expect((await loadTripsPage(anna.id, database)).trips).toEqual([])
  })
})
