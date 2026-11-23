import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  listingHoursStatus,
  wallClockWeekdays,
  type ListingHours,
} from "@/lib/directory/listing-details"
import { createListing, updateListing } from "@/server/directory/listings"
import { readPublicBrowse } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * "Open now" on the browse page. The clock is always handed in, as the site's
 * wall-clock reading, so every case here is a fixed moment.
 *
 * 19 Oct 2099 is a Monday.
 */

let client: PGlite
let database: TestDatabase
let site: { id: string; name: string; url: string }

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const row = await insertWorkspace(database, { name: "Alpha" })
  site = { id: row.id, name: "Alpha", url: "https://alpha.example.com" }
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function place(slug: string, hours: unknown) {
  const made = await createListing(site.id, { title: slug, slug }, database)
  return updateListing(
    site.id,
    made.id,
    { status: "published", hours },
    database
  )
}

async function openAt(openAt: string, page = 1) {
  resetPublicDirectoryCacheForTests()
  return readPublicBrowse(
    site,
    { sort: "title", page, openAt },
    database
  )
}

const slugs = (rows: { slug: string }[]) => rows.map((row) => row.slug)

describe("the site's clock", () => {
  it("names the day, the day before and the time", () => {
    expect(wallClockWeekdays("2099-10-19T21:30")).toEqual({
      today: "monday",
      yesterday: "sunday",
      time: "21:30",
    })
    expect(wallClockWeekdays("2099-10-20T01:30")).toEqual({
      today: "tuesday",
      yesterday: "monday",
      time: "01:30",
    })
  })
})

describe("open now", () => {
  it("keeps a bar open until 2am open at 1:30 on the next day", async () => {
    await place("late-bar", { monday: { open: "20:00", close: "02:00" } })

    expect(slugs((await openAt("2099-10-19T19:59")).listings)).toEqual([])
    expect(slugs((await openAt("2099-10-19T23:00")).listings)).toEqual([
      "late-bar",
    ])
    expect(slugs((await openAt("2099-10-20T01:30")).listings)).toEqual([
      "late-bar",
    ])
    expect(slugs((await openAt("2099-10-20T02:00")).listings)).toEqual([])
  })

  it("opens at the minute it opens and closes at the minute it closes", async () => {
    await place("cafe", { monday: { open: "08:00", close: "16:00" } })

    expect((await openAt("2099-10-19T07:59")).total).toBe(0)
    expect((await openAt("2099-10-19T08:00")).total).toBe(1)
    expect((await openAt("2099-10-19T15:59")).total).toBe(1)
    expect((await openAt("2099-10-19T16:00")).total).toBe(0)
    // Tuesday has no hours, so Tuesday it is closed all day.
    expect((await openAt("2099-10-20T09:00")).total).toBe(0)
  })

  it("leaves out a place with no hours, or hours that are not times", async () => {
    await place("no-hours", {})
    await place("nonsense", { monday: { open: "9am", close: "5pm" } })
    await place("open", { monday: { open: "09:00", close: "17:00" } })

    const page = await openAt("2099-10-19T12:00")
    expect(slugs(page.listings)).toEqual(["open"])

    // Without the filter, all three are there.
    resetPublicDirectoryCacheForTests()
    const everything = await readPublicBrowse(
      site,
      { sort: "title", page: 1 },
      database
    )
    expect(everything.total).toBe(3)
  })

  it("counts and pages what it shows", async () => {
    const open = { monday: { open: "09:00", close: "17:00" } }
    const shut = { monday: { open: "18:00", close: "22:00" } }
    for (let index = 0; index < 45; index += 1) {
      await place(`place-${String(index).padStart(2, "0")}`, index % 3 ? shut : open)
    }

    const first = await openAt("2099-10-19T12:00")
    expect(first.total).toBe(15)
    // Twelve to a page, so the fifteen open places take two.
    expect(first.listings).toHaveLength(12)
    const pages = Math.ceil(first.total / first.pageSize)
    const seen = new Set<string>()
    for (let page = 1; page <= pages; page += 1) {
      for (const slug of slugs((await openAt("2099-10-19T12:00", page)).listings)) {
        seen.add(slug)
      }
    }
    expect(pages).toBe(2)
    expect(seen.size).toBe(15)
  })

  it("agrees with the listing page's own Open now line at every hour", async () => {
    const shapes: Record<string, Partial<ListingHours>> = {
      day: { monday: { open: "09:00", close: "17:00" } },
      evening: { sunday: { open: "18:00", close: "01:00" }, monday: { open: "18:00", close: "01:00" } },
      "all-day": { monday: { open: "00:00", close: "00:00" } },
      "closed-monday": { tuesday: { open: "09:00", close: "17:00" } },
    }
    for (const [slug, hours] of Object.entries(shapes)) {
      await place(slug, hours)
    }

    for (let hour = 0; hour < 24; hour += 1) {
      const clock = `2099-10-19T${String(hour).padStart(2, "0")}:30`
      const shown = new Set(slugs((await openAt(clock)).listings))
      // The page's line reads the device clock, so it is handed a Date whose
      // own fields say the same Monday and time.
      const at = new Date(2099, 9, 19, hour, 30)
      for (const [slug, hours] of Object.entries(shapes)) {
        const full = {
          monday: null,
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: null,
          sunday: null,
          ...hours,
        } as ListingHours
        expect(
          { slug, clock, open: shown.has(slug) },
          `${slug} at ${clock}`
        ).toEqual({
          slug,
          clock,
          open: listingHoursStatus(full, at).startsWith("Open now"),
        })
      }
    }
  })
})
