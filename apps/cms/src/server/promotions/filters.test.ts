import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { blankListingHours, type ListingHours } from "@/lib/directory/listing-details"
import { dealNowText } from "@/lib/promotions/deal-times"
import { createCategory } from "@/server/directory/categories"
import { setContentCategories } from "@/server/directory/content-categories"
import { createListing, updateListing } from "@/server/directory/listings"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { LISTING_CONTENT_TYPE } from "@/server/directory/schema"
import { createPromotion } from "@/server/promotions/promotions"
import { readDealCategories, readDeals } from "@/server/promotions/public"
import { sitePromotions } from "@/server/promotions/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The Deals page's filters: a category, On now, Ending soon and a distance.
 * "Today" is Tuesday 6 October 2026 in Toronto, the site's zone.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let userId: string
let listingId: string

const today = "2026-10-06"

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  userId = (await insertUser(database)).id
  listingId = await place("43 Down")
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function place(title: string, pin?: { latitude: number; longitude: number }) {
  const listing = await createListing(site.id, { title }, database)
  await updateListing(
    site.id,
    listing.id,
    { status: "published", ...(pin ?? {}) },
    database
  )
  return listing.id
}

async function deal(
  title: string,
  options: {
    startDate?: string
    endDate?: string | null
    times?: ListingHours
    listing?: string
  } = {}
) {
  return createPromotion(
    site.id,
    userId,
    {
      title,
      listingId: options.listing ?? listingId,
      description: "",
      coverImage: "",
      code: "",
      smallPrint: "",
      dealType: "percent_off",
      amount: "10",
      headline: "",
      status: "published",
      startDate: options.startDate ?? "2026-10-01",
      endDate: options.endDate ?? null,
      times: options.times ?? blankListingHours(),
    },
    database
  )
}

function week(
  days: (keyof ListingHours)[],
  open: string,
  close: string
): ListingHours {
  const hours = blankListingHours()
  for (const day of days) hours[day] = { open, close }
  return hours
}

async function titles(now: string, only: Parameters<typeof readDeals>[4]) {
  resetPublicDirectoryCacheForTests()
  const list = await readDeals(site, 1, now, database, only)
  return list.deals.map((row) => row.title).sort()
}

describe("a second stretch saved before the feature was removed", () => {
  /**
   * The database narrows the Deals page to "On now" in SQL while the card's
   * own words come from `dealNowText`. Both used to read a day's `second`
   * stretch; the editor stopped writing one on 25 Sep 2026 and the reads came
   * out together. A row written before then still has one, so this plants it
   * the only way that can, straight into the column, past `cleanDealTimes`.
   */
  it("is ignored by the page and by the database alike", async () => {
    const made = await deal("Lunch only", {
      times: week(["tuesday"], "12:00", "14:00"),
    })
    await database
      .update(sitePromotions)
      .set({
        times: {
          ...week(["tuesday"], "12:00", "14:00"),
          tuesday: {
            open: "12:00",
            close: "14:00",
            second: { open: "20:00", close: "23:00" },
          },
        } as never,
      })
      .where(eq(sitePromotions.id, made.id))

    const [row] = await database
      .select({ times: sitePromotions.times })
      .from(sitePromotions)
      .where(eq(sitePromotions.id, made.id))
    // The planted value really is in the column, or the test proves nothing.
    expect((row!.times as Record<string, unknown>).tuesday).toHaveProperty(
      "second"
    )

    // Inside the second stretch: the card says nothing is on, so the list
    // must not hand back a deal the card would draw as finished for the day.
    const inTheEvening = `${today}T21:00`
    expect(dealNowText(made, inTheEvening)).not.toContain("On now")
    expect(await titles(inTheEvening, { on: "now" })).toEqual([])

    // Inside the first stretch both still agree it is on.
    const atLunch = `${today}T13:00`
    expect(dealNowText(made, atLunch)).toContain("On now")
    expect(await titles(atLunch, { on: "now" })).toEqual(["Lunch only"])
  })
})

describe("On now", () => {
  it("matches the cards' own On now at every hour, midnight and 24 hours included", async () => {
    const made = [
      await deal("All day"),
      await deal("Happy hour", { times: week(["tuesday"], "16:00", "18:00") }),
      await deal("Late night", { times: week(["monday"], "22:00", "02:00") }),
      await deal("Evening", {
        times: week(["tuesday"], "20:00", "00:00"),
      }),
      await deal("Round the clock", { times: week(["tuesday"], "09:00", "09:00") }),
      await deal("Not yet", { startDate: "2026-10-07" }),
      await deal("Last night ended", {
        endDate: "2026-10-05",
        times: week(["monday"], "23:00", "01:30"),
      }),
    ]
    for (const clock of ["00:30", "01:45", "08:59", "09:00", "12:00", "16:30", "18:00", "21:00", "23:59"]) {
      const now = `${today}T${clock}`
      const expected = made
        .filter((row) => dealNowText(row, now)?.startsWith("On now"))
        .map((row) => row.title)
        .sort()
      expect(await titles(now, { on: "now" }), clock).toEqual(expected)
    }
  })
})

describe("Ending soon", () => {
  it("keeps deals whose last day is within three days, never ones with no end", async () => {
    await deal("Ends today", { endDate: today })
    await deal("Ends in two days", { endDate: "2026-10-08" })
    await deal("Ends in three days", { endDate: "2026-10-09" })
    await deal("No end")
    expect(await titles(`${today}T12:00`, { on: "ending" })).toEqual([
      "Ends in two days",
      "Ends today",
    ])
  })
})

describe("a category", () => {
  it("keeps deals at listings filed directly under it, and offers only categories with one", async () => {
    const pizza = await createCategory(site.id, { name: "Pizza" }, database)
    const empty = await createCategory(site.id, { name: "Empty" }, database)
    const napoli = await place("Napoli")
    await setContentCategories(site.id, LISTING_CONTENT_TYPE, napoli, [pizza.id], database)
    const quiet = await place("Quiet")
    await setContentCategories(site.id, LISTING_CONTENT_TYPE, quiet, [empty.id], database)
    await deal("Pizza deal", { listing: napoli })
    await deal("Elsewhere")
    await deal("Ended pizza", { listing: quiet, endDate: "2026-10-01" })
    expect(await titles(`${today}T12:00`, { categoryId: pizza.id })).toEqual([
      "Pizza deal",
    ])
    expect(
      (await readDealCategories(site.id, `${today}T12:00`, database)).map((row) => row.name)
    ).toEqual(["Pizza"])
  })
})

describe("near a place", () => {
  it("keeps listings within the distance, says how far, and leaves out listings with no pin", async () => {
    // Queen and Spadina, and about 1.9 km and 20 km from it.
    const origin = { latitude: 43.6487, longitude: -79.3963 }
    const close = await place("Close", { latitude: 43.6655, longitude: -79.3963 })
    const far = await place("Far", { latitude: 43.8286, longitude: -79.3963 })
    await deal("Close deal", { listing: close })
    await deal("Far deal", { listing: far })
    await deal("No pin")
    resetPublicDirectoryCacheForTests()
    const list = await readDeals(site, 1, `${today}T12:00`, database, {
      near: origin,
      radius: 5,
    })
    expect(list.deals.map((row) => row.title)).toEqual(["Close deal"])
    expect(list.deals[0]?.distanceKm).toBeCloseTo(1.87, 1)
    expect(list.total).toBe(1)
  })
})
