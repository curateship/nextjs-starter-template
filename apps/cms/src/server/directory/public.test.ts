import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import {
  createListing,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import {
  directorySearchResults,
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
import { saveDirectoryBrowseSettings } from "@/server/directory/settings"
import * as schema from "@/server/schema"

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

function measuredDatabase() {
  let queries = 0
  const measured = drizzle(client, {
    schema,
    logger: {
      logQuery: () => {
        queries += 1
      },
    },
  }) as unknown as TestDatabase
  return { database: measured, queryCount: () => queries }
}

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

describe("the whole-site search source", () => {
  it("finds only this site's published listings", async () => {
    await publish(alpha, {
      title: "Alpha garage",
      slug: "alpha-garage",
      metaDescription: "Covered parking downtown",
    })
    await publish(beta, {
      title: "Beta garage",
      slug: "beta-garage",
      metaDescription: "Covered parking downtown",
    })
    const draft = await createListing(
      alpha.id,
      { title: "Draft garage", slug: "draft-garage" },
      database
    )
    await updateListing(
      alpha.id,
      draft.id,
      { metaDescription: "Covered parking downtown" },
      database
    )

    const results = await directorySearchResults(
      alpha.id,
      "parking",
      40,
      database
    )

    expect(results).toEqual([
      {
        type: "Listing",
        title: "Alpha garage",
        snippet: "Covered parking downtown",
        path: "/directory/alpha-garage",
      },
    ])
  })

  it("puts title matches first and respects the bound", async () => {
    await publish(alpha, {
      title: "Parking first",
      slug: "parking-first",
      metaDescription: "Downtown",
    })
    await publish(alpha, {
      title: "Garage second",
      slug: "garage-second",
      metaDescription: "Parking downtown",
    })

    const results = await directorySearchResults(
      alpha.id,
      "parking",
      1,
      database
    )

    expect(results.map((result) => result.path)).toEqual([
      "/directory/parking-first",
    ])
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

  it("returns the category's search description and photo", async () => {
    await createCategory(
      alpha.id,
      {
        name: "Cafés",
        slug: "cafes",
        metaDescription: "Independent coffee shops, reviewed and mapped.",
        featuredImage: "https://images.example.test/cafes.jpg",
      },
      database
    )

    const page = await readPublicCategory(alpha, "cafes", { page: 1 }, database)

    expect(page?.category).toMatchObject({
      metaDescription: "Independent coffee shops, reviewed and mapped.",
      featuredImage: "https://images.example.test/cafes.jpg",
    })
  })

  it("counts published listings through every child level without crossing sites", async () => {
    const food = await createCategory(
      alpha.id,
      { name: "Food", slug: "food" },
      database
    )
    const cafes = await createCategory(
      alpha.id,
      {
        name: "Cafés",
        slug: "cafes",
        parentId: food.id,
        featuredImage: "https://images.example.test/cafes.jpg",
      },
      database
    )
    const espresso = await createCategory(
      alpha.id,
      { name: "Espresso", slug: "espresso", parentId: cafes.id },
      database
    )
    const cafe = await publish(alpha, { title: "Corner Café", slug: "corner" })
    const bar = await publish(alpha, {
      title: "Espresso Bar",
      slug: "espresso-bar",
    })
    const draft = await createListing(
      alpha.id,
      { title: "Draft Café", slug: "draft-cafe" },
      database
    )
    await setListingCategories(
      alpha.id,
      cafe.id,
      [cafes.id],
      cafes.id,
      database
    )
    await setListingCategories(
      alpha.id,
      bar.id,
      [espresso.id],
      espresso.id,
      database
    )
    await setListingCategories(
      alpha.id,
      draft.id,
      [espresso.id],
      espresso.id,
      database
    )

    const betaFood = await createCategory(
      beta.id,
      { name: "Food", slug: "food" },
      database
    )
    const betaCafe = await createCategory(
      beta.id,
      { name: "Cafés", slug: "cafes", parentId: betaFood.id },
      database
    )
    const otherSite = await publish(beta, {
      title: "Beta Café",
      slug: "beta-cafe",
    })
    await setListingCategories(
      beta.id,
      otherSite.id,
      [betaCafe.id],
      betaCafe.id,
      database
    )

    const page = await readPublicCategory(alpha, "food", { page: 1 }, database)

    expect(page?.children).toEqual([
      expect.objectContaining({
        slug: "cafes",
        featuredImage: "https://images.example.test/cafes.jpg",
        listingCount: 2,
      }),
    ])
  })

  it("uses the same number of queries for two children and thirty", async () => {
    const parent = await createCategory(
      alpha.id,
      { name: "Places", slug: "places" },
      database
    )
    for (let index = 1; index <= 2; index += 1) {
      await createCategory(
        alpha.id,
        { name: `Child ${index}`, parentId: parent.id },
        database
      )
    }

    const first = measuredDatabase()
    await readPublicCategory(alpha, "places", { page: 1 }, first.database)

    for (let index = 3; index <= 30; index += 1) {
      await createCategory(
        alpha.id,
        { name: `Child ${index}`, parentId: parent.id },
        database
      )
    }

    const second = measuredDatabase()
    await readPublicCategory(alpha, "places", { page: 1 }, second.database)

    expect(first.queryCount()).toBeGreaterThan(0)
    expect(second.queryCount()).toBe(first.queryCount())
  })
})

describe("each site's public directory settings", () => {
  it("uses each site's page size, words, and default order", async () => {
    const alphaListings = []
    const betaListings = []
    for (let index = 1; index <= 8; index += 1) {
      alphaListings.push(
        await publish(alpha, {
          title: `Alpha ${String(index).padStart(2, "0")}`,
          slug: `alpha-${index}`,
        })
      )
      betaListings.push(
        await publish(beta, {
          title: `Beta ${String(index).padStart(2, "0")}`,
          slug: `beta-${index}`,
        })
      )
    }

    const alphaCategory = await createCategory(
      alpha.id,
      { name: "Alpha category", slug: "alpha-category" },
      database
    )
    const betaCategory = await createCategory(
      beta.id,
      { name: "Beta category", slug: "beta-category" },
      database
    )
    for (const listing of alphaListings) {
      await setListingCategories(
        alpha.id,
        listing.id,
        [alphaCategory.id],
        alphaCategory.id,
        database
      )
    }
    for (const listing of betaListings) {
      await setListingCategories(
        beta.id,
        listing.id,
        [betaCategory.id],
        betaCategory.id,
        database
      )
    }

    await saveDirectoryBrowseSettings(
      alpha.id,
      {
        pageSize: 6,
        defaultSort: "title",
        browseTitle: "Alpha places",
        browseIntro: "Alpha introduction",
        featuredFirst: false,
      },
      database
    )
    await saveDirectoryBrowseSettings(
      beta.id,
      {
        pageSize: 7,
        defaultSort: "newest",
        browseTitle: "Beta places",
        browseIntro: "Beta introduction",
        featuredFirst: true,
      },
      database
    )

    const alphaPage = await readPublicBrowse(alpha, { page: 1 }, database)
    const betaPage = await readPublicBrowse(beta, { page: 1 }, database)
    const alphaCategoryPage = await readPublicCategory(
      alpha,
      alphaCategory.slug,
      { page: 1 },
      database
    )
    const betaCategoryPage = await readPublicCategory(
      beta,
      betaCategory.slug,
      { page: 1 },
      database
    )

    expect(alphaPage).toMatchObject({
      pageSize: 6,
      browseTitle: "Alpha places",
      browseIntro: "Alpha introduction",
      sort: "title",
    })
    expect(alphaPage.listings).toHaveLength(6)
    expect(betaPage).toMatchObject({
      pageSize: 7,
      browseTitle: "Beta places",
      browseIntro: "Beta introduction",
      sort: "newest",
    })
    expect(betaPage.listings).toHaveLength(7)
    expect(alphaCategoryPage).toMatchObject({
      pageSize: 6,
      browseTitle: "Alpha places",
    })
    expect(alphaCategoryPage?.listings).toHaveLength(6)
    expect(alphaCategoryPage?.listings[0]?.title).toBe("Alpha 01")
    expect(betaCategoryPage).toMatchObject({
      pageSize: 7,
      browseTitle: "Beta places",
    })
    expect(betaCategoryPage?.listings).toHaveLength(7)
    expect(betaCategoryPage?.listings[0]?.title).toBe("Beta 08")
  })
})
