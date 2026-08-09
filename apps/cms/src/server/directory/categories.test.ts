import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"
import {
  categoryDeleteImpact,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/server/directory/categories"
import {
  categoriesForListing,
  createListing,
  setListingCategories,
} from "@/server/directory/listings"

/**
 * The category tree's promises: one address per category, no branch can be
 * hung on its own tail, and deleting a parent moves its children up rather
 * than orphaning them.
 */

let client: PGlite
let database: TestDatabase
/** The site every listing and category in these tests belongs to. */
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

describe("creating and naming", () => {
  it("derives the address from the name and numbers a clash", async () => {
    const first = await createCategory(site, { name: "Coffee & Tea" }, database)
    expect(first.slug).toBe("coffee-tea")
    const second = await createCategory(site, { name: "Coffee Tea" }, database)
    expect(second.slug).toBe("coffee-tea-2")
  })

  it("refuses a hand-picked address another category uses", async () => {
    await createCategory(site, { name: "Food", slug: "food" }, database)
    await expect(
      createCategory(site, { name: "Feasts", slug: "food" }, database)
    ).rejects.toThrow("already uses the address food")
  })
})

describe("the shape of the tree", () => {
  it("refuses a category under itself or under its own subcategory", async () => {
    const parent = await createCategory(site, { name: "Parent" }, database)
    const child = await createCategory(site, { name: "Child", parentId: parent.id },
      database
    )
    await expect(
      updateCategory(site, parent.id, { parentId: parent.id }, database)
    ).rejects.toThrow("under itself")
    await expect(
      updateCategory(site, parent.id, { parentId: child.id }, database)
    ).rejects.toThrow("its own subcategories")
  })

  it("moves a category to a new parent", async () => {
    const a = await createCategory(site, { name: "A" }, database)
    const b = await createCategory(site, { name: "B" }, database)
    await updateCategory(site, b.id, { parentId: a.id }, database)
    const rows = await listCategories(site, database)
    expect(rows.find((row) => row.id === b.id)?.parentId).toBe(a.id)
  })
})

describe("deleting", () => {
  it("says what goes before it goes", async () => {
    const parent = await createCategory(site, { name: "Parent" }, database)
    await createCategory(site, { name: "Child", parentId: parent.id }, database)
    const listing = await createListing(site, { title: "Joes" }, database)
    await setListingCategories(site, listing.id, [parent.id], null, database)

    expect(await categoryDeleteImpact(site, parent.id, database)).toEqual({
      children: 1,
      listings: 1,
    })
  })

  it("re-hangs children on the deleted one's parent and untags listings", async () => {
    const top = await createCategory(site, { name: "Top" }, database)
    const middle = await createCategory(site, { name: "Middle", parentId: top.id },
      database
    )
    const leaf = await createCategory(site, { name: "Leaf", parentId: middle.id },
      database
    )
    const listing = await createListing(site, { title: "Joes" }, database)
    await setListingCategories(site, listing.id, [middle.id], middle.id, database)

    await deleteCategory(site, middle.id, database)

    const rows = await listCategories(site, database)
    expect(rows.map((row) => row.id)).not.toContain(middle.id)
    // The child moved up a level instead of being orphaned or deleted.
    expect(rows.find((row) => row.id === leaf.id)?.parentId).toBe(top.id)
    // The listing itself survives; only the tag went.
    expect(await categoriesForListing(site, listing.id, database)).toEqual([])
  })
})

describe("counts on the list", () => {
  it("counts each category's own listings", async () => {
    const food = await createCategory(site, { name: "Food" }, database)
    const bars = await createCategory(site, { name: "Bars" }, database)
    const a = await createListing(site, { title: "A" }, database)
    const b = await createListing(site, { title: "B" }, database)
    await setListingCategories(site, a.id, [food.id], null, database)
    await setListingCategories(site, b.id, [food.id, bars.id], null, database)

    const rows = await listCategories(site, database)
    expect(rows.find((row) => row.id === food.id)?.listingCount).toBe(2)
    expect(rows.find((row) => row.id === bars.id)?.listingCount).toBe(1)
  })
})
