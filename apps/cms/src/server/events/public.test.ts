import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import { setContentCategories } from "@/server/directory/content-categories"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { saveDirectoryTimeZone } from "@/server/directory/settings"
import { createEvent, updateEvent } from "@/server/events/events"
import {
  eventSearchResults,
  eventSitemapEntries,
  readEventCategories,
  readEventSuggestions,
  readEventsBetween,
  readPublicEvent,
  readUpcomingEvents,
} from "@/server/events/public"
import { EVENT_CONTENT_TYPE } from "@/server/events/schema"
import { customShellWorkspaces } from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * What a visitor can reach: a published event on the site they are visiting,
 * never a draft and never another site's event.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let other: VisitorSite

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  const beta = await insertWorkspace(database, { name: "Beta" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  other = { id: beta.id, name: beta.name, url: "https://beta.example.com" }
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function event(
  siteId: string,
  title: string,
  status: "draft" | "published"
) {
  const created = await createEvent(
    siteId,
    { title, when: { startDate: "2026-09-26", startTime: "18:00" } },
    database
  )
  return updateEvent(
    siteId,
    created.id,
    {
      status,
      placeName: "Trinity Bellwoods Park",
      placeAddress: "790 Queen St W",
    },
    database
  )
}

describe("an event's page", () => {
  it("shows a published event and never a draft", async () => {
    const live = await event(site.id, "Night market", "published")
    const draft = await event(site.id, "Unfinished market", "draft")

    const page = await readPublicEvent(site, live.slug, database)
    expect(page?.event).toMatchObject({
      title: "Night market",
      startDate: "2026-09-26",
      startTime: "18:00",
      placeName: "Trinity Bellwoods Park",
    })
    expect(await readPublicEvent(site, draft.slug, database)).toBeNull()
  })

  it("goes when the event is taken back to draft", async () => {
    const live = await event(site.id, "Short run", "published")
    expect(await readPublicEvent(site, live.slug, database)).not.toBeNull()

    await updateEvent(site.id, live.id, { status: "draft" }, database)
    expect(await readPublicEvent(site, live.slug, database)).toBeNull()
  })

  it("never shows another site's event", async () => {
    const theirs = await event(other.id, "Beta market", "published")
    expect(await readPublicEvent(site, theirs.slug, database)).toBeNull()
  })

  it("carries its categories and the site's time zone", async () => {
    const markets = await createCategory(site.id, { name: "Markets" }, database)
    const live = await event(site.id, "Night market", "published")
    await setContentCategories(
      site.id,
      EVENT_CONTENT_TYPE,
      live.id,
      [markets.id],
      database
    )
    await saveDirectoryTimeZone(site.id, "America/Vancouver", database)

    const page = await readPublicEvent(site, live.slug, database)
    expect(page?.event.categories).toEqual([
      { name: "Markets", slug: markets.slug },
    ])
    expect(page?.timeZone).toBe("America/Vancouver")
  })
})

async function dated(
  siteId: string,
  title: string,
  when: {
    startDate: string
    startTime: string
    endDate?: string
    endTime?: string
  },
  status: "draft" | "published" = "published"
) {
  const created = await createEvent(siteId, { title, when }, database)
  return updateEvent(siteId, created.id, { status }, database)
}

describe("the upcoming list", () => {
  // The site's wall clock: Saturday 26 September 2026, 3:00pm.
  const now = "2026-09-26T15:00"

  it("leaves out an event that ended an hour ago and keeps one still on", async () => {
    await dated(site.id, "Morning market", {
      startDate: "2026-09-26",
      startTime: "09:00",
      endTime: "14:00",
    })
    const stillOn = await dated(site.id, "Afternoon fair", {
      startDate: "2026-09-26",
      startTime: "12:00",
      endTime: "16:00",
    })
    const noEnd = await dated(site.id, "All day sale", {
      startDate: "2026-09-26",
      startTime: "08:00",
    })
    const later = await dated(site.id, "Night market", {
      startDate: "2026-10-03",
      startTime: "18:00",
    })
    await dated(site.id, "Last week", {
      startDate: "2026-09-19",
      startTime: "18:00",
    })

    const { events, total } = await readUpcomingEvents(site, 1, now, database)
    expect(events.map((event) => event.slug)).toEqual([
      noEnd.slug,
      stillOn.slug,
      later.slug,
    ])
    expect(total).toBe(3)
  })

  it("keeps an event running past midnight until its end day's end time", async () => {
    const lateShow = await dated(site.id, "Late show", {
      startDate: "2026-09-25",
      startTime: "22:00",
      endDate: "2026-09-26",
      endTime: "16:00",
    })
    expect(
      (await readUpcomingEvents(site, 1, now, database)).events.map(
        (event) => event.slug
      )
    ).toEqual([lateShow.slug])
    resetPublicDirectoryCacheForTests()
    expect(
      (await readUpcomingEvents(site, 1, "2026-09-26T16:00", database)).events
    ).toEqual([])
  })

  it("keeps a festival until its last day ends", async () => {
    const festival = await dated(site.id, "Food festival", {
      startDate: "2026-09-25",
      startTime: "12:00",
      endDate: "2026-09-27",
      endTime: "20:00",
    })
    expect(
      (await readUpcomingEvents(site, 1, now, database)).events.map(
        (event) => event.slug
      )
    ).toEqual([festival.slug])
    resetPublicDirectoryCacheForTests()
    expect(
      (await readUpcomingEvents(site, 1, "2026-09-27T19:59", database)).total
    ).toBe(1)
    resetPublicDirectoryCacheForTests()
    expect(
      (await readUpcomingEvents(site, 1, "2026-09-27T20:00", database)).total
    ).toBe(0)
  })

  it("never lists a draft or another site's event, and pages twelve at a time", async () => {
    await dated(
      site.id,
      "Unfinished",
      { startDate: "2026-10-01", startTime: "10:00" },
      "draft"
    )
    await dated(other.id, "Beta's", {
      startDate: "2026-10-01",
      startTime: "10:00",
    })
    for (let day = 1; day <= 13; day++) {
      await dated(site.id, `Day ${day}`, {
        startDate: `2026-11-${String(day).padStart(2, "0")}`,
        startTime: "10:00",
      })
    }

    const first = await readUpcomingEvents(site, 1, now, database)
    const second = await readUpcomingEvents(site, 2, now, database)
    expect(first.total).toBe(13)
    expect(first.events).toHaveLength(12)
    expect(second.events.map((event) => event.title)).toEqual(["Day 13"])
  })
})

describe("the Events page's filters", () => {
  // The site's wall clock: Saturday 26 September 2026, 3:00pm.
  const now = "2026-09-26T15:00"

  async function filed(eventId: string, categoryId: string) {
    await setContentCategories(
      site.id,
      EVENT_CONTENT_TYPE,
      eventId,
      [categoryId],
      database
    )
  }

  it("narrows the upcoming list, a day and a month to one category", async () => {
    const music = await createCategory(site.id, { name: "Live music" }, database)
    const jazz = await dated(site.id, "Jazz night", {
      startDate: "2026-09-26",
      startTime: "20:00",
    })
    await filed(jazz.id, music.id)
    await dated(site.id, "Night market", {
      startDate: "2026-09-26",
      startTime: "18:00",
    })

    const upcoming = await readUpcomingEvents(site, 1, now, database, {
      categoryId: music.id,
    })
    expect(upcoming.events.map((event) => event.slug)).toEqual([jazz.slug])
    expect(upcoming.total).toBe(1)
    expect(
      (
        await readEventsBetween(site, "2026-09-26", "2026-09-26", database, {
          categoryId: music.id,
        })
      ).map((event) => event.slug)
    ).toEqual([jazz.slug])
    expect(
      await readEventsBetween(site, "2026-08-30", "2026-10-03", database)
    ).toHaveLength(2)
  })

  it("keeps the events with any day inside the dates, and none that are over", async () => {
    await dated(site.id, "Morning market", {
      startDate: "2026-09-26",
      startTime: "09:00",
      endTime: "14:00",
    })
    const tonight = await dated(site.id, "Tonight", {
      startDate: "2026-09-26",
      startTime: "20:00",
    })
    const festival = await dated(site.id, "Food festival", {
      startDate: "2026-09-25",
      startTime: "12:00",
      endDate: "2026-09-28",
      endTime: "20:00",
    })
    const sunday = await dated(site.id, "Sunday brunch", {
      startDate: "2026-09-27",
      startTime: "11:00",
    })
    await dated(site.id, "Monday trivia", {
      startDate: "2026-09-28",
      startTime: "19:00",
    })

    const weekend = await readUpcomingEvents(site, 1, now, database, {
      from: "2026-09-26",
      to: "2026-09-27",
    })
    expect(weekend.events.map((event) => event.slug)).toEqual([
      festival.slug,
      tonight.slug,
      sunday.slug,
    ])
    expect(
      (
        await readUpcomingEvents(site, 1, now, database, { from: "2026-09-28" })
      ).total
    ).toBe(2)
    expect(
      (await readUpcomingEvents(site, 1, now, database, { to: "2026-09-26" }))
        .total
    ).toBe(2)
  })

  it("offers every category with a published event, in the admin's order", async () => {
    const music = await createCategory(site.id, { name: "Live music" }, database)
    const food = await createCategory(site.id, { name: "Food" }, database)
    const drafts = await createCategory(site.id, { name: "Drafts" }, database)
    await createCategory(site.id, { name: "Empty" }, database)
    const past = await dated(site.id, "Last week", {
      startDate: "2026-09-19",
      startTime: "18:00",
    })
    await filed(past.id, music.id)
    const market = await dated(site.id, "Night market", {
      startDate: "2026-10-03",
      startTime: "18:00",
    })
    await filed(market.id, food.id)
    const unfinished = await dated(
      site.id,
      "Unfinished",
      { startDate: "2026-10-03", startTime: "18:00" },
      "draft"
    )
    await filed(unfinished.id, drafts.id)

    expect(
      (await readEventCategories(site.id, database)).map((row) => row.name)
    ).toEqual(["Food", "Live music"])
    expect(await readEventCategories(other.id, database)).toEqual([])
  })
})

describe("a day or a month", () => {
  it("holds every published event on it, including ones that are over", async () => {
    const early = await dated(site.id, "Early", {
      startDate: "2026-09-26",
      startTime: "09:00",
    })
    const late = await dated(site.id, "Late", {
      startDate: "2026-09-26",
      startTime: "20:00",
    })
    await dated(site.id, "Next day", {
      startDate: "2026-09-27",
      startTime: "09:00",
    })
    await dated(
      site.id,
      "Draft",
      { startDate: "2026-09-26", startTime: "12:00" },
      "draft"
    )
    await dated(other.id, "Beta's", {
      startDate: "2026-09-26",
      startTime: "12:00",
    })

    expect(
      (await readEventsBetween(site, "2026-09-26", "2026-09-26", database)).map(
        (event) => event.slug
      )
    ).toEqual([early.slug, late.slug])
    expect(
      await readEventsBetween(site, "2026-08-30", "2026-10-03", database)
    ).toHaveLength(3)
  })
})

describe("an event over several days", () => {
  it("is on every day it covers, and in both months when it crosses a month's end", async () => {
    const festival = await dated(site.id, "Food festival", {
      startDate: "2026-10-30",
      startTime: "12:00",
      endDate: "2026-11-01",
      endTime: "20:00",
    })
    const slugs = async (from: string, to: string) =>
      (await readEventsBetween(site, from, to, database)).map(
        (event) => event.slug
      )

    // October's grid ends on 31 Oct, November's starts on 1 Nov.
    expect(await slugs("2026-09-27", "2026-10-31")).toEqual([festival.slug])
    expect(await slugs("2026-11-01", "2026-12-05")).toEqual([festival.slug])
    expect(await slugs("2026-10-31", "2026-10-31")).toEqual([festival.slug])
    expect(await slugs("2026-10-29", "2026-10-29")).toEqual([])
    expect(await slugs("2026-11-02", "2026-11-02")).toEqual([])
  })
})

describe("search, suggestions and the sitemap", () => {
  // 3:00pm on Saturday 26 September 2026 in Toronto, the site's zone.
  const at = new Date("2026-09-26T19:00:00Z")

  async function everywhere(query: string) {
    resetPublicDirectoryCacheForTests()
    return {
      search: (await eventSearchResults(site.id, query, 10, database)).map(
        (result) => result.path
      ),
      suggestions: (
        await readEventSuggestions(site.id, query, at, database)
      ).map((row) => row.slug),
      sitemap: (await eventSitemapEntries(site.id, database, at)).map(
        (entry) => entry.path
      ),
    }
  }

  it("finds a published event by title, summary and place, and never a draft", async () => {
    const live = await event(site.id, "Night market", "published")
    await updateEvent(
      site.id,
      live.id,
      { summary: "Dumplings and lanterns after dark" },
      database
    )
    await event(site.id, "Night market draft", "draft")
    await event(other.id, "Night market elsewhere", "published")

    expect(await everywhere("night")).toEqual({
      search: [`/events/${live.slug}`],
      suggestions: [live.slug],
      sitemap: [`/events/${live.slug}`],
    })
    expect((await everywhere("lanterns")).search).toEqual([
      `/events/${live.slug}`,
    ])
    expect((await everywhere("bellwoods")).search).toEqual([
      `/events/${live.slug}`,
    ])
    const [result] = await eventSearchResults(site.id, "night", 10, database)
    expect(result).toMatchObject({ type: "Event", title: "Night market" })

    await updateEvent(site.id, live.id, { status: "draft" }, database)
    expect(await everywhere("night")).toEqual({
      search: [],
      suggestions: [],
      sitemap: [],
    })
  })

  it("keeps events out of all of it while the Events page is not open to everyone", async () => {
    await event(site.id, "Hidden market", "published")
    for (const visibility of ["off", "members"]) {
      await database
        .update(customShellWorkspaces)
        .set({ settings: { pages: { "/events": { visibility } } } })
        .where(eq(customShellWorkspaces.id, site.id))
      expect(await everywhere("hidden")).toEqual({
        search: [],
        suggestions: [],
        sitemap: [],
      })
    }
  })

  it("suggests only events not over yet, soonest first, three at most, from two letters", async () => {
    await dated(site.id, "Market this morning", {
      startDate: "2026-09-26",
      startTime: "09:00",
      endTime: "14:00",
    })
    const stillOn = await dated(site.id, "Market this afternoon", {
      startDate: "2026-09-26",
      startTime: "12:00",
      endTime: "16:00",
    })
    const nextWeek = await dated(site.id, "Market next week", {
      startDate: "2026-10-03",
      startTime: "18:00",
    })
    const inTwoWeeks = await dated(site.id, "Market in two weeks", {
      startDate: "2026-10-10",
      startTime: "18:00",
    })
    await dated(site.id, "Market in a month", {
      startDate: "2026-10-24",
      startTime: "18:00",
    })

    const offered = await readEventSuggestions(site.id, "market", at, database)
    expect(offered).toEqual([
      {
        title: "Market this afternoon",
        slug: stillOn.slug,
        startDate: "2026-09-26",
      },
      {
        title: "Market next week",
        slug: nextWeek.slug,
        startDate: "2026-10-03",
      },
      {
        title: "Market in two weeks",
        slug: inTwoWeeks.slug,
        startDate: "2026-10-10",
      },
    ])
    expect(await readEventSuggestions(site.id, "m", at, database)).toEqual([])
    // The full search still finds the one that is over.
    expect(
      await eventSearchResults(site.id, "morning", 10, database)
    ).toHaveLength(1)
  })

  it("keeps a past event in the sitemap until 30 days after its last day", async () => {
    const thirtyDays = await dated(site.id, "Ended 30 days ago", {
      startDate: "2026-08-27",
      startTime: "18:00",
    })
    await dated(site.id, "Ended 31 days ago", {
      startDate: "2026-08-26",
      startTime: "18:00",
    })
    const longRun = await dated(site.id, "Started long ago", {
      startDate: "2026-07-01",
      startTime: "10:00",
      endDate: "2026-08-28",
      endTime: "17:00",
    })

    expect(
      (await eventSitemapEntries(site.id, database, at)).map(
        (entry) => entry.path
      )
    ).toEqual([`/events/${longRun.slug}`, `/events/${thirtyDays.slug}`].sort())
  })
})
