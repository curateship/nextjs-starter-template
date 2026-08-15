import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { readDirectoryFrontPage } from "@/server/directory/front-page"
import {
  directoryClaims,
  directoryFeaturedEntitlements,
  directoryFeaturedPlans,
  directoryListings,
  directorySettings,
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
    contactLinks: { address: "", menuLinks: [], socialLinks: [] },
    body: { type: "doc", content: [] },
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

describe("directory listings front page", () => {
  it("returns null when a site has not deliberately switched it on", async () => {
    await insertListing("Visible elsewhere", new Date())
    expect(await readDirectoryFrontPage(site, database)).toBeNull()
  })

  it("shows the chosen number of newest published listings in one query", async () => {
    const at = new Date()
    await database.insert(directorySettings).values({
      workspaceId: site.id,
      frontPageMode: "newest",
      frontPageCount: 2,
      browseTitle: "Toronto restaurants",
      browseIntro: "Good places to eat.",
      createdAt: at,
      updatedAt: at,
    })
    await insertListing("Old", new Date("2026-01-01"))
    await insertListing("Middle", new Date("2026-02-01"), { rating: 4.5 })
    await insertListing("New", new Date("2026-03-01"))
    await insertListing("Unpublished", new Date("2026-04-01"), {
      status: "draft",
    })
    const otherSite = await insertWorkspace(database)
    await insertListing("Other site", new Date("2026-05-01"), {
      workspaceId: otherSite.id,
    })

    let queries = 0
    const counted = new Proxy(database, {
      get(target, property) {
        if (property === "execute") {
          return (...args: Parameters<TestDatabase["execute"]>) => {
            queries += 1
            return target.execute(...args)
          }
        }
        const value = Reflect.get(target, property) as unknown
        return typeof value === "function" ? value.bind(target) : value
      },
    }) as TestDatabase

    const page = await readDirectoryFrontPage(site, counted)
    expect(queries).toBe(1)
    expect(page).toMatchObject({
      siteName: "Good Food",
      heading: "Toronto restaurants",
      intro: "Good places to eat.",
    })
    expect(page?.listings.map((listing) => listing.title)).toEqual([
      "New",
      "Middle",
    ])
    expect(
      page?.listings.find((listing) => listing.title === "Middle")?.rating
    ).toBe(4.5)
  })

  it("falls back to newest when featured listings are unavailable", async () => {
    const at = new Date()
    await database.insert(directorySettings).values({
      workspaceId: site.id,
      frontPageMode: "featured",
      createdAt: at,
      updatedAt: at,
    })
    await insertListing("Newest fallback", new Date("2026-03-01"))

    const page = await readDirectoryFrontPage(site, database, {
      featuredAvailable: false,
    })
    expect(page?.listings.map((listing) => listing.title)).toEqual([
      "Newest fallback",
    ])
  })

  it("shows only active featured listings when featured is chosen", async () => {
    const at = new Date()
    const user = await insertUser(database)
    const featuredId = await insertListing(
      "Featured place",
      new Date("2026-01-01")
    )
    await insertListing("New but ordinary", new Date("2026-03-01"))
    await database.insert(directorySettings).values({
      workspaceId: site.id,
      frontPageMode: "featured",
      createdAt: at,
      updatedAt: at,
    })

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

    const page = await readDirectoryFrontPage(site, database)
    expect(page?.listings).toMatchObject([
      {
        id: featuredId,
        title: "Featured place",
        featured: true,
        claimed: true,
      },
    ])
  })
})
