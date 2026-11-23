import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import { setContentCategories } from "@/server/directory/content-categories"
import { readDealsRow } from "@/server/directory/front-page-row-readers"
import { setPageVisibility } from "@/server/content/pages"
import { createListing, updateListing } from "@/server/directory/listings"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { LISTING_CONTENT_TYPE } from "@/server/directory/schema"
import { createPromotion } from "@/server/promotions/promotions"
import { readNewestDeals } from "@/server/promotions/public"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Live deals on a category page and in a home page row. "Now" is noon on
 * Monday 5 October 2026 in Toronto, the site's zone.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let userId: string

const at = new Date("2026-10-05T16:00:00Z")
const now = "2026-10-05T12:00"

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  userId = (await insertUser(database)).id
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

/** A published listing, filed under these categories. */
async function place(title: string, categoryIds: string[] = []) {
  const listing = await createListing(site.id, { title }, database)
  await updateListing(site.id, listing.id, { status: "published" }, database)
  if (categoryIds.length) {
    await setContentCategories(
      site.id,
      LISTING_CONTENT_TYPE,
      listing.id,
      categoryIds,
      database
    )
  }
  return listing.id
}

async function deal(
  title: string,
  listingId: string,
  endDate: string | null = null
) {
  const made = await createPromotion(
    site.id,
    userId,
    {
      title,
      listingId,
      description: "",
      coverImage: "",
      code: "",
      smallPrint: "",
      dealType: "percent_off",
      amount: "10",
      headline: "",
      status: "published",
      startDate: "2026-10-01",
      endDate,
    },
    database
  )
  // Published a moment apart, so "newest" has an order to find.
  await new Promise((resolve) => setTimeout(resolve, 5))
  return made
}

/**
 * One front page row of deals, filled the way the shell asks for it: the row's
 * own settings and the site it is on, and null when the row should be left off
 * the page.
 */
function dealsRow(settings: { categoryId?: string | null; count: number }) {
  return readDealsRow(
    site.id,
    { categoryId: settings.categoryId ?? null, count: settings.count },
    database,
    at
  )
}

describe("deals on a category page", () => {
  it("shows the newest live deals at listings filed under it, not its children's", async () => {
    const pizza = await createCategory(site.id, { name: "Pizza" }, database)
    const slices = await createCategory(
      site.id,
      { name: "Slices", parentId: pizza.id },
      database
    )
    const napoli = await place("Napoli", [pizza.id])
    const corner = await place("Corner slice", [slices.id])
    await deal("Older pizza", napoli)
    await deal("Newer pizza", napoli)
    await deal("Slice deal", corner)
    await deal("Ended pizza", napoli, "2026-10-04")

    const shown = await readNewestDeals(
      site,
      now,
      { categoryId: pizza.id, limit: 6 },
      database
    )
    expect(shown.map((row) => row.title)).toEqual([
      "Newer pizza",
      "Older pizza",
    ])
    expect(
      (
        await readNewestDeals(
          site,
          now,
          { categoryId: pizza.id, limit: 1 },
          database
        )
      ).length
    ).toBe(1)
  })

  it("is empty for a category with no live deal", async () => {
    const tacos = await createCategory(site.id, { name: "Tacos" }, database)
    await place("Taqueria", [tacos.id])
    expect(
      await readNewestDeals(
        site,
        now,
        { categoryId: tacos.id, limit: 6 },
        database
      )
    ).toEqual([])
  })
})

describe("a home page row of deals", () => {
  it("fills with the newest deals, as many as it asks for", async () => {
    const napoli = await place("Napoli")
    await deal("First", napoli)
    await deal("Second", napoli)
    await deal("Third", napoli)

    const row = await dealsRow({ count: 2 })
    expect(row?.deals.map((each) => each.title)).toEqual(["Third", "Second"])
    expect(row?.deals[0]?.nowText).toBe("On now")
  })

  it("keeps to its category when it has one", async () => {
    const pizza = await createCategory(site.id, { name: "Pizza" }, database)
    await deal("Pizza deal", await place("Napoli", [pizza.id]))
    await deal("Book deal", await place("Books"))

    const row = await dealsRow({ categoryId: pizza.id, count: 6 })
    expect(row?.deals.map((each) => each.title)).toEqual(["Pizza deal"])
    expect(row?.action.href).toBe(`/deals?category=${pizza.slug}`)
  })

  it("is dropped with no live deal, and when the visitor may not see Deals", async () => {
    expect(await dealsRow({ count: 6 })).toBeNull()

    await deal("Live", await place("Napoli"))
    resetPublicDirectoryCacheForTests()
    expect((await dealsRow({ count: 6 }))?.deals).toHaveLength(1)

    // Every card on the row leads to the Deals page, so a visitor who may not
    // see that page is shown no row rather than a set of closed doors.
    await setPageVisibility(
      site.id,
      { path: "/deals", visibility: "members" },
      database
    )
    resetPublicDirectoryCacheForTests()
    expect(await dealsRow({ count: 6 })).toBeNull()
  })
})
