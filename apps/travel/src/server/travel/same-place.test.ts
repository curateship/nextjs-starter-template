import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { alreadyOnTripMessage, getTravelErrorMessage, isAlreadyOnTrip } from "@/lib/travel/errors"
import { googleRatingLine } from "@/lib/travel/google-rating"
import { samePlace } from "@/lib/travel/same-place"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { fillPickedPlacePhoto } from "@/server/travel/place-photo"
import { addSavedPlaceToTrip, saveActivityAsPlace } from "@/server/travel/saved-places"
import { binActivities, createActivity, createTrip, updateActivity } from "@/server/travel/trips"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await client.close()
})

const kinkaku = { name: "Kinkaku-ji", address: "1 Kinkakujicho, Kyoto", lat: 35.0394, lng: 135.7292, placeId: "ChIJkinkaku" }

async function kyoto() {
  return (await createTrip(anna.id, { name: "Kyoto", days: 3, currency: "JPY", startDate: null }, database)).id
}

describe("the same place twice (More Travel features part 3)", () => {
  it("matches on Google's id, and on the name when either has no id", () => {
    const google = { title: "Golden Pavilion", place: kinkaku }
    expect(samePlace(google, { title: "x", place: { name: "Other", placeId: "ChIJkinkaku" } })).toBe(true)
    expect(samePlace(google, { title: "x", place: { name: "Kinkaku-ji", placeId: "ChIJelse" } })).toBe(false)
    expect(samePlace(google, { title: "kinkaku ji", place: null })).toBe(false)
    expect(samePlace(google, { title: "KINKAKU-JI", place: null })).toBe(true)
    expect(samePlace({ title: "Lunch", place: null }, { title: "lunch", place: null })).toBe(true)
    expect(samePlace({ title: "", place: null }, { title: "", place: null })).toBe(false)
  })

  it("says where the first one is, and the message reads as itself", () => {
    expect(alreadyOnTripMessage("Kinkaku-ji", 2)).toBe("Kinkaku-ji is already on Day 2.")
    expect(alreadyOnTripMessage("Kinkaku-ji", null)).toBe("Kinkaku-ji is already on Ideas.")
    expect(isAlreadyOnTrip("Kinkaku-ji is already on Day 2.")).toBe(true)
    expect(getTravelErrorMessage(new Error("Kinkaku-ji is already on Day 12."))).toBe("Kinkaku-ji is already on Day 12.")
    expect(isAlreadyOnTrip("Something went wrong.")).toBe(false)
  })

  it("refuses a Google pick already on the trip, but not the card's own place, a typed one or one in the bin", async () => {
    const tripId = await kyoto()
    const first = await createActivity(anna.id, { tripId, day: 2, title: "Golden Pavilion" }, database)
    await updateActivity(anna.id, { activityId: first.id, place: kinkaku }, database)
    // Saving its own place again is no repeat.
    await updateActivity(anna.id, { activityId: first.id, place: { ...kinkaku, address: "Kyoto" } }, database)
    const second = await createActivity(anna.id, { tripId, day: null, title: "Temple" }, database)
    await expect(updateActivity(anna.id, { activityId: second.id, place: kinkaku }, database)).rejects.toThrow(
      "Kinkaku-ji is already on Day 2."
    )
    // A typed address is the person's own words.
    await updateActivity(anna.id, { activityId: second.id, place: { ...kinkaku, placeId: null } }, database)
    // Once the first is in the bin, the place is free again.
    await binActivities(anna.id, [first.id], database)
    await updateActivity(anna.id, { activityId: second.id, place: kinkaku }, database)
  })

  it("refuses a saved place already on the trip", async () => {
    const tripId = await kyoto()
    const card = await createActivity(anna.id, { tripId, day: 1, title: "Kinkaku-ji" }, database)
    await updateActivity(anna.id, { activityId: card.id, place: kinkaku }, database)
    const saved = await saveActivityAsPlace(anna.id, card.id, database)
    await expect(addSavedPlaceToTrip(anna.id, { tripId, savedPlaceId: saved.id }, database)).rejects.toThrow(
      "Kinkaku-ji is already on Day 1."
    )
    const other = await kyoto()
    await addSavedPlaceToTrip(anna.id, { tripId: other, savedPlaceId: saved.id }, database)
  })
})

describe("the picture of a picked place (More Travel features part 2)", () => {
  it("fetches nothing for a card with a picture, a card with no Google place, or a photo of another place", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key")
    const fetched = vi.fn(async (_input: string | URL) => new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }))
    vi.stubGlobal("fetch", fetched)
    const tripId = await kyoto()
    const card = await createActivity(anna.id, { tripId, day: 1, title: "Kinkaku-ji" }, database)
    expect(await fillPickedPlacePhoto(anna.id, { activityId: card.id, photoName: "places/ChIJkinkaku/photos/a" }, database)).toEqual({
      photo: false,
    })
    await updateActivity(anna.id, { activityId: card.id, place: kinkaku }, database)
    expect(await fillPickedPlacePhoto(anna.id, { activityId: card.id, photoName: "places/ChIJother/photos/a" }, database)).toEqual({
      photo: false,
    })
    expect(fetched).not.toHaveBeenCalled()
    // The right place's photo is asked for; with no storage set up here it isn't saved, and the card stays as it was.
    expect(await fillPickedPlacePhoto(anna.id, { activityId: card.id, photoName: "places/ChIJkinkaku/photos/a" }, database)).toEqual({
      photo: false,
    })
    expect(String(fetched.mock.calls[0]?.[0])).toContain("places/ChIJkinkaku/photos/a/media")
  })
})

describe("Google's rating line (More Travel features part 1)", () => {
  it('reads "Google 4.6 (2,300) · $$", Free for a free place, and nothing for an older place', () => {
    expect(googleRatingLine({ rating: 4.6, ratingCount: 2300, priceLevel: 2 })).toBe("Google 4.6 (2,300) · $$")
    expect(googleRatingLine({ rating: 4, ratingCount: null, priceLevel: 0 })).toBe("Google 4.0 · Free")
    expect(googleRatingLine({ rating: null, ratingCount: null, priceLevel: 3 })).toBe("$$$")
    expect(googleRatingLine({})).toBeNull()
    expect(googleRatingLine(null)).toBeNull()
  })
})
