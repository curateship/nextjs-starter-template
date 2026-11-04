import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { travelTrips } from "@/server/travel/schema"
import { pickTripCover, type CoverSource } from "@/server/travel/trip-cover"
import { createTrip } from "@/server/travel/trips"
import type { UnsplashPhoto } from "@/server/travel/unsplash"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

const LISBON: UnsplashPhoto = {
  id: "lisbon-tram",
  url: "https://images.unsplash.com/photo-lisbon?w=1080",
  thumbUrl: "https://images.unsplash.com/photo-lisbon?w=400",
  width: 4000,
  height: 3000,
  credit: {
    name: "Ana Silva",
    profileUrl: "https://unsplash.com/@ana?utm_source=travel&utm_medium=referral",
    photoPageUrl: "https://unsplash.com/photos/lisbon-tram?utm_source=travel&utm_medium=referral",
  },
  downloadLocation: "https://api.unsplash.com/photos/lisbon-tram/download",
}

/** Unsplash with these photos for any search, remembering what was searched and pinged. */
function unsplashWith(photos: UnsplashPhoto[], { pingFails = false } = {}) {
  const searched: string[] = []
  const pinged: string[] = []
  const source: CoverSource = {
    search: async (query) => {
      searched.push(query)
      return photos
    },
    used: async (link) => {
      if (pingFails) throw new Error("Unsplash didn't answer.")
      pinged.push(link)
    },
  }
  return { source, searched, pinged }
}

async function cover(tripId: string) {
  const [row] = await database
    .select({ url: travelTrips.coverUrl, credit: travelTrips.coverCredit })
    .from(travelTrips)
    .where(eq(travelTrips.id, tripId))
  return row
}

describe("a cover photo on New trip (Travel features part 9)", () => {
  it("sets the top photo of the destination with its credit, after telling Unsplash it was used", async () => {
    const { id } = await createTrip(anna.id, { name: "Lisbon", days: 4, currency: "EUR", startDate: null, destination: "Lisbon, Portugal" }, database)
    const { source, searched, pinged } = unsplashWith([LISBON])
    await pickTripCover(id, "Lisbon, Portugal", { database, source })
    expect(searched).toEqual(["Lisbon, Portugal"])
    expect(pinged).toEqual([LISBON.downloadLocation])
    expect(await cover(id)).toEqual({ url: LISBON.url, credit: LISBON.credit })
  })

  it("leaves no cover with no destination, no Unsplash, nothing found or a failed ping, and keeps the trip", async () => {
    const { id } = await createTrip(anna.id, { name: "Somewhere", days: 2, currency: "USD", startDate: null, destination: null }, database)
    await pickTripCover(id, null, { database, source: unsplashWith([LISBON]).source })
    await pickTripCover(id, "Lisbon", { database, source: null })
    await pickTripCover(id, "Lisbon", { database, source: unsplashWith([]).source })
    await pickTripCover(id, "Lisbon", { database, source: unsplashWith([LISBON], { pingFails: true }).source })
    expect(await cover(id)).toEqual({ url: null, credit: null })
  })

  it("keeps a cover the trip already has", async () => {
    const { id } = await createTrip(anna.id, { name: "Lisbon", days: 4, currency: "EUR", startDate: null, destination: "Lisbon" }, database)
    await database.update(travelTrips).set({ coverUrl: "https://example.test/mine.jpg" }).where(eq(travelTrips.id, id))
    await pickTripCover(id, "Lisbon", { database, source: unsplashWith([LISBON]).source })
    expect((await cover(id)).url).toBe("https://example.test/mine.jpg")
  })
})
