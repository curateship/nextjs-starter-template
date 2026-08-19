import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { readDirectoryFrontPage } from "@/server/directory/front-page"
import { createFrontPageSection } from "@/server/directory/front-page-sections"
import type { DirectoryFrontPageRow } from "@/lib/directory/front-page"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  categories,
  categoryRelationships,
  directoryClaims,
  directoryFeaturedEntitlements,
  directoryFeaturedPlans,
  directoryListings,
  directorySettings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase
let site: { id: string; name: string }

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  // The read is cached, so one test's answer must not become the next one's.
  resetPublicDirectoryCacheForTests()
  const workspace = await insertWorkspace(database, { name: "Good Food" })
  site = { id: workspace.id, name: workspace.name }
})

afterEach(async () => {
  await client.close()
})

async function insertListing(
  title: string,
  createdAt: Date,
  overrides: {
    workspaceId?: string
    status?: "draft" | "published"
    rating?: number | null
    latitude?: number
    longitude?: number
  } = {}
) {
  const id = uuid()
  await database.insert(directoryListings).values({
    id,
    workspaceId: overrides.workspaceId ?? site.id,
    title,
    slug: title.toLowerCase().replaceAll(" ", "-"),
    status: overrides.status ?? "published",
    rating: overrides.rating,
    latitude: overrides.latitude,
    longitude: overrides.longitude,
    contactLinks: { address: "", menuLinks: [], socialLinks: [] },
    body: { type: "doc", content: [] },
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

async function insertCategory(
  name: string,
  slug: string,
  overrides: { parentId?: string; displayOrder?: number } = {}
) {
  const id = uuid()
  const at = new Date()
  await database.insert(categories).values({
    id,
    workspaceId: site.id,
    name,
    slug,
    parentId: overrides.parentId,
    displayOrder: overrides.displayOrder ?? 0,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

async function putInCategory(listingId: string, categoryId: string) {
  await database.insert(categoryRelationships).values({
    id: uuid(),
    workspaceId: site.id,
    categoryId,
    contentType: LISTING_CONTENT_TYPE,
    contentId: listingId,
    isPrimary: true,
    createdAt: new Date(),
  })
}

async function browseSettings(overrides: Record<string, unknown> = {}) {
  const at = new Date()
  await database.insert(directorySettings).values({
    workspaceId: site.id,
    browseTitle: "Toronto restaurants",
    browseIntro: "Good places to eat.",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  })
}

/**
 * A row's listings, insisting it is a row of listings.
 *
 * The two kinds of row are one union now, so a test that reads `listings` has to
 * say which kind it expected — and fail loudly rather than read `undefined` if a
 * row came back as the wrong kind.
 */
function listingsIn(row: DirectoryFrontPageRow | undefined): string[] {
  if (!row || row.kind !== "listings") {
    throw new Error(`Expected a row of listings, got ${row?.kind ?? "nothing"}`)
  }
  return row.listings.map((listing) => listing.title)
}

function listingsRow(row: DirectoryFrontPageRow | undefined) {
  if (!row || row.kind !== "listings") {
    throw new Error(`Expected a row of listings, got ${row?.kind ?? "nothing"}`)
  }
  return row
}

function cardsIn(row: DirectoryFrontPageRow | undefined) {
  if (!row || row.kind !== "categories") {
    throw new Error(`Expected a row of categories, got ${row?.kind ?? "nothing"}`)
  }
  return row.cards
}

/** Counts every round trip the read makes, whatever shape it takes. */
function countingDatabase(counter: { queries: number }) {
  return new Proxy(database, {
    get(target, property) {
      const value = Reflect.get(target, property) as unknown
      if (property === "execute" || property === "select") {
        return (...args: unknown[]) => {
          counter.queries += 1
          return (value as (...inner: unknown[]) => unknown).apply(target, args)
        }
      }
      return typeof value === "function" ? value.bind(target) : value
    },
  }) as TestDatabase
}

describe("directory listings front page", () => {
  it("has no home page until a site adds a row", async () => {
    await insertListing("Visible elsewhere", new Date())
    expect(await readDirectoryFrontPage(site, database)).toBeNull()
  })

  it("draws the rows in order, each with its own listings", async () => {
    await browseSettings()
    const cafes = await insertCategory("Cafés", "cafes")
    await insertListing("Old", new Date("2026-01-01"))
    const middle = await insertListing("Middle", new Date("2026-02-01"), {
      rating: 4.5,
    })
    await insertListing("New", new Date("2026-03-01"))
    await putInCategory(middle, cafes)

    await createFrontPageSection(
      site.id,
      { heading: "New this week", listingCount: 2 },
      database
    )
    await createFrontPageSection(
      site.id,
      { heading: "Cafés", categoryId: cafes, listingCount: 12 },
      database
    )

    const page = await readDirectoryFrontPage(site, database)
    expect(page).toMatchObject({
      siteName: "Good Food",
      heading: "Toronto restaurants",
      intro: "Good places to eat.",
      mapApiKey: null,
    })
    expect(page?.rows.map((row) => row.heading)).toEqual([
      "New this week",
      "Cafés",
    ])
    expect(listingsIn(page?.rows[0])).toEqual(["New", "Middle"])
    expect(listingsIn(page?.rows[1])).toEqual(["Middle"])
    expect(listingsRow(page?.rows[0]).listings[1]?.rating).toBe(4.5)
    expect(listingsRow(page?.rows[1]).browse).toEqual({
      category: "cafes",
      sort: "newest",
    })
  })

  it("leaves out a row whose filter matches nothing", async () => {
    await browseSettings()
    const empty = await insertCategory("Nightlife", "nightlife")
    await insertListing("Somewhere", new Date("2026-01-01"))

    await createFrontPageSection(site.id, { heading: "Everything" }, database)
    await createFrontPageSection(
      site.id,
      { heading: "Nightlife", categoryId: empty },
      database
    )

    const page = await readDirectoryFrontPage(site, database)
    expect(page?.rows.map((row) => row.heading)).toEqual(["Everything"])
  })

  it("never shows a draft, and never another site's listing", async () => {
    await browseSettings()
    await insertListing("Published", new Date("2026-01-01"))
    await insertListing("Unpublished", new Date("2026-04-01"), {
      status: "draft",
    })
    const otherSite = await insertWorkspace(database)
    await insertListing("Other site", new Date("2026-05-01"), {
      workspaceId: otherSite.id,
    })
    await createFrontPageSection(site.id, { heading: "Everything" }, database)

    const page = await readDirectoryFrontPage(site, database)
    expect(listingsIn(page?.rows[0])).toEqual(["Published"])
  })

  it("orders a row by rating, then by name, when it is asked to", async () => {
    await browseSettings()
    await insertListing("Bravo", new Date("2026-01-01"), { rating: 3 })
    await insertListing("Alpha", new Date("2026-02-01"), { rating: 5 })
    await insertListing("Charlie", new Date("2026-03-01"), { rating: null })
    await createFrontPageSection(
      site.id,
      { heading: "Top rated", sort: "rating" },
      database
    )
    await createFrontPageSection(
      site.id,
      { heading: "A to Z", sort: "name" },
      database
    )

    const page = await readDirectoryFrontPage(site, database)
    expect(listingsIn(page?.rows[0])).toEqual(["Alpha", "Bravo", "Charlie"])
    expect(listingsIn(page?.rows[1])).toEqual(["Alpha", "Bravo", "Charlie"])
    // "A to Z" has no browse equivalent of its own beyond the title order.
    expect(listingsRow(page?.rows[1]).browse).toEqual({ sort: "title" })
    // "Top rated" sends no order rather than a wrong one.
    expect(listingsRow(page?.rows[0]).browse).toEqual({})
  })

  it("shows only active featured listings in a featured row", async () => {
    await browseSettings()
    const at = new Date()
    const user = await insertUser(database)
    const featuredId = await insertListing(
      "Featured place",
      new Date("2026-01-01")
    )
    await insertListing("New but ordinary", new Date("2026-03-01"))

    const claimId = uuid()
    await database.insert(directoryClaims).values({
      id: claimId,
      workspaceId: site.id,
      listingId: featuredId,
      userId: user.id,
      contactEmail: user.email,
      claimantName: user.name,
      status: "approved",
      createdAt: at,
      updatedAt: at,
    })
    const planId = uuid()
    await database.insert(directoryFeaturedPlans).values({
      id: planId,
      workspaceId: site.id,
      name: "Front page",
      priceCents: 100,
      durationDays: 7,
      priority: 10,
      createdAt: at,
      updatedAt: at,
    })
    await database.insert(directoryFeaturedEntitlements).values({
      id: uuid(),
      workspaceId: site.id,
      listingId: featuredId,
      claimId,
      buyerUserId: user.id,
      planId,
      stripeSessionId: uuid(),
      amountTotal: 100,
      currency: "usd",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60_000),
      createdAt: at,
      updatedAt: at,
    })

    await createFrontPageSection(
      site.id,
      { heading: "Featured", sort: "featured" },
      database
    )

    const page = await readDirectoryFrontPage(site, database)
    expect(listingsRow(page?.rows[0]).listings).toMatchObject([
      { id: featuredId, title: "Featured place", featured: true, claimed: true },
    ])
  })

  it("reads six rows in one query, the same as one row", async () => {
    await browseSettings()
    for (let index = 0; index < 12; index += 1) {
      await insertListing(`Place ${index}`, new Date(2026, 0, index + 1))
    }

    await createFrontPageSection(site.id, { heading: "One" }, database)
    resetPublicDirectoryCacheForTests()
    const one = { queries: 0 }
    await readDirectoryFrontPage(site, countingDatabase(one))
    expect(one.queries).toBe(1)

    for (const heading of ["Two", "Three", "Four", "Five", "Six"]) {
      await createFrontPageSection(site.id, { heading }, database)
    }
    resetPublicDirectoryCacheForTests()
    const six = { queries: 0 }
    const page = await readDirectoryFrontPage(site, countingDatabase(six))
    expect(page?.rows).toHaveLength(6)
    expect(six.queries).toBe(1)
  })

  it("draws a row of category cards, counting everything nested beneath", async () => {
    await browseSettings()
    const eat = await insertCategory("Eat", "eat", { displayOrder: 0 })
    const italian = await insertCategory("Italian", "italian", {
      parentId: eat,
      displayOrder: 1,
    })
    const stay = await insertCategory("Stay", "stay", { displayOrder: 2 })
    await insertCategory("Nightlife", "nightlife", { displayOrder: 3 })

    const direct = await insertListing("Cafe", new Date("2026-01-01"))
    const nested = await insertListing("Trattoria", new Date("2026-02-01"))
    const hotel = await insertListing("Hotel", new Date("2026-03-01"))
    await putInCategory(direct, eat)
    await putInCategory(nested, italian)
    await putInCategory(hotel, stay)

    await createFrontPageSection(
      site.id,
      { heading: "Browse by category", kind: "categories" },
      database
    )

    const page = await readDirectoryFrontPage(site, database)
    const cards = cardsIn(page?.rows[0])
    // Nightlife has nothing published under it, so it is not a card at all.
    expect(cards.map((card) => card.name)).toEqual(["Eat", "Stay"])
    // Eat's own listing plus the one under Italian, counted once each.
    expect(cards.map((card) => card.listingCount)).toEqual([2, 1])
  })

  it("shows hand-picked categories in the admin's order", async () => {
    await browseSettings()
    const eat = await insertCategory("Eat", "eat", { displayOrder: 0 })
    const stay = await insertCategory("Stay", "stay", { displayOrder: 1 })
    await putInCategory(
      await insertListing("Cafe", new Date("2026-01-01")),
      eat
    )
    await putInCategory(
      await insertListing("Hotel", new Date("2026-02-01")),
      stay
    )

    await createFrontPageSection(
      site.id,
      {
        heading: "Start here",
        kind: "categories",
        categorySource: "picked",
        // Deliberately the reverse of the Categories screen's own order.
        pickedCategoryIds: [stay, eat],
      },
      database
    )

    expect(cardsIn((await readDirectoryFrontPage(site, database))?.rows[0]).map(
      (card) => card.name
    )).toEqual(["Stay", "Eat"])
  })

  it("leaves out a category row whose categories are all empty", async () => {
    await browseSettings()
    await insertCategory("Nightlife", "nightlife")
    await insertListing("Uncategorised", new Date("2026-01-01"))

    await createFrontPageSection(
      site.id,
      { heading: "Browse by category", kind: "categories" },
      database
    )

    // No cards means no row, rather than a heading over a blank space — and with
    // that the only row gone, the site has no listings home page at all.
    expect(await readDirectoryFrontPage(site, database)).toBeNull()
  })

  it("costs three queries with category rows, however many there are", async () => {
    await browseSettings()
    const eat = await insertCategory("Eat", "eat")
    await putInCategory(await insertListing("Cafe", new Date("2026-01-01")), eat)

    await createFrontPageSection(site.id, { heading: "Listings" }, database)
    await createFrontPageSection(
      site.id,
      { heading: "Categories one", kind: "categories" },
      database
    )
    await createFrontPageSection(
      site.id,
      { heading: "Categories two", kind: "categories" },
      database
    )
    await createFrontPageSection(
      site.id,
      {
        heading: "Categories three",
        kind: "categories",
        categorySource: "picked",
        pickedCategoryIds: [eat],
      },
      database
    )

    resetPublicDirectoryCacheForTests()
    const counter = { queries: 0 }
    const page = await readDirectoryFrontPage(site, countingDatabase(counter))
    expect(page?.rows).toHaveLength(4)
    // One for every row of listings, then one for the categories and one for
    // their counts — shared by all three category rows rather than run per row.
    expect(counter.queries).toBe(3)
  })

  it("remembers that a site has no rows, rather than asking again", async () => {
    await browseSettings()
    await insertListing("Somewhere", new Date("2026-01-01"))

    // Every site that does not use the feature answers this on its busiest
    // page, so the "no" has to be remembered like any other answer.
    const counter = { queries: 0 }
    const counted = countingDatabase(counter)
    expect(await readDirectoryFrontPage(site, counted)).toBeNull()
    expect(counter.queries).toBe(1)
    expect(await readDirectoryFrontPage(site, counted)).toBeNull()
    expect(counter.queries).toBe(1)

    // And adding a row still clears it, so the remembered "no" cannot stick.
    await createFrontPageSection(site.id, { heading: "Everything" }, database)
    expect((await readDirectoryFrontPage(site, database))?.rows).toHaveLength(1)
  })

  it("turns a map row into a grid when the site has no map key", async () => {
    await browseSettings({ mapEnabled: true })
    await insertListing("Mappable", new Date("2026-01-01"), {
      latitude: 43.65,
      longitude: -79.38,
    })
    await createFrontPageSection(
      site.id,
      { heading: "On the map", layout: "map" },
      database
    )

    const page = await readDirectoryFrontPage(site, database)
    expect(listingsRow(page?.rows[0]).layout).toBe("grid")
    expect(page?.mapApiKey).toBeNull()
  })

  it("answers from the cache until a save clears it", async () => {
    await browseSettings()
    await insertListing("First", new Date("2026-01-01"))
    await createFrontPageSection(site.id, { heading: "Everything" }, database)

    const first = await readDirectoryFrontPage(site, database)
    expect(listingsRow(first?.rows[0]).listings).toHaveLength(1)

    // Written straight to the table, so nothing clears the cache: the read must
    // still be the remembered one.
    await insertListing("Second", new Date("2026-02-01"))
    const cached = await readDirectoryFrontPage(site, database)
    expect(listingsRow(cached?.rows[0]).listings).toHaveLength(1)

    // Saving a row clears this site's public pages, the same way saving a
    // listing does.
    await createFrontPageSection(site.id, { heading: "And another" }, database)
    const fresh = await readDirectoryFrontPage(site, database)
    expect(listingsRow(fresh?.rows[0]).listings).toHaveLength(2)
  })
})
