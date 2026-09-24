import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { createEvent, updateEvent } from "@/server/events/events"
import * as publicReads from "@/server/events/public"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * A private event opens from its link and is missing from every list. The old
 * Directory app let each list check for itself, and all but one forgot, so
 * these tests fail the moment a new public read of events is added without
 * being proven to leave private events out.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let listed: string
let unlisted: { id: string; slug: string }

// 3:00pm on Saturday 26 September 2026 in Toronto, the site's zone.
const at = new Date("2026-09-26T19:00:00Z")
const siteNow = "2026-09-26T15:00"

async function publishedEvent(title: string, visibility: "public" | "private") {
  const created = await createEvent(
    site.id,
    { title, when: { startDate: "2026-10-03", startTime: "18:00" } },
    database
  )
  const event = await updateEvent(
    site.id,
    created.id,
    { status: "published", visibility, placeName: "The Local" },
    database
  )
  return { id: event.id, slug: event.slug }
}

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  listed = (await publishedEvent("Open market", "public")).slug
  unlisted = await publishedEvent("Members market", "private")
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

type PublicRead = keyof typeof publicReads

/**
 * Every function `public.ts` exports. A list returns the addresses it shows a
 * visitor. Anything else says why it is not a list. A new export that is
 * missing here fails the type check and the first test below.
 */
const everyPublicRead: Record<
  PublicRead,
  (() => Promise<string[]>) | { notAList: string }
> = {
  readUpcomingEvents: async () =>
    (
      await publicReads.readUpcomingEvents(site, 1, siteNow, database)
    ).events.map((event) => event.slug),
  readEventsBetween: async () =>
    (
      await publicReads.readEventsBetween(
        site,
        "2026-09-27",
        "2026-11-07",
        database
      )
    ).map((event) => event.slug),
  eventSearchResults: async () =>
    (await publicReads.eventSearchResults(site.id, "market", 10, database)).map(
      (result) => result.path.replace("/events/", "")
    ),
  readEventSuggestions: async () =>
    (
      await publicReads.readEventSuggestions(site.id, "market", at, database)
    ).map((row) => row.slug),
  eventSitemapEntries: async () =>
    (await publicReads.eventSitemapEntries(site.id, database, at)).map(
      (entry) => entry.path.replace("/events/", "")
    ),
  newestEventsForFeed: async () =>
    (await publicReads.newestEventsForFeed(site.id, 20, database)).map(
      (row) => row.slug
    ),
  readCalendarFeed: async () =>
    (await publicReads.readCalendarFeed(site.id, at, database))?.events.map(
      (event) => event.slug
    ) ?? [],
  readPublicEvent: {
    notAList: "One event by its address: the link a private event is for.",
  },
  eventsArePublic: { notAList: "Reads the Events page's switch." },
  findEventPlace: { notAList: "Finds a listing by its address, not events." },
  eventsAccessFor: { notAList: "Reads the Events page's switch." },
}

describe("private events", () => {
  it("names every function public.ts exports", () => {
    const exported = Object.entries(publicReads)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort()
    expect(Object.keys(everyPublicRead).sort()).toEqual(exported)
  })

  for (const [name, read] of Object.entries(everyPublicRead)) {
    if (typeof read !== "function") continue
    it(`are left out of ${name}`, async () => {
      const shown = await read()
      // The public event proves the read found something to leave out from.
      expect(shown).toContain(listed)
      expect(shown).not.toContain(unlisted.slug)
    })
  }

  it("still open from their link, marked private", async () => {
    const page = await publicReads.readPublicEvent(
      site,
      unlisted.slug,
      database
    )
    expect(page?.event.isPrivate).toBe(true)
    const open = await publicReads.readPublicEvent(site, listed, database)
    expect(open?.event.isPrivate).toBe(false)
  })

  it("come back to every list when switched to public", async () => {
    await updateEvent(site.id, unlisted.id, { visibility: "public" }, database)
    resetPublicDirectoryCacheForTests()
    for (const read of Object.values(everyPublicRead)) {
      if (typeof read === "function") {
        expect(await read()).toContain(unlisted.slug)
      }
    }
  })
})

describe("the events table", () => {
  /**
   * Only these files may read the table. A list written anywhere else would
   * skip the private filter in `public.ts`, so it has to live there instead.
   */
  const allowed = [
    "server/events/events.ts", // Admin → Events, which shows everything.
    "server/events/place.ts", // Column rules for a listing as the place.
    "server/events/public.ts", // Every public read, through the one filter.
    "server/events/repeats.ts", // Admin: a repeating event's dates.
    "server/events/schema.ts",
    "server/events/share-image.ts", // One event's card, found by its address.
  ]

  it("is read only by the admin, the public reads and the share card", () => {
    const root = path.resolve(__dirname, "../..")
    const readers = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) =>
        /\bsiteEvents\b/.test(readFileSync(path.join(root, file), "utf8"))
      )
      .map((file) => file.split(path.sep).join("/"))
      .sort()
    expect(readers).toEqual(allowed)
  })
})
