import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { readNotes } from "@/lib/travel/notes"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { MAX_CARD_PHOTOS, setActivityPhotos } from "@/server/travel/activity-photos"
import { copyDay, duplicateActivity } from "@/server/travel/days"
import { copyTrip } from "@/server/travel/trip-admin"
import { createActivity, createTrip, loadTripPage, updateActivity, updateTrip } from "@/server/travel/trips"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

const credit = { name: "Ana", profileUrl: "https://unsplash.com/@ana", photoPageUrl: "https://unsplash.com/photos/a" }
const photo = (name: string) => ({ url: `https://images.unsplash.com/photo-${name}`, credit })

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
  ben = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

async function tokyo() {
  const tripId = (await createTrip(anna.id, { name: "Tokyo", days: 3, currency: "JPY", startDate: null }, database)).id
  const card = await createActivity(anna.id, { tripId, day: 1, title: "Senso-ji" }, database)
  return { tripId, cardId: card.id }
}

describe("a card's row of photos (Travel features 3, part 5)", () => {
  it("keeps the first as the card's picture and the rest in order", async () => {
    const { tripId, cardId } = await tokyo()
    await setActivityPhotos(anna.id, { activityId: cardId, photos: [photo("a"), photo("b"), photo("c")] }, database)
    let page = await loadTripPage(anna.id, tripId, database)
    expect(page.activities[0].photoUrl).toBe(photo("a").url)
    expect(page.photos.map((each) => each.url)).toEqual([photo("b").url, photo("c").url])

    // Dragging the third to the front makes it the board's picture.
    await setActivityPhotos(anna.id, { activityId: cardId, photos: [photo("c"), photo("a"), photo("b")] }, database)
    page = await loadTripPage(anna.id, tripId, database)
    expect(page.activities[0].photoUrl).toBe(photo("c").url)
    expect(page.photos.map((each) => each.url)).toEqual([photo("a").url, photo("b").url])

    await setActivityPhotos(anna.id, { activityId: cardId, photos: [] }, database)
    page = await loadTripPage(anna.id, tripId, database)
    expect(page.activities[0].photoUrl).toBeNull()
    expect(page.photos).toEqual([])
  })

  it("refuses someone else's card, a photo nobody uploaded, and too many", async () => {
    const { cardId } = await tokyo()
    await expect(setActivityPhotos(ben.id, { activityId: cardId, photos: [photo("a")] }, database)).rejects.toThrow(
      TRAVEL_ERRORS.activityNotFound
    )
    await expect(
      setActivityPhotos(anna.id, { activityId: cardId, photos: [{ url: "https://example.com/a.jpg", credit: null }] }, database)
    ).rejects.toThrow(TRAVEL_ERRORS.pictureNotYours)
    await expect(
      setActivityPhotos(anna.id, { activityId: cardId, photos: [{ url: photo("a").url, credit: null }] }, database)
    ).rejects.toThrow(TRAVEL_ERRORS.pictureNeedsCredit)
    const many = Array.from({ length: MAX_CARD_PHOTOS + 1 }, (_, index) => photo(String(index)))
    await expect(setActivityPhotos(anna.id, { activityId: cardId, photos: many }, database)).rejects.toThrow(TRAVEL_ERRORS.tooManyPhotos)
  })

  it("travels with the card through Duplicate, Copy day and Copy trip", async () => {
    const { tripId, cardId } = await tokyo()
    await setActivityPhotos(anna.id, { activityId: cardId, photos: [photo("a"), photo("b")] }, database)
    const { id: twin } = await duplicateActivity(anna.id, cardId, database)
    const { created } = await copyDay(anna.id, { tripId, from: 1, to: 3 }, database)
    const page = await loadTripPage(anna.id, tripId, database)
    for (const id of [twin, ...created]) {
      expect(page.photos.filter((each) => each.activityId === id).map((each) => each.url)).toEqual([photo("b").url])
    }

    const copy = await copyTrip(anna.id, { tripId, name: "Tokyo again" }, database)
    const copied = await loadTripPage(anna.id, copy.id, database)
    const first = copied.activities.find((each) => each.title === "Senso-ji" && each.photoUrl)!
    expect(copied.photos.some((each) => each.activityId === first.id && each.url === photo("b").url)).toBe(true)
  })
})

describe("Copy trip and the notes' card links (Travel features 3, parts 2 and 4)", () => {
  it("points Place and Map blocks at the copied cards", async () => {
    const { tripId, cardId } = await tokyo()
    const note = (ids: string[]) =>
      JSON.stringify({
        type: "doc",
        content: [
          { type: "notePlace", attrs: { activityId: ids[0] } },
          { type: "noteMap", attrs: { activityIds: ids } },
        ],
      })
    await updateTrip(anna.id, { tripId, description: note([cardId]) }, database)
    await updateActivity(anna.id, { activityId: cardId, notes: note([cardId]) }, database)

    const copy = await copyTrip(anna.id, { tripId, name: "Tokyo again" }, database)
    const page = await loadTripPage(anna.id, copy.id, database)
    const newId = page.activities[0].id
    expect(newId).not.toBe(cardId)
    for (const stored of [page.trip.description, page.activities[0].notes]) {
      expect(readNotes(stored).content).toEqual([
        { type: "notePlace", attrs: { activityId: newId } },
        { type: "noteMap", attrs: { activityIds: [newId] } },
      ])
    }
  })
})
