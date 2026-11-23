import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { RECORD_IS_GONE } from "@/lib/bulk-change"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import { createCategory } from "@/server/directory/categories"
import {
  categoriesForListing,
  createListing,
  fileListingsUnderCategory,
  findListing,
  setListingCategories,
  setListingsStatus,
} from "@/server/directory/listings"

/**
 * Changing many listings at once. The promises are the ones an admin can check
 * on screen: a listing already like that is counted as unchanged rather than as
 * a failure, a listing somebody else deleted is named as refused, and nothing
 * outside the selection moves.
 */

let client: PGlite
let database: TestDatabase
let site: string
let otherSite: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database)).id
  otherSite = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

async function makeListing(title: string, workspaceId = site) {
  return createListing(workspaceId, { title }, database)
}

describe("publishing many at once", () => {
  it("publishes the drafts and counts the ones already published", async () => {
    const draft = await makeListing("Joe's Diner")
    const alsoDraft = await makeListing("Sea Breeze Cafe")
    const live = await makeListing("The Old Mill")
    await setListingsStatus(site, [live.id], "published", database)

    const result = await setListingsStatus(
      site,
      [draft.id, alsoDraft.id, live.id],
      "published",
      database
    )

    expect(result.done.sort()).toEqual([draft.id, alsoDraft.id].sort())
    expect(result.same).toEqual([live.id])
    expect(result.kept).toEqual([])
    expect((await findListing(site, draft.id, database))?.status).toBe(
      "published"
    )
  })

  it("names a listing that no longer exists and still changes the rest", async () => {
    const kept = await makeListing("Joe's Diner")
    const result = await setListingsStatus(
      site,
      [kept.id, "a-listing-that-went"],
      "published",
      database
    )

    expect(result.done).toEqual([kept.id])
    expect(result.kept).toEqual([
      { id: "a-listing-that-went", reason: RECORD_IS_GONE },
    ])
  })

  it("leaves another site's listing alone even when its id is sent", async () => {
    const theirs = await makeListing("Their Diner", otherSite)
    const result = await setListingsStatus(
      site,
      [theirs.id],
      "published",
      database
    )

    expect(result.done).toEqual([])
    expect(result.kept).toEqual([{ id: theirs.id, reason: RECORD_IS_GONE }])
    expect((await findListing(otherSite, theirs.id, database))?.status).toBe(
      "draft"
    )
  })

  it("unpublishes the published ones", async () => {
    const live = await makeListing("The Old Mill")
    await setListingsStatus(site, [live.id], "published", database)

    const result = await setListingsStatus(site, [live.id], "draft", database)
    expect(result.done).toEqual([live.id])
    expect((await findListing(site, live.id, database))?.status).toBe("draft")
  })
})

describe("filing many under one category", () => {
  it("adds the category and keeps the ones each listing already had", async () => {
    const restaurants = await createCategory(
      site,
      { name: "Restaurants" },
      database
    )
    const cafes = await createCategory(site, { name: "Cafés" }, database)
    const listing = await makeListing("Sea Breeze Cafe")
    await setListingCategories(
      site,
      listing.id,
      [restaurants.id],
      restaurants.id,
      database
    )

    const result = await fileListingsUnderCategory(
      site,
      [listing.id],
      cafes.id,
      "add",
      database
    )

    expect(result.done).toEqual([listing.id])
    const links = await categoriesForListing(site, listing.id, database)
    expect(links.map((link) => link.categoryId).sort()).toEqual(
      [restaurants.id, cafes.id].sort()
    )
    // The one that was primary stays primary; adding a category does not
    // rewrite which one the breadcrumb names.
    expect(links.find((link) => link.isPrimary)?.categoryId).toBe(
      restaurants.id
    )
  })

  it("counts a listing already in that category as unchanged, not as failed", async () => {
    const cafes = await createCategory(site, { name: "Cafés" }, database)
    const listing = await makeListing("Sea Breeze Cafe")
    await setListingCategories(site, listing.id, [cafes.id], cafes.id, database)

    const result = await fileListingsUnderCategory(
      site,
      [listing.id],
      cafes.id,
      "add",
      database
    )

    expect(result.done).toEqual([])
    expect(result.same).toEqual([listing.id])
    expect(result.kept).toEqual([])
  })

  it("replaces every category with the chosen one and makes it primary", async () => {
    const restaurants = await createCategory(
      site,
      { name: "Restaurants" },
      database
    )
    const bars = await createCategory(site, { name: "Bars" }, database)
    const cafes = await createCategory(site, { name: "Cafés" }, database)
    const listing = await makeListing("Sea Breeze Cafe")
    await setListingCategories(
      site,
      listing.id,
      [restaurants.id, bars.id],
      restaurants.id,
      database
    )

    const result = await fileListingsUnderCategory(
      site,
      [listing.id],
      cafes.id,
      "replace",
      database
    )

    expect(result.done).toEqual([listing.id])
    const links = await categoriesForListing(site, listing.id, database)
    expect(links).toEqual([{ categoryId: cafes.id, isPrimary: true }])
  })

  it("counts a listing whose only category is the chosen one as unchanged on a replace", async () => {
    const cafes = await createCategory(site, { name: "Cafés" }, database)
    const listing = await makeListing("Sea Breeze Cafe")
    await setListingCategories(site, listing.id, [cafes.id], cafes.id, database)

    const result = await fileListingsUnderCategory(
      site,
      [listing.id],
      cafes.id,
      "replace",
      database
    )
    expect(result.same).toEqual([listing.id])
  })

  it("refuses a category from another site rather than filing under it", async () => {
    const theirs = await createCategory(otherSite, { name: "Cafés" }, database)
    const listing = await makeListing("Sea Breeze Cafe")

    await expect(
      fileListingsUnderCategory(site, [listing.id], theirs.id, "add", database)
    ).rejects.toThrow("not on this site any more")
  })

  it("makes the added category primary for a listing that had none", async () => {
    const cafes = await createCategory(site, { name: "Cafés" }, database)
    const listing = await makeListing("Sea Breeze Cafe")

    await fileListingsUnderCategory(
      site,
      [listing.id],
      cafes.id,
      "add",
      database
    )
    const links = await categoriesForListing(site, listing.id, database)
    expect(links).toEqual([{ categoryId: cafes.id, isPrimary: true }])
  })

  it("moves a whole selection in one go and leaves the rest of the site alone", async () => {
    const restaurants = await createCategory(
      site,
      { name: "Restaurants" },
      database
    )
    const cafes = await createCategory(site, { name: "Cafés" }, database)
    const moving = []
    for (const title of ["One", "Two", "Three"]) {
      const listing = await makeListing(title)
      await setListingCategories(
        site,
        listing.id,
        [restaurants.id],
        restaurants.id,
        database
      )
      moving.push(listing)
    }
    const staying = await makeListing("Four")
    await setListingCategories(
      site,
      staying.id,
      [restaurants.id],
      restaurants.id,
      database
    )

    const result = await fileListingsUnderCategory(
      site,
      moving.map((listing) => listing.id),
      cafes.id,
      "replace",
      database
    )

    expect(result.done).toHaveLength(3)
    for (const listing of moving) {
      const links = await categoriesForListing(site, listing.id, database)
      expect(links.map((link) => link.categoryId)).toEqual([cafes.id])
    }
    const untouched = await categoriesForListing(site, staying.id, database)
    expect(untouched.map((link) => link.categoryId)).toEqual([restaurants.id])
  })
})
