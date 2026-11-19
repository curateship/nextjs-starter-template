import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { eventJsonLd } from "@/lib/directory/public-seo"
import { readEventsSearch } from "@/lib/events/events-page"
import { signUpsCloseAt } from "@/lib/events/event-time"
import { cleanTicketsUrl } from "@/lib/events/tickets-url"
import { createListing, updateListing } from "@/server/directory/listings"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { createEvent, updateEvent } from "@/server/events/events"
import {
  readEventDateCounts,
  readEventNeighbours,
  readEventPins,
  readPublicEvent,
  readUpcomingEvents,
} from "@/server/events/public"
import { saveEventAndDates } from "@/server/events/repeats"
import { siteEvents } from "@/server/events/schema"
import { signUpForEvent } from "@/server/events/sign-ups"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The event features of task events/37 that a visitor sees: the tickets
 * link, "Also on", "Also at", the Past list, the map's pins and "Full" on a
 * card. The site is on Toronto time and "now" is 3pm on Saturday
 * 26 September 2026.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite

const now = "2026-09-26T15:00"

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function published(
  title: string,
  startDate: string,
  more: Parameters<typeof updateEvent>[2] = {}
) {
  const made = await createEvent(
    site.id,
    { title, when: { startDate, startTime: "18:00" } },
    database
  )
  return updateEvent(
    site.id,
    made.id,
    { status: "published", placeName: "Somewhere", ...more },
    database
  )
}

describe("the tickets link", () => {
  it("takes only a full https address", () => {
    expect(cleanTicketsUrl("  ")).toBe("")
    expect(cleanTicketsUrl("https://www.eventbrite.ca/e/123")).toBe(
      "https://www.eventbrite.ca/e/123"
    )
    for (const bad of ["http://tickets.example.com", "javascript:alert(1)", "tickets"]) {
      expect(() => cleanTicketsUrl(bad)).toThrow("https://")
    }
  })

  it("is saved on the event, shown on its page and sent to Google", async () => {
    const event = await published("Night market", "2026-10-03", {
      ticketsUrl: "https://www.eventbrite.ca/e/night-market",
    })
    const page = await readPublicEvent(site, event.slug, database)
    expect(page?.event.ticketsUrl).toBe("https://www.eventbrite.ca/e/night-market")
    const markup = JSON.stringify(
      eventJsonLd({
        ...page!.event,
        siteName: site.name,
        siteUrl: site.url,
        timeZone: "America/Toronto",
        image: "",
      })
    )
    expect(markup).toContain('"offers":{"@type":"Offer","url":"https://www.eventbrite.ca/e/night-market"}')
    await expect(
      updateEvent(site.id, event.id, { ticketsUrl: "http://plain.example.com" }, database)
    ).rejects.toThrow("https://")
  })
})

describe("Also on", () => {
  it("lists the repeat's next dates, never this one or one that is over", async () => {
    const made = await createEvent(
      site.id,
      { title: "Trivia", when: { startDate: "2026-09-22", startTime: "20:00" } },
      database
    )
    await updateEvent(site.id, made.id, { status: "published", placeName: "The Pub" }, database)
    await saveEventAndDates(
      site.id,
      made.id,
      { repeat: { freq: "weekly", weekdays: [2], until: null } },
      database,
      new Date("2026-09-26T19:00:00Z")
    )
    const page = await readPublicEvent(site, made.slug, database)
    const { dates } = await readEventNeighbours(site, page!.event, now, database)
    expect(dates.length).toBeGreaterThan(0)
    expect(dates.every((row) => row.id !== made.id)).toBe(true)
    expect(dates.every((row) => row.startDate > "2026-09-26")).toBe(true)
    expect(dates.map((row) => row.startDate)).toEqual(
      [...dates.map((row) => row.startDate)].sort()
    )
  })
})

describe("Also at", () => {
  it("lists the place's next events and leaves out this one and drafts", async () => {
    const rex = await createListing(site.id, { title: "The Rex" }, database)
    await updateListing(site.id, rex.id, { status: "published" }, database)
    const here = await published("Jazz night", "2026-10-01", { listingId: rex.id })
    const next = await published("Blues night", "2026-10-02", { listingId: rex.id })
    await published("Elsewhere", "2026-10-02")
    const draft = await createEvent(
      site.id,
      { title: "Secret set", when: { startDate: "2026-10-03", startTime: "18:00" } },
      database
    )
    await updateEvent(site.id, draft.id, { listingId: rex.id }, database)

    const page = await readPublicEvent(site, here.slug, database)
    const { atPlace } = await readEventNeighbours(site, page!.event, now, database)
    expect(atPlace.map((row) => row.id)).toEqual([next.id])
  })
})

describe("the Past list", () => {
  it("lists only events that are over, newest first, with their count", async () => {
    const older = await published("Spring fair", "2026-05-01")
    const recent = await published("Summer fair", "2026-08-01")
    await published("Autumn fair", "2026-10-10")
    const past = await readUpcomingEvents(site, 1, now, database, { past: true })
    expect(past.events.map((row) => row.id)).toEqual([recent.id, older.id])
    const counts = await readEventDateCounts(site, now, [], database)
    expect(counts).toMatchObject({ anyTime: 1, past: 2 })
  })

  it("keeps the typed words", async () => {
    await published("Spring fair", "2026-05-01")
    const market = await published("Spring market", "2026-05-02")
    const found = await readUpcomingEvents(site, 1, now, database, {
      past: true,
      q: "market",
    })
    expect(found.events.map((row) => row.id)).toEqual([market.id])
  })

  it("is read from the address, dropping the upcoming list's own filters", () => {
    expect(
      readEventsSearch({ list: "past", q: "fair", when: "weekend", page: "2" })
    ).toEqual({ list: "past", page: 2, place: undefined, q: "fair", category: undefined })
    expect(readEventsSearch({ view: "map", when: "today", page: "3" })).toMatchObject({
      view: "map",
      when: "today",
    })
    expect(readEventsSearch({ view: "map" })).not.toHaveProperty("page")
  })
})

describe("the map's pins", () => {
  it("draws the upcoming events with a place, and counts the ones without", async () => {
    const onMap = await published("Night market", "2026-10-03")
    await database
      .update(siteEvents)
      .set({ latitude: 43.65, longitude: -79.38 })
      .where(eq(siteEvents.id, onMap.id))
    await published("No address", "2026-10-04")
    await published("Over", "2026-09-01")
    const found = await readEventPins(site, now, database)
    expect(found.pins.map((pin) => pin.id)).toEqual([onMap.id])
    expect(found.pins[0]).toMatchObject({ latitude: 43.65, longitude: -79.38 })
    expect(found).toMatchObject({ total: 1, unplaced: 1 })
  })
})

describe("Full on the card", () => {
  it("says full once every seat is taken", async () => {
    const event = await published("Cooking class", "2026-10-03", {
      takesSignUps: true,
      seats: 1,
    })
    const before = await readUpcomingEvents(site, 1, now, database)
    expect(before.events[0]).toMatchObject({ full: false, going: 0 })
    await signUpForEvent(
      site.id,
      event.id,
      { name: "Sam", email: "sam@example.com" },
      { ip: "10.0.0.1", at: new Date("2026-09-26T19:00:00Z") },
      database
    )
    resetPublicDirectoryCacheForTests()
    const after = await readUpcomingEvents(site, 1, now, database)
    expect(after.events[0]).toMatchObject({ full: true, going: 1 })
    expect(after.events[0]).not.toHaveProperty("seats")
  })
})

describe("when sign-ups close", () => {
  it("is the start, or that many hours before it on the wall clock", () => {
    const when = { startDate: "2026-11-03", startTime: "14:00" }
    expect(signUpsCloseAt(when, null)).toBe("2026-11-03T14:00")
    expect(signUpsCloseAt(when, 48)).toBe("2026-11-01T14:00")
    expect(signUpsCloseAt(when, 3)).toBe("2026-11-03T11:00")
  })
})
