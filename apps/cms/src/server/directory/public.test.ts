import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import {
  createClaim,
  reviewClaim,
  verifyClaim,
} from "@/server/directory/claims"
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
  createCustomSection,
  updateCustomSection,
} from "@/server/directory/custom-sections"
import { listingJsonLd } from "@/lib/directory/public-seo"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import {
  saveDirectoryBrowseCategories,
  saveDirectoryBrowseSettings,
} from "@/server/directory/settings"
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
  resetPublicDirectoryCacheForTests()
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
  resetPublicDirectoryCacheForTests()
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

const browse = (
  site: { id: string; name: string; url: string },
  options = {}
) => readPublicBrowse(site, { sort: "order", page: 1, ...options }, database)

function measuredDatabase() {
  let queries = 0
  const statements: string[] = []
  const measured = drizzle(client, {
    schema,
    logger: {
      logQuery: (query) => {
        queries += 1
        statements.push(query)
      },
    },
  }) as unknown as TestDatabase
  return {
    database: measured,
    queryCount: () => queries,
    statements: () => statements,
  }
}

describe("only published listings are readable", () => {
  it("orders nearby listings by database distance and keeps unpinned listings last", async () => {
    const near = await publish(alpha, { title: "Near", slug: "near" })
    const far = await publish(alpha, { title: "Far", slug: "far" })
    await publish(alpha, { title: "No pin", slug: "no-pin" })
    await updateListing(
      alpha.id,
      near.id,
      { latitude: 43.653, longitude: -79.383 },
      database
    )
    await updateListing(
      alpha.id,
      far.id,
      { latitude: 43.753, longitude: -79.383 },
      database
    )

    const result = await browse(alpha, {
      near: { latitude: 43.653, longitude: -79.383 },
      radius: 5,
      sort: "distance",
    })

    expect(result.sort).toBe("distance")
    expect(result.listings.map((listing) => listing.slug)).toEqual([
      "near",
      "no-pin",
    ])
    expect(result.listings[0]?.distanceKm).toBeLessThan(0.1)
    expect(result.listings[1]?.distanceKm).toBeNull()

    const titled = await browse(alpha, {
      near: { latitude: 43.653, longitude: -79.383 },
      radius: 50,
      sort: "title",
    })
    expect(titled.listings.map((listing) => listing.slug)).toEqual([
      "far",
      "near",
      "no-pin",
    ])

    const defaultRadius = await browse(alpha, {
      near: { latitude: 43.653, longitude: -79.383 },
      sort: "distance",
    })
    expect(defaultRadius.listings.map((listing) => listing.slug)).toEqual([
      "near",
      "no-pin",
    ])
  })

  it("orders a thousand mapped listings with a fixed number of queries", async () => {
    await client.query(
      `insert into directory_listings (
        id, workspace_id, title, slug, meta_description, rating, status,
        display_order, featured_image, gallery, hours, latitude, longitude,
        contact_links, body, created_at, updated_at
      )
      select
        'bulk-' || value,
        $1,
        'Place ' || lpad(value::text, 4, '0'),
        'place-' || value,
        '', null, 'published', 0, '', '[]'::jsonb, '{}'::jsonb,
        43.653 + value * 0.00001, -79.383,
        '{"address":"","menuLinks":[],"socialLinks":[]}'::jsonb,
        '{"type":"doc","content":[]}'::jsonb,
        now(), now()
      from generate_series(1, 1000) as value`,
      [alpha.id]
    )

    const measured = measuredDatabase()
    const result = await readPublicBrowse(
      alpha,
      {
        near: { latitude: 43.653, longitude: -79.383 },
        radius: 5,
        sort: "distance",
        page: 1,
      },
      measured.database
    )

    expect(result.total).toBe(1000)
    expect(result.listings[0]?.title).toBe("Place 0001")
    expect(result.listings[11]?.title).toBe("Place 0012")
    expect(measured.queryCount()).toBeLessThan(10)
    expect(
      measured.statements().filter((query) => query.includes("asin")).length
    ).toBe(1)
  })

  it("drops a cached listing as soon as it becomes a draft", async () => {
    const listing = await publish(alpha, { title: "Open diner", slug: "open" })
    expect((await browse(alpha)).listings.map((row) => row.slug)).toEqual([
      "open",
    ])

    await updateListing(alpha.id, listing.id, { status: "draft" }, database)

    expect((await browse(alpha)).listings).toEqual([])
    expect(await readPublicListing(alpha, "open", {}, database)).toBeNull()
  })

  it("shows a saved title on the next public read", async () => {
    const listing = await publish(alpha, { title: "Old title", slug: "cafe" })
    expect(
      (await readPublicListing(alpha, "cafe", {}, database))?.listing.title
    ).toBe("Old title")

    await updateListing(
      alpha.id,
      listing.id,
      { title: "Fresh title" },
      database
    )

    expect(
      (await readPublicListing(alpha, "cafe", {}, database))?.listing.title
    ).toBe("Fresh title")
  })

  it("returns cleaned gallery, hours and coordinates on the public page", async () => {
    const listing = await publish(alpha, { title: "Mapped cafe", slug: "cafe" })
    await updateListing(
      alpha.id,
      listing.id,
      {
        gallery: ["https://images.example/inside.jpg"],
        hours: { monday: { open: "09:00", close: "17:00" } },
        latitude: 43.6532,
        longitude: -79.3832,
      },
      database
    )

    expect(
      (await readPublicListing(alpha, "cafe", {}, database))?.listing
    ).toMatchObject({
      gallery: ["https://images.example/inside.jpg"],
      hours: { monday: { open: "09:00", close: "17:00" } },
      latitude: 43.6532,
      longitude: -79.3832,
    })
  })

  it("keeps a draft out of the browse list", async () => {
    await createListing(
      alpha.id,
      { title: "Draft diner", slug: "draft" },
      database
    )
    await publish(alpha, { title: "Open diner", slug: "open" })

    const page = await browse(alpha)

    expect(page.listings.map((row) => row.slug)).toEqual(["open"])
    expect(page.total).toBe(1)
  })

  it("answers nothing for a draft's own address", async () => {
    await createListing(
      alpha.id,
      { title: "Draft diner", slug: "draft" },
      database
    )

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
    expect((await publicCategories(alpha.id, database))[0]?.listingCount).toBe(
      0
    )
    expect((await browse(alpha)).categories).toEqual([])
  })
})

describe("a site only shows its own", () => {
  it("reads each visitor's claim after the shared listing page", async () => {
    const listing = await publish(alpha, {
      title: "Claimable cafe",
      slug: "cafe",
    })
    const claimant = await insertUser(database, { email: "owner@example.com" })
    const other = await insertUser(database, { email: "other@example.com" })
    const made = await createClaim(
      alpha.id,
      listing.id,
      claimant.id,
      { contactEmail: "cafe@example.com", claimantName: "Cafe Owner" },
      database
    )

    const claimantPage = await readPublicListing(
      alpha,
      "cafe",
      { viewerId: claimant.id },
      database
    )
    const otherPage = await readPublicListing(
      alpha,
      "cafe",
      { viewerId: other.id },
      database
    )

    expect(claimantPage?.claim.mine).toBe("pending_verification")
    expect(otherPage?.claim.mine).toBeNull()

    expect((await browse(alpha)).listings[0]?.claimed).toBe(false)
    await verifyClaim(made.token, database)
    const admin = await insertUser(database, { role: "admin" })
    await reviewClaim(
      alpha.id,
      made.claim.id,
      { decision: "approve", reviewerId: admin.id },
      database
    )
    expect((await browse(alpha)).listings[0]?.claimed).toBe(true)
  })

  it("resolves the same address to a different listing on each site", async () => {
    await publish(alpha, { title: "Alpha's diner", slug: "joes-diner" })
    await publish(beta, { title: "Beta's diner", slug: "joes-diner" })

    expect(
      (await readPublicListing(alpha, "joes-diner", {}, database))?.listing
        .title
    ).toBe("Alpha's diner")
    expect(
      (await readPublicListing(beta, "joes-diner", {}, database))?.listing.title
    ).toBe("Beta's diner")
  })

  it("does not answer with the other site's listing", async () => {
    await publish(beta, { title: "Beta only", slug: "beta-only" })

    expect(await readPublicListing(alpha, "beta-only", {}, database)).toBeNull()
    expect((await browse(alpha)).total).toBe(0)
  })

  it("does not answer with the other site's category", async () => {
    await createCategory(beta.id, { name: "Beta food", slug: "food" }, database)

    expect(
      await readPublicCategory(alpha, "food", { page: 1 }, database)
    ).toBeNull()
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

    const alphaOne = await publish(alpha, {
      title: "Alpha one",
      slug: "alpha-one",
    })
    const alphaTwo = await publish(alpha, {
      title: "Alpha two",
      slug: "alpha-two",
    })
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
  it("carries a rating on cards and the listing page while leaving it optional", async () => {
    const rated = await publish(alpha, { title: "Rated", slug: "rated" })
    await publish(alpha, { title: "Unrated", slug: "unrated" })
    await updateListing(alpha.id, rated.id, { rating: 4.5 }, database)

    const page = await browse(alpha)

    expect(page.listings.find((row) => row.slug === "rated")?.rating).toBe(4.5)
    expect(
      page.listings.find((row) => row.slug === "unrated")?.rating
    ).toBeNull()
    expect(
      (await readPublicListing(alpha, "rated", {}, database))?.listing.rating
    ).toBe(4.5)
  })

  it("searches the title and the line under it, not the address", async () => {
    await publish(alpha, {
      title: "Corner cafe",
      slug: "cafe",
      metaDescription: "Roasted on site",
    })
    await publish(alpha, { title: "Hardware", slug: "roasted-hardware" })

    // The description matches, so the cafe comes back...
    expect(
      (await browse(alpha, { search: "roasted" })).listings.map((r) => r.slug)
    ).toEqual(["cafe"])
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
    expect(
      (await browse(alpha, { category: "italian" })).listings
    ).toHaveLength(1)
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

    const page = await readPublicCategory(
      alpha,
      "italian",
      { page: 1 },
      database
    )

    expect(page?.ancestors.map((step) => step.slug)).toEqual([
      "food",
      "italian",
    ])
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

describe("the fields a site invented", () => {
  /**
   * Two listings that differ in exactly one way: one has answers under a site's
   * own section, the other does not. Used by both tests below.
   */
  async function twoListings() {
    const section = await createCustomSection(
      alpha.id,
      { name: "The wine" },
      database
    )
    const withFields = await updateCustomSection(
      alpha.id,
      section.id,
      {
        fields: [
          { label: "Grape", type: "text" },
          { label: "Organic", type: "toggle" },
        ],
      },
      database
    )
    const filled = await publish(alpha, { title: "Filled", slug: "filled" })
    await publish(alpha, { title: "Empty", slug: "empty" })
    await updateListing(
      alpha.id,
      filled.id,
      {
        customValues: {
          [withFields.slug]: { grape: "Nebbiolo", organic: true },
        },
      },
      database
    )
    resetPublicDirectoryCacheForTests()
    return { slug: withFields.slug }
  }

  it("shows a section only on the listing that filled it in", async () => {
    await twoListings()

    const filled = await readPublicListing(alpha, "filled", {}, database)
    const empty = await readPublicListing(alpha, "empty", {}, database)

    expect(filled?.listing.customSections).toHaveLength(1)
    expect(filled?.listing.customSections[0]?.name).toBe("The wine")
    expect(
      filled?.listing.customSections[0]?.fields.map((field) => field.label)
    ).toEqual(["Grape", "Organic"])
    expect(empty?.listing.customSections).toEqual([])
  })

  it("never lets another site's sections onto a page", async () => {
    const theirs = await createCustomSection(
      beta.id,
      { name: "Beta only" },
      database
    )
    await updateCustomSection(
      beta.id,
      theirs.id,
      { fields: [{ label: "Trade", type: "text" }] },
      database
    )
    await publish(alpha, { title: "Alpha one", slug: "alpha-one-fields" })
    resetPublicDirectoryCacheForTests()

    const page = await readPublicListing(alpha, "alpha-one-fields", {}, database)
    expect(page?.listing.customSections).toEqual([])
  })

  /**
   * **This test is the point of the feature's search-engine rule, not a
   * formality.** Invented fields are a site's own wording, checked by nobody.
   * They must never end up in the structured data a search engine reads as
   * fact — so the markup for a listing with them filled in has to be identical
   * to the markup for one without. Do not delete this.
   */
  it("puts nothing a site invented into the search-engine markup", async () => {
    await twoListings()

    const filled = await readPublicListing(alpha, "filled", {}, database)
    const empty = await readPublicListing(alpha, "empty", {}, database)
    if (!filled || !empty) throw new Error("Both listings should be readable.")

    const markupFor = (page: typeof filled) =>
      listingJsonLd({
        siteName: page.site.name,
        siteUrl: page.site.url,
        // The two listings differ by name and address as well, and this test
        // is only about the invented fields — so everything else is held the
        // same and only the fields are allowed to vary.
        title: "Same title",
        slug: "same-slug",
        description: "",
        image: page.listing.featuredImage,
        gallery: page.listing.gallery,
        hours: page.listing.hours,
        address: page.listing.contactLinks.address,
        latitude: page.listing.latitude,
        longitude: page.listing.longitude,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })

    expect(markupFor(filled)).toEqual(markupFor(empty))
    expect(JSON.stringify(markupFor(filled))).not.toContain("Nebbiolo")
  })

  it("puts no category cards on a browse page until a site asks for one", async () => {
    const eat = await createCategory(alpha.id, { name: "Eat" }, database)
    const listing = await publish(alpha, { title: "Cafe", slug: "cafe" })
    await setListingCategories(alpha.id, listing.id, [eat.id], eat.id, database)

    expect((await browse(alpha)).categoryCards).toEqual([])
  })

  it("carries the row of category cards once the switch is on", async () => {
    const eat = await createCategory(alpha.id, { name: "Eat" }, database)
    await createCategory(alpha.id, { name: "Nightlife" }, database)
    const listing = await publish(alpha, { title: "Cafe", slug: "cafe" })
    await setListingCategories(alpha.id, listing.id, [eat.id], eat.id, database)

    await saveDirectoryBrowseCategories(
      alpha.id,
      {
        browseCategoriesEnabled: true,
        browseCategorySource: "top-level",
        browsePickedCategoryIds: [],
      },
      database
    )

    const page = await browse(alpha)
    // Nightlife has nothing published in it, so it is not on the row at all.
    expect(page.categoryCards).toMatchObject([{ name: "Eat", listingCount: 1 }])
    // And it is this site's row only.
    expect((await browse(beta)).categoryCards).toEqual([])
  })
})
