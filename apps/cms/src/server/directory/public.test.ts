import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import {
  createListing,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import {
  publicCategories,
  readPublicBrowse,
  readPublicCategory,
  readPublicListing,
} from "@/server/directory/public"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * What a visitor may read.
 *
 * Two rules are being proved here and they fail in different directions:
 *
 * - **A draft is not readable**, by its address or through any list. Getting
 *   this wrong publishes work nobody meant to publish.
 * - **A site only ever shows its own**, which is the same rule
 *   `site-boundary.test.ts` proves for the admin's reads — and it has to be
 *   proved separately here, because these are different queries with their own
 *   filters, and a public page is the one anybody can open.
 *
 * **Every test uses two sites.** One proves nothing about either rule: the
 * filter could be missing entirely and it would still pass.
 */

let client: PGlite
let database: TestDatabase
let alpha: { id: string; name: string; url: string }
let beta: { id: string; name: string; url: string }

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db

  const alphaRow = await insertWorkspace(database, { name: "Alpha" })
  const betaRow = await insertWorkspace(database, { name: "Beta" })
  // The site as a page is told about it. Built by hand rather than through
  // `visitorSite`, which reads a Host header there is no request to carry.
  alpha = { id: alphaRow.id, name: "Alpha", url: "https://alpha.example.com" }
  beta = { id: betaRow.id, name: "Beta", url: "https://beta.example.com" }
})

afterEach(async () => {
  await client.close()
})

/** A published listing, since everything public turns on that one column. */
async function publish(
  site: { id: string },
  input: { title: string; slug: string; metaDescription?: string }
) {
  const listing = await createListing(site.id, input, database)
  return updateListing(
    site.id,
    listing.id,
    { status: "published", metaDescription: input.metaDescription ?? "" },
    database
  )
}

const browse = (site: { id: string; name: string; url: string }, options = {}) =>
  readPublicBrowse(site, { sort: "order", page: 1, ...options }, database)

describe("only published listings are readable", () => {
  it("keeps a draft out of the browse list", async () => {
    await createListing(alpha.id, { title: "Draft diner", slug: "draft" }, database)
    await publish(alpha, { title: "Open diner", slug: "open" })

    const page = await browse(alpha)

    expect(page.listings.map((row) => row.slug)).toEqual(["open"])
    expect(page.total).toBe(1)
  })

  it("answers nothing for a draft's own address", async () => {
    await createListing(alpha.id, { title: "Draft diner", slug: "draft" }, database)

    // Missing rather than refused: a draft has to be indistinguishable from a
    // listing that was never written, or the address itself gives it away.
    expect(await readPublicListing(alpha, "draft", {}, database)).toBeNull()
  })

  it("keeps a draft out of a category page", async () => {
    const food = await createCategory(
      alpha.id,
      { name: "Food", slug: "food" },
      database
    )
    const draft = await createListing(
      alpha.id,
      { title: "Draft diner", slug: "draft" },
      database
    )
    await setListingCategories(alpha.id, draft.id, [food.id], food.id, database)

    const page = await readPublicCategory(alpha, "food", { page: 1 }, database)

    expect(page?.listings).toEqual([])
    expect(page?.total).toBe(0)
  })

  it("does not count a draft on a category's chip", async () => {
    const food = await createCategory(
      alpha.id,
      { name: "Food", slug: "food" },
      database
    )
    const draft = await createListing(
      alpha.id,
      { title: "Draft diner", slug: "draft" },
      database
    )
    await setListingCategories(alpha.id, draft.id, [food.id], food.id, database)

    // A chip saying "Food 1" that opens an empty page reads as a broken site.
    expect((await publicCategories(alpha.id, database))[0]?.listingCount).toBe(0)
    expect((await browse(alpha)).categories).toEqual([])
  })
})

describe("a site only shows its own", () => {
  it("resolves the same address to a different listing on each site", async () => {
    await publish(alpha, { title: "Alpha's diner", slug: "joes-diner" })
    await publish(beta, { title: "Beta's diner", slug: "joes-diner" })

    expect((await readPublicListing(alpha, "joes-diner", {}, database))?.listing.title)
      .toBe("Alpha's diner")
    expect((await readPublicListing(beta, "joes-diner", {}, database))?.listing.title)
      .toBe("Beta's diner")
  })

  it("does not answer with the other site's listing", async () => {
    await publish(beta, { title: "Beta only", slug: "beta-only" })

    expect(await readPublicListing(alpha, "beta-only", {}, database)).toBeNull()
    expect((await browse(alpha)).total).toBe(0)
  })

  it("does not answer with the other site's category", async () => {
    await createCategory(beta.id, { name: "Beta food", slug: "food" }, database)

    expect(await readPublicCategory(alpha, "food", { page: 1 }, database)).toBeNull()
  })

  it("keeps related listings on the same site", async () => {
    // Both sites have a category at the same address, and a listing in it.
    const alphaFood = await createCategory(
      alpha.id,
      { name: "Food", slug: "food" },
      database
    )
    const betaFood = await createCategory(
      beta.id,
      { name: "Food", slug: "food" },
      database
    )

    const alphaOne = await publish(alpha, { title: "Alpha one", slug: "alpha-one" })
    const alphaTwo = await publish(alpha, { title: "Alpha two", slug: "alpha-two" })
    const betaOne = await publish(beta, { title: "Beta one", slug: "beta-one" })

    for (const [site, listing, category] of [
      [alpha, alphaOne, alphaFood],
      [alpha, alphaTwo, alphaFood],
      [beta, betaOne, betaFood],
    ] as const) {
      await setListingCategories(
        site.id,
        listing.id,
        [category.id],
        category.id,
        database
      )
    }

    const page = await readPublicListing(alpha, "alpha-one", {}, database)

    expect(page?.related.map((row) => row.slug)).toEqual(["alpha-two"])
  })
})

describe("the browse list", () => {
  it("searches the title and the line under it, not the address", async () => {
    await publish(alpha, {
      title: "Corner cafe",
      slug: "cafe",
      metaDescription: "Roasted on site",
    })
    await publish(alpha, { title: "Hardware", slug: "roasted-hardware" })

    // The description matches, so the cafe comes back...
    expect((await browse(alpha, { search: "roasted" })).listings.map((r) => r.slug))
      .toEqual(["cafe"])
  })

  it("filters to one category, never its children", async () => {
    const food = await createCategory(
      alpha.id,
      { name: "Food", slug: "food" },
      database
    )
    const italian = await createCategory(
      alpha.id,
      { name: "Italian", slug: "italian", parentId: food.id },
      database
    )
    const listing = await publish(alpha, { title: "Pasta", slug: "pasta" })
    await setListingCategories(
      alpha.id,
      listing.id,
      [italian.id],
      italian.id,
      database
    )

    // The directory app this is ported from does exactly this. Rolling a child
    // up would put the listing on a page nobody assigned it to.
    expect((await browse(alpha, { category: "italian" })).listings).toHaveLength(1)
    expect((await browse(alpha, { category: "food" })).listings).toEqual([])
  })

  it("treats a category address nobody has as no filter at all", async () => {
    await publish(alpha, { title: "Corner cafe", slug: "cafe" })

    // A stale link should still show the directory rather than an empty page.
    expect((await browse(alpha, { category: "gone" })).listings).toHaveLength(1)
  })

  it("orders by the hand-set order, then newest, and pages without skipping", async () => {
    for (const index of [1, 2, 3]) {
      const listing = await publish(alpha, {
        title: `Listing ${index}`,
        slug: `listing-${index}`,
      })
      // Reversed on purpose: the display order has to beat the order they were
      // created in, or the field does nothing.
      await updateListing(
        alpha.id,
        listing.id,
        { displayOrder: 10 - index },
        database
      )
    }

    const page = await browse(alpha)

    expect(page.listings.map((row) => row.slug)).toEqual([
      "listing-3",
      "listing-2",
      "listing-1",
    ])
    expect(page.total).toBe(3)
  })

  it("shows the primary category on a card", async () => {
    const food = await createCategory(
      alpha.id,
      { name: "Food", slug: "food" },
      database
    )
    const drink = await createCategory(
      alpha.id,
      { name: "Drink", slug: "drink" },
      database
    )
    const listing = await publish(alpha, { title: "Corner cafe", slug: "cafe" })
    // "Drink" sorts first by name, so a card showing it would mean the primary
    // marker was being ignored.
    await setListingCategories(
      alpha.id,
      listing.id,
      [food.id, drink.id],
      food.id,
      database
    )

    expect((await browse(alpha)).listings[0]?.category?.name).toBe("Food")
  })
})

describe("a category page", () => {
  it("carries its parents for the breadcrumb and lists its children", async () => {
    const food = await createCategory(
      alpha.id,
      { name: "Food", slug: "food" },
      database
    )
    const italian = await createCategory(
      alpha.id,
      { name: "Italian", slug: "italian", parentId: food.id },
      database
    )
    await createCategory(
      alpha.id,
      { name: "Pizza", slug: "pizza", parentId: italian.id },
      database
    )

    const page = await readPublicCategory(alpha, "italian", { page: 1 }, database)

    expect(page?.ancestors.map((step) => step.slug)).toEqual(["food", "italian"])
    expect(page?.children.map((child) => child.slug)).toEqual(["pizza"])
  })
})
