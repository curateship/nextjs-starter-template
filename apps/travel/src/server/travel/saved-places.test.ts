import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { addSavedPlaceToTrip, listSavedPlaces, saveActivityAsPlace, updateSavedPlace } from "@/server/travel/saved-places"
import { createActivity, createTrip, loadTripPage } from "@/server/travel/trips"
import { listTypes } from "@/server/travel/types"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let tripId: string
let savedId: string

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
  ben = await insertUser(database)
  ;({ id: tripId } = await createTrip(anna.id, { name: "Kyoto", days: 2, currency: "JPY", startDate: null }, database))
  const { id } = await createActivity(anna.id, { tripId, day: 1, title: "Okutan" }, database)
  ;({ id: savedId } = await saveActivityAsPlace(anna.id, id, database))
})

afterEach(async () => {
  await client.close()
})

const saved = async () => (await listSavedPlaces(anna.id, database)).find((place) => place.id === savedId)!

describe("editing a saved place (Travel features 4, part 11)", () => {
  it("changes its name, type and notes, and leaves a copy already on a trip as it was", async () => {
    const { id: osaka } = await createTrip(anna.id, { name: "Osaka", days: 2, currency: "JPY", startDate: null }, database)
    const copy = await addSavedPlaceToTrip(anna.id, { tripId: osaka, savedPlaceId: savedId }, database)
    const food = (await listTypes(anna.id, database)).find((type) => type.builtin === "food")!
    const notes = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tofu, book ahead" }] }] })
    await updateSavedPlace(anna.id, { savedPlaceId: savedId, title: "Okutan, Nanzen-ji", typeId: food.id, notes }, database)
    const place = await saved()
    expect(place).toMatchObject({ title: "Okutan, Nanzen-ji", typeId: food.id })
    expect(place.notes).toContain("Tofu, book ahead")
    const card = (await loadTripPage(anna.id, osaka, database)).activities.find((activity) => activity.id === copy.id)
    expect(card?.title).toBe("Okutan")
  })

  it("drops Place and Map blocks from its notes, since it belongs to no trip", async () => {
    const notes = JSON.stringify({
      type: "doc",
      content: [
        { type: "notePlace", attrs: { activityId: "00000000-0000-4000-8000-000000000000" } },
        { type: "paragraph", content: [{ type: "text", text: "Kept" }] },
      ],
    })
    await updateSavedPlace(anna.id, { savedPlaceId: savedId, notes }, database)
    const place = await saved()
    expect(place.notes).not.toContain("notePlace")
    expect(place.notes).toContain("Kept")
  })

  it("clears the credit when the picture goes, and refuses a picture that isn't the person's", async () => {
    await expect(
      updateSavedPlace(anna.id, { savedPlaceId: savedId, photoUrl: "https://elsewhere.example/a.jpg", photoCredit: null }, database)
    ).rejects.toThrow(TRAVEL_ERRORS.pictureNotYours)
    await expect(
      updateSavedPlace(anna.id, { savedPlaceId: savedId, photoUrl: "https://images.unsplash.com/photo-1", photoCredit: null }, database)
    ).rejects.toThrow(TRAVEL_ERRORS.pictureNeedsCredit)
    await updateSavedPlace(anna.id, { savedPlaceId: savedId, photoUrl: null }, database)
    expect(await saved()).toMatchObject({ photoUrl: null, photoCredit: null })
  })

  it("never lets someone else change it, or give it a type that isn't theirs", async () => {
    await expect(updateSavedPlace(ben.id, { savedPlaceId: savedId, title: "Mine now" }, database)).rejects.toThrow(
      TRAVEL_ERRORS.savedPlaceNotFound
    )
    const bensType = (await listTypes(ben.id, database))[0]
    await expect(updateSavedPlace(anna.id, { savedPlaceId: savedId, typeId: bensType.id }, database)).rejects.toThrow(
      TRAVEL_ERRORS.typeNotFound
    )
    expect((await saved()).title).toBe("Okutan")
  })
})
