import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  categoriesForListing,
  createListing,
  deleteListings,
  duplicateListing,
  findListing,
  listingDeleteImpact,
  listListings,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import {
  categoryDeleteImpact,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/server/directory/categories"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Two sites, listings and categories in both, and nothing on one reachable
 * from the other.
 *
 * **Every test here uses two sites on purpose.** A test with one proves nothing
 * about tenancy: the filter could be missing entirely and it would still pass.
 * Each of these goes red the moment its site filter is taken out.
 *
 * The one that matters most is the shared address. A listing's slug used to be
 * unique across the whole deployment, so two sites could not both have a
 * `joes-diner` — which is not a small limitation, it is the thing that made
 * running two directories on one deployment impossible.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  await client.close()
})

describe("listings stay on their own site", () => {
  it("lets both sites have a listing at the same address", async () => {
    const onAlpha = await createListing(
      alpha,
      { title: "Joe's Diner", slug: "joes-diner" },
      database
    )
    const onBeta = await createListing(
      beta,
      { title: "Joe's Diner", slug: "joes-diner" },
      database
    )

    // Both keep the address they asked for — neither is quietly numbered.
    expect(onAlpha.slug).toBe("joes-diner")
    expect(onBeta.slug).toBe("joes-diner")
    expect(onAlpha.id).not.toBe(onBeta.id)
  })

  it("resolves that address to the right listing on each site", async () => {
    const onAlpha = await createListing(
      alpha,
      { title: "Alpha's diner", slug: "joes-diner" },
      database
    )
    const onBeta = await createListing(
      beta,
      { title: "Beta's diner", slug: "joes-diner" },
      database
    )

    expect((await findListing(alpha, onAlpha.id, database))?.title).toBe(
      "Alpha's diner"
    )
    expect((await findListing(beta, onBeta.id, database))?.title).toBe(
      "Beta's diner"
    )
    // And each site's own list holds exactly one of them.
    expect((await listListings(alpha, {}, database)).total).toBe(1)
    expect((await listListings(beta, {}, database)).total).toBe(1)
  })

  it("does not find, edit, copy or delete the other site's listing", async () => {
    const theirs = await createListing(
      beta,
      { title: "Beta only", slug: "beta-only" },
      database
    )

    expect(await findListing(alpha, theirs.id, database)).toBeNull()
    await expect(
      updateListing(alpha, theirs.id, { title: "Mine now" }, database)
    ).rejects.toThrow("no longer exists")
    await expect(
      duplicateListing(alpha, theirs.id, database)
    ).rejects.toThrow("no longer exists")

    // A bulk delete simply matches nothing rather than throwing — "none of
    // those were yours" is a count of zero.
    expect(await deleteListings(alpha, [theirs.id], database)).toEqual({
      done: [],
      kept: [theirs.id],
    })
    expect(
      (await listingDeleteImpact(alpha, [theirs.id], database)).listings
    ).toBe(0)

    expect((await findListing(beta, theirs.id, database))?.title).toBe(
      "Beta only"
    )
  })
})

describe("categories stay on their own site", () => {
  it("lets both sites have a category at the same address", async () => {
    const onAlpha = await createCategory(
      alpha,
      { name: "Dentists", slug: "dentists" },
      database
    )
    const onBeta = await createCategory(
      beta,
      { name: "Dentists", slug: "dentists" },
      database
    )

    expect(onAlpha.slug).toBe("dentists")
    expect(onBeta.slug).toBe("dentists")
  })

  it("lists, edits and deletes only its own", async () => {
    const theirs = await createCategory(
      beta,
      { name: "Beta only", slug: "beta-only" },
      database
    )

    expect(await listCategories(alpha, database)).toEqual([])
    await expect(
      updateCategory(alpha, theirs.id, { name: "Mine now" }, database)
    ).rejects.toThrow("no longer exists")
    await expect(deleteCategory(alpha, theirs.id, database)).rejects.toThrow(
      "no longer exists"
    )
    expect(
      (await categoryDeleteImpact(alpha, theirs.id, database)).listings
    ).toBe(0)

    expect((await listCategories(beta, database)).map((row) => row.name)).toEqual(
      ["Beta only"]
    )
  })

  it("refuses to tag a listing with another site's category", async () => {
    const listing = await createListing(
      alpha,
      { title: "Alpha listing", slug: "alpha-listing" },
      database
    )
    const theirCategory = await createCategory(
      beta,
      { name: "Beta only", slug: "beta-only" },
      database
    )

    // Dropped rather than refused, the same as a category that stopped
    // existing between the form loading and the save — but it must not end up
    // on the listing.
    await setListingCategories(alpha, listing.id, [theirCategory.id], null, database)

    expect(await categoriesForListing(alpha, listing.id, database)).toEqual([])
  })
})
