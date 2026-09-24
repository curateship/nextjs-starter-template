import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import { setContentCategories } from "@/server/directory/content-categories"
import {
  fillFrontPageEvents,
  readDirectoryFrontPage,
} from "@/server/directory/front-page"
import {
  createFrontPageSection,
  listFrontPageSections,
} from "@/server/directory/front-page-sections"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { createEvent, updateEvent } from "@/server/events/events"
import { readUpcomingEvents } from "@/server/events/public"
import { EVENT_CONTENT_TYPE } from "@/server/events/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Upcoming events on a category page and in a home page row. "Now" is noon on
 * 1 September 2030 in Toronto, the site's zone, well before every event here
 * except the one that is over.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite

const at = new Date("2030-09-01T16:00:00Z")
const now = "2030-09-01T12:00"

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

async function event(
  title: string,
  startDate: string,
  categoryIds: string[] = [],
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
  const saved = await updateEvent(
    site.id,
    made.id,
    {
      status: options.status ?? "published",
      visibility: options.visibility ?? "public",
    },
    database
  )
  if (categoryIds.length) {
    await setContentCategories(
      site.id,
      EVENT_CONTENT_TYPE,
      saved.id,
      categoryIds,
      database
    )
  }
  return saved
}

async function frontPage(visible = true) {
  resetPublicDirectoryCacheForTests()
  const page = await readDirectoryFrontPage(site, database)
  return page ? fillFrontPageEvents(site, page, visible, database, at) : null
}

describe("a category's upcoming events", () => {
  it("are only its own public events that are not over, soonest first", async () => {
    const music = await createCategory(site.id, { name: "Live music" }, database)
    const jazz = await createCategory(
      site.id,
      { name: "Jazz", parentId: music.id },
      database
    )
    const later = await event("Blues night", "2030-10-05", [music.id])
    const sooner = await event("Open mic", "2030-10-03", [music.id])
    await event("Last month's gig", "2030-08-01", [music.id])
    await event("Unfinished", "2030-10-04", [music.id], { status: "draft" })
    await event("Members' gig", "2030-10-04", [music.id], {
      visibility: "private",
    })
    await event("Jazz trio", "2030-10-02", [jazz.id])
    await event("Book club", "2030-10-02")

    const { events, total } = await readUpcomingEvents(site, 1, now, database, {
      categoryId: music.id,
    })
    expect(events.map((row) => row.slug)).toEqual([sooner.slug, later.slug])
    expect(total).toBe(2)
  })
})

describe("a home page row of upcoming events", () => {
  it("is saved as its own kind", async () => {
    await createFrontPageSection(
      site.id,
      { heading: "What's on", kind: "events", listingCount: 6 },
      database
    )
    const [section] = await listFrontPageSections(site.id, database)
    expect(section).toMatchObject({ kind: "events", listingCount: 6 })
  })

  it("shows the soonest events, as many as the row asks for", async () => {
    await createFrontPageSection(
      site.id,
      { heading: "What's on", kind: "events", listingCount: 2 },
      database
    )
    const first = await event("Open mic", "2030-10-01")
    const second = await event("Trivia", "2030-10-02")
    await event("Blues night", "2030-10-03")
    await event("Over already", "2030-08-01")

    const page = await frontPage()
    const [row] = page?.rows ?? []
    expect(row?.kind).toBe("events")
    expect(
      row?.kind === "events" ? row.events.map((each) => each.slug) : []
    ).toEqual([first.slug, second.slug])
  })

  it("keeps to its category when it has one", async () => {
    const music = await createCategory(site.id, { name: "Live music" }, database)
    await createFrontPageSection(
      site.id,
      {
        heading: "Gigs",
        kind: "events",
        categoryId: music.id,
        listingCount: 6,
      },
      database
    )
    const gig = await event("Open mic", "2030-10-03", [music.id])
    await event("Book club", "2030-10-02")

    const [row] = (await frontPage())?.rows ?? []
    expect(
      row?.kind === "events" ? row.events.map((each) => each.slug) : []
    ).toEqual([gig.slug])
  })

  it("is left off while nothing is coming up, and so is a page of only that", async () => {
    await createFrontPageSection(
      site.id,
      { heading: "What's on", kind: "events", listingCount: 6 },
      database
    )
    await event("Over already", "2030-08-01")
    expect(await frontPage()).toBeNull()
  })

  it("is left off when the visitor may not see the Events page", async () => {
    await createFrontPageSection(
      site.id,
      { heading: "What's on", kind: "events", listingCount: 6 },
      database
    )
    await event("Open mic", "2030-10-03")
    expect(await frontPage(false)).toBeNull()
  })
})
