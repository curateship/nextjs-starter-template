import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { readDirectoryFrontPage } from "@/server/directory/front-page"
import { createFrontPageSection } from "@/server/directory/front-page-sections"
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

async function insertCategory(name: string, slug: string) {
  const id = uuid()
  const at = new Date()
  await database.insert(categories).values({
    id,
    workspaceId: site.id,
    name,
    slug,
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
    expect(page?.rows[0]?.listings.map((listing) => listing.title)).toEqual([
      "New",
      "Middle",
    ])
    expect(page?.rows[1]?.listings.map((listing) => listing.title)).toEqual([
      "Middle",
    ])
    expect(page?.rows[0]?.listings[1]?.rating).toBe(4.5)
    expect(page?.rows[1]?.browse).toEqual({ category: "cafes", sort: "newest" })
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
    expect(page?.rows[0]?.listings.map((listing) => listing.title)).toEqual([
      "Published",
    ])
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
    expect(page?.rows[0]?.listings.map((listing) => listing.title)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ])
    expect(page?.rows[1]?.listings.map((listing) => listing.title)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ])
    // "A to Z" has no browse equivalent of its own beyond the title order.
    expect(page?.rows[1]?.browse).toEqual({ sort: "title" })
    // "Top rated" sends no order rather than a wrong one.
    expect(page?.rows[0]?.browse).toEqual({})
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
    expect(page?.rows[0]?.listings).toMatchObject([
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
    expect(page?.rows[0]?.layout).toBe("grid")
    expect(page?.mapApiKey).toBeNull()
  })

  it("answers from the cache until a save clears it", async () => {
    await browseSettings()
    await insertListing("First", new Date("2026-01-01"))
    await createFrontPageSection(site.id, { heading: "Everything" }, database)

    const first = await readDirectoryFrontPage(site, database)
    expect(first?.rows[0]?.listings).toHaveLength(1)

    // Written straight to the table, so nothing clears the cache: the read must
    // still be the remembered one.
    await insertListing("Second", new Date("2026-02-01"))
    const cached = await readDirectoryFrontPage(site, database)
    expect(cached?.rows[0]?.listings).toHaveLength(1)

    // Saving a row clears this site's public pages, the same way saving a
    // listing does.
    await createFrontPageSection(site.id, { heading: "And another" }, database)
    const fresh = await readDirectoryFrontPage(site, database)
    expect(fresh?.rows[0]?.listings).toHaveLength(2)
  })
})
