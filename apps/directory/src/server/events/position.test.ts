import { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  createListing,
  deleteListings,
  updateListing,
} from "@/server/directory/listings"
import { createEvent, duplicateEvent } from "@/server/events/events"
import { readPublicEvent } from "@/server/events/public"
import { saveEventAndDates, type EventSave } from "@/server/events/repeats"
import { siteEvents } from "@/server/events/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * An event's place on a map. A typed street address is looked up with Google
 * once, when it is saved; a listing brings its own pin. Google's answers are
 * faked, and `lookups` counts every question asked.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let answer: () => Promise<Response>
let lookups: string[]

const REX = { lat: 43.650514, lng: -79.388149 }

function found(location = REX) {
  return async () =>
    new Response(
      JSON.stringify({ status: "OK", results: [{ geometry: { location } }] })
    )
}

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  lookups = []
  answer = found()
  vi.stubEnv("GOOGLE_MAPS_GEOCODING_API_KEY", "test-key")
  vi.stubGlobal("fetch", async (url: string) => {
    lookups.push(new URL(url).searchParams.get("address") ?? "")
    return answer()
  })
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function jazzNight() {
  return createEvent(
    site.id,
    { title: "Jazz night", when: { startDate: "2030-10-03", startTime: "20:00" } },
    database
  )
}

function save(id: string, input: EventSave) {
  return saveEventAndDates(
    site.id,
    id,
    input,
    database,
    new Date("2030-09-20T12:00:00Z")
  )
}

async function stored(id: string) {
  const [row] = await database
    .select()
    .from(siteEvents)
    .where(eq(siteEvents.id, id))
  return row!
}

async function pagePosition(slug: string) {
  resetPublicDirectoryCacheForTests()
  return (await readPublicEvent(site, slug, database))?.event.position
}

describe("a typed address", () => {
  it("is looked up once when saved, and not again until it changes", async () => {
    const event = await jazzNight()
    await save(event.id, { status: "published", placeAddress: "194 Queen St W" })
    expect(lookups).toEqual(["194 Queen St W"])
    expect(await stored(event.id)).toMatchObject({
      latitude: REX.lat,
      longitude: REX.lng,
      locatedFor: "194 Queen St W",
    })
    expect(await pagePosition(event.slug)).toEqual({
      latitude: REX.lat,
      longitude: REX.lng,
    })

    // Saving without changing the address makes no lookup.
    await save(event.id, { title: "Jazz night, late show" })
    await save(event.id, { placeAddress: "  194 Queen St W " })
    expect(lookups).toHaveLength(1)

    answer = found({ lat: 43.6453, lng: -79.3806 })
    await save(event.id, { placeAddress: "1 Front St W" })
    expect(lookups).toEqual(["194 Queen St W", "1 Front St W"])
    expect((await stored(event.id)).latitude).toBe(43.6453)
  })

  it("has no map when Google finds nothing, and is not asked again", async () => {
    answer = async () =>
      new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }))
    const event = await jazzNight()
    await save(event.id, { status: "published", placeAddress: "Nowhere Lane" })
    expect(await stored(event.id)).toMatchObject({
      latitude: null,
      locatedFor: "Nowhere Lane",
    })
    expect(await pagePosition(event.slug)).toBeNull()
    await save(event.id, { summary: "Bring a friend." })
    expect(lookups).toHaveLength(1)
  })

  it("has no map when Google cannot be reached, and tries again next save", async () => {
    answer = async () => {
      throw new Error("offline")
    }
    const event = await jazzNight()
    await save(event.id, { status: "published", placeAddress: "194 Queen St W" })
    expect(await stored(event.id)).toMatchObject({
      latitude: null,
      locatedFor: null,
    })
    expect(await pagePosition(event.slug)).toBeNull()

    answer = found()
    await save(event.id, { summary: "Bring a friend." })
    expect(lookups).toHaveLength(2)
    expect((await stored(event.id)).latitude).toBe(REX.lat)
  })

  it("makes no lookup without a key", async () => {
    vi.stubEnv("GOOGLE_MAPS_GEOCODING_API_KEY", "")
    const event = await jazzNight()
    await save(event.id, { placeAddress: "194 Queen St W" })
    expect(lookups).toEqual([])
    expect((await stored(event.id)).latitude).toBeNull()
  })

  it("clears the position when the address is cleared", async () => {
    const event = await jazzNight()
    await save(event.id, { placeAddress: "194 Queen St W" })
    await save(event.id, { placeAddress: "" })
    expect(await stored(event.id)).toMatchObject({
      latitude: null,
      longitude: null,
      locatedFor: null,
    })
  })

  it("goes to a copy and to every date of a repeat, with no new lookups", async () => {
    const event = await jazzNight()
    await save(event.id, { placeAddress: "194 Queen St W" })
    const copy = await duplicateEvent(site.id, event.id, database)
    expect(copy.position).toEqual({ latitude: REX.lat, longitude: REX.lng })

    await save(event.id, {
      repeat: { freq: "weekly", weekdays: [4], until: null },
    })
    const dates = await database
      .select()
      .from(siteEvents)
      .where(eq(siteEvents.seriesId, event.id))
      .orderBy(asc(siteEvents.seriesDate))
    expect(dates.length).toBeGreaterThan(0)
    expect(dates.every((date) => date.latitude === REX.lat)).toBe(true)
    expect(lookups).toHaveLength(1)
  })
})

describe("a listing as the place", () => {
  async function rex(pin: boolean) {
    const listing = await createListing(site.id, { title: "The Rex" }, database)
    return updateListing(
      site.id,
      listing.id,
      {
        status: "published",
        contactLinks: { address: "194 Queen St W, Toronto" },
        latitude: pin ? 43.6505 : null,
        longitude: pin ? -79.3881 : null,
      },
      database
    )
  }

  it("uses the listing's own pin and makes no lookup", async () => {
    const listing = await rex(true)
    const event = await jazzNight()
    await save(event.id, { status: "published", listingId: listing.id })
    expect(lookups).toEqual([])
    expect(await pagePosition(event.slug)).toEqual({
      latitude: 43.6505,
      longitude: -79.3881,
    })
  })

  it("has no map when the listing has no pin", async () => {
    const listing = await rex(false)
    const event = await jazzNight()
    await save(event.id, { status: "published", listingId: listing.id })
    expect(await pagePosition(event.slug)).toBeNull()
  })

  it("keeps the listing's pin after the listing is deleted, with no lookup", async () => {
    const listing = await rex(true)
    const event = await jazzNight()
    await save(event.id, { status: "published", listingId: listing.id })
    await deleteListings(site.id, [listing.id], database)

    expect(await pagePosition(event.slug)).toEqual({
      latitude: 43.6505,
      longitude: -79.3881,
    })
    await save(event.id, { summary: "Still on." })
    expect(lookups).toEqual([])
  })
})
