import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, type TestDatabase } from "@/server/test-support"
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

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

describe("creating and naming", () => {
  it("derives the address from the name and numbers a clash", async () => {
    const first = await createCategory({ name: "Coffee & Tea" }, database)
    expect(first.slug).toBe("coffee-tea")
    const second = await createCategory({ name: "Coffee Tea" }, database)
    expect(second.slug).toBe("coffee-tea-2")
  })

  it("refuses a hand-picked address another category uses", async () => {
    await createCategory({ name: "Food", slug: "food" }, database)
    await expect(
      createCategory({ name: "Feasts", slug: "food" }, database)
    ).rejects.toThrow("already uses the address food")
  })
})

describe("the shape of the tree", () => {
  it("refuses a category under itself or under its own subcategory", async () => {
    const parent = await createCategory({ name: "Parent" }, database)
    const child = await createCategory(
      { name: "Child", parentId: parent.id },
      database
    )
    await expect(
      updateCategory(parent.id, { parentId: parent.id }, database)
    ).rejects.toThrow("under itself")
    await expect(
      updateCategory(parent.id, { parentId: child.id }, database)
    ).rejects.toThrow("its own subcategories")
  })

  it("moves a category to a new parent", async () => {
    const a = await createCategory({ name: "A" }, database)
    const b = await createCategory({ name: "B" }, database)
    await updateCategory(b.id, { parentId: a.id }, database)
    const rows = await listCategories(database)
    expect(rows.find((row) => row.id === b.id)?.parentId).toBe(a.id)
  })
})

describe("deleting", () => {
  it("says what goes before it goes", async () => {
    const parent = await createCategory({ name: "Parent" }, database)
    await createCategory({ name: "Child", parentId: parent.id }, database)
    const listing = await createListing({ title: "Joes" }, database)
    await setListingCategories(listing.id, [parent.id], null, database)

    expect(await categoryDeleteImpact(parent.id, database)).toEqual({
      children: 1,
      listings: 1,
    })
  })

  it("re-hangs children on the deleted one's parent and untags listings", async () => {
    const top = await createCategory({ name: "Top" }, database)
    const middle = await createCategory(
      { name: "Middle", parentId: top.id },
      database
    )
    const leaf = await createCategory(
      { name: "Leaf", parentId: middle.id },
      database
    )
    const listing = await createListing({ title: "Joes" }, database)
    await setListingCategories(listing.id, [middle.id], middle.id, database)

    await deleteCategory(middle.id, database)

    const rows = await listCategories(database)
    expect(rows.map((row) => row.id)).not.toContain(middle.id)
    // The child moved up a level instead of being orphaned or deleted.
    expect(rows.find((row) => row.id === leaf.id)?.parentId).toBe(top.id)
    // The listing itself survives; only the tag went.
    expect(await categoriesForListing(listing.id, database)).toEqual([])
  })
})

describe("counts on the list", () => {
  it("counts each category's own listings", async () => {
    const food = await createCategory({ name: "Food" }, database)
    const bars = await createCategory({ name: "Bars" }, database)
    const a = await createListing({ title: "A" }, database)
    const b = await createListing({ title: "B" }, database)
    await setListingCategories(a.id, [food.id], null, database)
    await setListingCategories(b.id, [food.id, bars.id], null, database)

    const rows = await listCategories(database)
    expect(rows.find((row) => row.id === food.id)?.listingCount).toBe(2)
    expect(rows.find((row) => row.id === bars.id)?.listingCount).toBe(1)
  })
})
