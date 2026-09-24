import { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setPageVisibility } from "@/server/content/pages"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  createListing,
  deleteListings,
  updateListing,
} from "@/server/directory/listings"
import {
  createEvent,
  duplicateEvent,
  listEvents,
  updateEvent,
} from "@/server/events/events"
import {
  findEventPlace,
  readCalendarFeed,
  readEventsBetween,
  readPublicEvent,
  readUpcomingEvents,
} from "@/server/events/public"
import { saveEventAndDates } from "@/server/events/repeats"
import { siteEvents } from "@/server/events/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * An event whose place is one of the site's listings: the page shows the
 * listing as it is now and links to it, and the event still says where it is
 * after the listing is deleted.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let otherSiteId: string

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  otherSiteId = (await insertWorkspace(database, { name: "Beta" })).id
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function bar(siteId = site.id, status: "draft" | "published" = "published") {
  const listing = await createListing(siteId, { title: "The Rex" }, database)
  return updateListing(
    siteId,
    listing.id,
    {
      status,
      contactLinks: { address: "194 Queen St W, Toronto" },
    },
    database
  )
}

/** A published jazz night, far enough ahead that it is never over. */
async function jazzNight(listingId: string | null) {
  const made = await createEvent(
    site.id,
    {
      title: "Jazz night",
      when: { startDate: "2030-10-03", startTime: "20:00" },
    },
    database
  )
  return updateEvent(
    site.id,
    made.id,
    {
      status: "published",
      placeName: "Typed by hand",
      placeAddress: "1 Typed St",
      listingId,
    },
    database
  )
}

async function page(slug: string) {
  resetPublicDirectoryCacheForTests()
  return (await readPublicEvent(site, slug, database))!.event
}

describe("the place is a listing", () => {
  it("takes the listing's name and address over anything typed, and links to it", async () => {
    const rex = await bar()
    const event = await jazzNight(rex.id)
    expect(event.listingId).toBe(rex.id)
    expect(event.placeName).toBe("The Rex")
    expect(event.placeAddress).toBe("194 Queen St W, Toronto")

    const shown = await page(event.slug)
    expect(shown.placeName).toBe("The Rex")
    expect(shown.placeAddress).toBe("194 Queen St W, Toronto")
    expect(shown.placeListingSlug).toBe(rex.slug)
  })

  it("follows a renamed listing everywhere a visitor sees the place", async () => {
    const rex = await bar()
    const event = await jazzNight(rex.id)
    await updateListing(
      site.id,
      rex.id,
      {
        title: "The Rex Hotel",
        contactLinks: { address: "194 Queen Street West, Toronto" },
      },
      database
    )

    const shown = await page(event.slug)
    expect(shown.placeName).toBe("The Rex Hotel")
    expect(shown.placeAddress).toBe("194 Queen Street West, Toronto")
    const [card] = await readEventsBetween(
      site,
      "2030-10-03",
      "2030-10-03",
      database
    )
    expect(card?.placeName).toBe("The Rex Hotel")
    const feed = await readCalendarFeed(
      site.id,
      new Date("2030-09-01T12:00:00Z"),
      database
    )
    expect(feed?.events[0]?.placeAddress).toBe("194 Queen Street West, Toronto")
    const { events } = await listEvents(site.id, {}, database)
    expect(events[0]?.placeName).toBe("The Rex Hotel")
  })

  it("keeps the listing's last name and address as text once it is deleted", async () => {
    const rex = await bar()
    const event = await jazzNight(rex.id)
    await updateListing(site.id, rex.id, { title: "The Rex Hotel" }, database)
    await deleteListings(site.id, [rex.id], database)

    const [row] = await database
      .select()
      .from(siteEvents)
      .where(eq(siteEvents.id, event.id))
    expect(row?.listingId).toBeNull()
    expect(row?.placeName).toBe("The Rex Hotel")
    expect(row?.placeAddress).toBe("194 Queen St W, Toronto")
    const shown = await page(event.slug)
    expect(shown.placeName).toBe("The Rex Hotel")
    expect(shown.placeListingSlug).toBeNull()
  })

  it("never links a draft listing", async () => {
    const rex = await bar(site.id, "draft")
    const event = await jazzNight(rex.id)
    const shown = await page(event.slug)
    expect(shown.placeName).toBe("The Rex")
    expect(shown.placeListingSlug).toBeNull()
  })

  it("never links while the directory is kept from visitors", async () => {
    const rex = await bar()
    const event = await jazzNight(rex.id)
    await setPageVisibility(
      site.id,
      { path: "/directory", visibility: "members" },
      database
    )
    expect((await page(event.slug)).placeListingSlug).toBeNull()
  })

  it("refuses another site's listing", async () => {
    const theirs = await bar(otherSiteId)
    await expect(jazzNight(theirs.id)).rejects.toThrow(
      "That listing is not on this site any more."
    )
  })

  it("goes back to the typed place when the listing is taken off", async () => {
    const rex = await bar()
    const event = await jazzNight(rex.id)
    const typed = await updateEvent(
      site.id,
      event.id,
      { listingId: null, placeName: "Somewhere else", placeAddress: "2 Other St" },
      database
    )
    expect(typed.listingId).toBeNull()
    const shown = await page(event.slug)
    expect(shown.placeName).toBe("Somewhere else")
    expect(shown.placeListingSlug).toBeNull()
  })

  it("carries the listing to a copy and to every date of a repeat", async () => {
    const rex = await bar()
    const event = await jazzNight(rex.id)
    const copy = await duplicateEvent(site.id, event.id, database)
    expect(copy.listingId).toBe(rex.id)

    await saveEventAndDates(
      site.id,
      event.id,
      { repeat: { freq: "weekly", weekdays: [4], until: null } },
      database,
      new Date("2030-09-20T12:00:00Z")
    )
    const dates = await database
      .select()
      .from(siteEvents)
      .where(eq(siteEvents.seriesId, event.id))
      .orderBy(asc(siteEvents.seriesDate))
    expect(dates.length).toBeGreaterThan(0)
    expect(dates.every((date) => date.listingId === rex.id)).toBe(true)
  })
})

describe("what's on at a listing", () => {
  // The site's wall clock: 1 September 2030, well before every event here.
  const now = "2030-09-01T12:00"

  async function at(
    listingId: string | null,
    title: string,
    startDate: string,
    options: {
      status?: "draft" | "published"
      visibility?: "public" | "private"
    } = {}
  ) {
    const made = await createEvent(
      site.id,
      { title, when: { startDate, startTime: "20:00" } },
      database
    )
    return updateEvent(
      site.id,
      made.id,
      {
        status: options.status ?? "published",
        visibility: options.visibility ?? "public",
        listingId,
      },
      database
    )
  }

  it("lists only that listing's upcoming public events, soonest first", async () => {
    const rex = await bar()
    const later = await at(rex.id, "Live jazz", "2030-10-05")
    const sooner = await at(rex.id, "Trivia", "2030-10-03")
    await at(rex.id, "Over already", "2030-08-01")
    await at(rex.id, "Unfinished", "2030-10-04", { status: "draft" })
    await at(rex.id, "Members only", "2030-10-04", { visibility: "private" })
    await at(null, "Somewhere else", "2030-10-02")

    resetPublicDirectoryCacheForTests()
    const { events, total } = await readUpcomingEvents(
      site,
      1,
      now,
      database,
      { placeId: rex.id }
    )
    expect(events.map((event) => event.slug)).toEqual([
      sooner.slug,
      later.slug,
    ])
    expect(total).toBe(2)
  })

  it("finds a place for the filter only among this site's published listings", async () => {
    const rex = await bar()
    const draft = await bar(site.id, "draft")
    const beta = await createListing(otherSiteId, { title: "Beta bar" }, database)
    await updateListing(otherSiteId, beta.id, { status: "published" }, database)

    expect(await findEventPlace(site.id, rex.slug, database)).toEqual({
      id: rex.id,
      title: "The Rex",
      slug: rex.slug,
    })
    expect(await findEventPlace(site.id, draft.slug, database)).toBeNull()
    expect(await findEventPlace(site.id, beta.slug, database)).toBeNull()
    expect(await findEventPlace(site.id, "no-such-place", database)).toBeNull()
  })
})

