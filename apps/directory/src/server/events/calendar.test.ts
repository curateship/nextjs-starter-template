import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { saveDirectoryTimeZone } from "@/server/directory/settings"
import {
  eventCalendarFileResponse,
  siteCalendarFeedResponse,
} from "@/server/events/calendar"
import {
  createEvent,
  updateEvent,
  type EventWhenInput,
} from "@/server/events/events"
import { customShellWorkspaces } from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The files a visitor's calendar app reads: one event's file, and the whole
 * site's subscription. Published events on the visited site only, and the
 * subscription only while anyone may read the Events page.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let other: VisitorSite

// 3pm on 26 Sep 2026 in Toronto.
const now = new Date("2026-09-26T19:00:00Z")
const signedOut = async () => false
const signedIn = async () => true

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const test = await createTestDatabase()
  client = test.client
  database = test.db
  const alpha = await insertWorkspace(database, { name: "Alpha Guide" })
  const beta = await insertWorkspace(database, { name: "Beta Guide" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.test" }
  other = { id: beta.id, name: beta.name, url: "https://beta.example.test" }
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function event(
  owner: VisitorSite,
  title: string,
  when: EventWhenInput,
  status: "draft" | "published" = "published"
) {
  const created = await createEvent(owner.id, { title, when }, database)
  return updateEvent(
    owner.id,
    created.id,
    { status, placeName: "Harbourfront" },
    database
  )
}

const tonight = {
  startDate: "2026-09-26",
  startTime: "18:00",
  endDate: "2026-09-26",
  endTime: "23:00",
}

async function setEventsPage(visibility: "off" | "members" | "everyone") {
  await database
    .update(customShellWorkspaces)
    .set({ settings: { pages: { "/events": { visibility } } } })
    .where(eq(customShellWorkspaces.id, site.id))
}

function oneFile(slug: string, isSignedIn = signedOut, owner = site) {
  return eventCalendarFileResponse({
    site: owner,
    slug,
    isSignedIn,
    now,
    database,
  })
}

function feed(owner: VisitorSite | null = site) {
  return siteCalendarFeedResponse({ site: owner, now, database })
}

describe("one event's calendar file", () => {
  it("is a download of the event at its Toronto time", async () => {
    const market = await event(site, "Night market", tonight)
    const response = await oneFile(market.slug)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8"
    )
    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="${market.slug}.ics"`
    )
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache")
    const text = await response.text()
    expect(text).toContain("DTSTART:20260926T220000Z")
    expect(text).toContain("DTEND:20260927T030000Z")
    expect(text).toContain(
      `URL:https://alpha.example.test/events/${market.slug}`
    )
    expect(text).toContain("LOCATION:Harbourfront")
  })

  it("reads the site's own time zone", async () => {
    await saveDirectoryTimeZone(site.id, "America/Vancouver", database)
    const market = await event(site, "Night market", tonight)
    const text = await (await oneFile(market.slug)).text()
    // 6pm in Vancouver is 1am UTC the next day.
    expect(text).toContain("DTSTART:20260927T010000Z")
  })

  it("is not found for a draft, another site's event, or a made-up address", async () => {
    const draft = await event(site, "Unfinished", tonight, "draft")
    const theirs = await event(other, "Their market", tonight)

    expect((await oneFile(draft.slug)).status).toBe(404)
    expect((await oneFile(theirs.slug)).status).toBe(404)
    expect((await oneFile("no-such-event")).status).toBe(404)
    expect(
      (
        await eventCalendarFileResponse({
          site: null,
          slug: theirs.slug,
          isSignedIn: signedOut,
          database,
        })
      ).status
    ).toBe(404)
  })

  it("follows the Events page's switch, letting a signed-in member through", async () => {
    const market = await event(site, "Night market", tonight)

    await setEventsPage("members")
    expect((await oneFile(market.slug, signedOut)).status).toBe(404)
    expect((await oneFile(market.slug, signedIn)).status).toBe(200)

    await setEventsPage("off")
    expect((await oneFile(market.slug, signedIn)).status).toBe(404)
  })
})

describe("the site's calendar subscription", () => {
  it("holds published events not over yet, soonest first", async () => {
    await event(site, "Book swap", {
      startDate: "2026-10-03",
      startTime: "11:00",
    })
    await event(site, "Night market", tonight)
    await event(site, "Morning run", {
      startDate: "2026-09-26",
      startTime: "07:00",
      endDate: "2026-09-26",
      endTime: "08:00",
    })
    await event(site, "Yesterday's fair", {
      startDate: "2026-09-25",
      startTime: "10:00",
    })
    await event(site, "Unfinished", tonight, "draft")
    await event(other, "Their market", tonight)

    const response = await feed()
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8"
    )
    const text = await response.text()
    const titles = text
      .split("\r\n")
      .filter((line) => line.startsWith("SUMMARY:"))
    expect(titles).toEqual(["SUMMARY:Night market", "SUMMARY:Book swap"])
    expect(text).toContain("X-WR-CALNAME:Alpha Guide events")
  })

  it("keeps an event with no end time until its day is over", async () => {
    await event(site, "All-day fair", {
      startDate: "2026-09-26",
      startTime: "09:00",
    })
    const text = await (await feed()).text()
    expect(text).toContain("SUMMARY:All-day fair")
    // It runs to midnight at the end of the 26th, Toronto time.
    expect(text).toContain("DTEND:20260927T040000Z")
  })

  it("is an empty calendar, not an error, when nothing is coming up", async () => {
    const response = await feed()
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain("BEGIN:VEVENT")
  })

  it("is not found unless the Events page is open to everyone", async () => {
    await event(site, "Night market", tonight)
    await setEventsPage("members")
    expect((await feed()).status).toBe(404)
    await setEventsPage("off")
    expect((await feed()).status).toBe(404)
    expect((await feed(null)).status).toBe(404)
  })
})
