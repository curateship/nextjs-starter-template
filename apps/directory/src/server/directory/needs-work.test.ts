import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import { createListing, setListingCategories, updateListing } from "@/server/directory/listings"
import { listNeedsWork, needsWorkCount } from "@/server/directory/needs-work"
import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"

/**
 * The Needs work row: published listings missing a photo, opening hours, a
 * write-up or a category, each named, and nothing from another site.
 */

let client: PGlite
let database: TestDatabase
let site: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

const HOURS = { monday: { open: "11:30", close: "22:00" } }
const WRITE_UP = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Pancakes all day." }] }] }

async function published(title: string, on = site) {
  const listing = await createListing(on, { title }, database)
  await updateListing(on, listing.id, { status: "published" }, database)
  return listing
}

describe("the Needs work row", () => {
  it("names each gap of a published listing, leaves out drafts and complete listings, and lets a fixed gap go", async () => {
    const bare = await published("Bare Cafe")
    const complete = await published("Complete Cafe")
    const category = await createCategory(site, { name: "Brunch" }, database)
    await updateListing(
      site,
      complete.id,
      { featuredImage: "https://example.test/photo.jpg", hours: HOURS, body: WRITE_UP },
      database
    )
    await setListingCategories(site, complete.id, [category.id], category.id, database)
    await createListing(site, { title: "Draft Cafe" }, database)
    const elsewhere = (await insertWorkspace(database, { name: "Beta" })).id
    await published("Beta Cafe", elsewhere)

    const page = await listNeedsWork(site, {}, database)
    expect(page.listings.map((row) => row.title)).toEqual(["Bare Cafe"])
    expect(page.listings[0]!.gaps).toEqual(["photo", "hours", "writeUp", "category"])
    expect(await needsWorkCount(site, database)).toBe(1)

    // An empty paragraph is still no write-up, and a half-filled day is still no hours.
    await updateListing(
      site,
      bare.id,
      {
        featuredImage: "https://example.test/bare.jpg",
        hours: { monday: { open: "09:00", close: "" } },
        body: { type: "doc", content: [{ type: "paragraph" }] },
      },
      database
    )
    const after = await listNeedsWork(site, {}, database)
    expect(after.listings[0]!.gaps).toEqual(["hours", "writeUp", "category"])
    expect((await listNeedsWork(site, { gap: "photo" }, database)).total).toBe(0)
    expect((await listNeedsWork(site, { gap: "hours" }, database)).total).toBe(1)
    expect((await listNeedsWork(site, { search: "complete" }, database)).total).toBe(0)
  })
})
