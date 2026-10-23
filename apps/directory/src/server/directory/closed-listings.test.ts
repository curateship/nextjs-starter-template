import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { createCategory } from "@/server/directory/categories"
import {
  CLOSED_LISTING_REVOKE_NOTE,
  endFeaturedSpotsOfClosedListing,
  featuredSpotEndsAt,
  saveFeaturedPlan,
} from "@/server/directory/featured"
import { readListingsRow } from "@/server/directory/front-page-row-readers"
import {
  createListing,
  listListings,
  saveListingAsAdmin,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import {
  directorySearchResults,
  readDirectoryMap,
  readDirectorySuggestions,
  readPublicBrowse,
  readPublicCategory,
  readPublicListing,
} from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  directoryClaims,
  directoryFeaturedEntitlements,
} from "@/server/directory/schema"
import {
  saveDirectoryMapDisplayKey,
  saveDirectoryMapEnabled,
} from "@/server/directory/settings"
import { directoryListingChunkEntries } from "@/server/directory/sitemap"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * A listing marked permanently closed keeps its page and leaves every list.
 *
 * Each list is its own query with its own filter, so each one is proved on its
 * own: a closed bakery turning up on the map while the grid leaves it out is
 * exactly the kind of drift a single test would miss.
 */

const ENCRYPTION_ENV = "CUSTOM_SHELL_SECRET_ENCRYPTION_KEY"
const originalSecret = process.env[ENCRYPTION_ENV]

let client: PGlite
let database: TestDatabase
let site: { id: string; name: string; url: string }

beforeEach(async () => {
  // The map key is stored encrypted, the same as on a running app.
  process.env[ENCRYPTION_ENV] = "test-secret-any-string-works"
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const row = await insertWorkspace(database, { name: "Alpha" })
  site = { id: row.id, name: "Alpha", url: "https://alpha.example.com" }
})

afterEach(async () => {
  if (originalSecret === undefined) delete process.env[ENCRYPTION_ENV]
  else process.env[ENCRYPTION_ENV] = originalSecret
  resetPublicDirectoryCacheForTests()
  await client.close()
})

/** Two pinned bakeries 100 metres apart, both filed under Bakeries. */
async function twoBakeries() {
  const bakeries = await createCategory(
    site.id,
    { name: "Bakeries", slug: "bakeries" },
    database
  )
  const make = async (title: string, slug: string, longitude: number) => {
    const draft = await createListing(site.id, { title, slug }, database)
    const listing = await updateListing(
      site.id,
      draft.id,
      {
        status: "published",
        metaDescription: "Bread and pastry",
        latitude: 43.65,
        longitude,
        hours: { monday: { open: "08:00", close: "16:00" } },
      },
      database
    )
    await setListingCategories(
      site.id,
      listing.id,
      [bakeries.id],
      bakeries.id,
      database
    )
    return listing
  }
  const open = await make("Open Bakery", "open-bakery", -79.38)
  const shut = await make("Shut Bakery", "shut-bakery", -79.3812)
  await updateListing(site.id, shut.id, { status: "closed" }, database)
  resetPublicDirectoryCacheForTests()
  return { open, shut }
}

const slugs = (rows: { slug: string }[]) => rows.map((row) => row.slug)

describe("a closed listing keeps its page", () => {
  it("opens by its address and says it is closed", async () => {
    await twoBakeries()

    const page = await readPublicListing(site, "shut-bakery", {}, database)
    expect(page?.listing.title).toBe("Shut Bakery")
    expect(page?.listing.closed).toBe(true)

    const open = await readPublicListing(site, "open-bakery", {}, database)
    expect(open?.listing.closed).toBe(false)
  })

  it("can be reopened, and is back in the list", async () => {
    const { shut } = await twoBakeries()
    await updateListing(site.id, shut.id, { status: "published" }, database)

    const browse = await readPublicBrowse(
      site,
      { sort: "order", page: 1 },
      database
    )
    expect(slugs(browse.listings).sort()).toEqual([
      "open-bakery",
      "shut-bakery",
    ])
  })

  it("stays in the sitemap, because its page stays up", async () => {
    await twoBakeries()

    const entries = await directoryListingChunkEntries(site.id, 0, database)
    expect(entries?.map((entry) => entry.path)).toEqual([
      "/directory/open-bakery",
      "/directory/shut-bakery",
    ])
  })
})

describe("a closed listing is in no list", () => {
  it("leaves the browse list and its count", async () => {
    await twoBakeries()

    const page = await readPublicBrowse(
      site,
      { sort: "order", page: 1 },
      database
    )
    expect(slugs(page.listings)).toEqual(["open-bakery"])
    expect(page.total).toBe(1)
  })

  it("leaves the site's search and the search box's suggestions", async () => {
    await twoBakeries()

    const results = await directorySearchResults(site.id, "Bakery", 10, database)
    expect(results.map((result) => result.path)).toEqual([
      "/directory/open-bakery",
    ])

    const suggestions = await readDirectorySuggestions(
      site.id,
      "Bakery",
      database
    )
    expect(slugs(suggestions.listings)).toEqual(["open-bakery"])
  })

  it("leaves a category page and the category's count", async () => {
    await twoBakeries()

    const page = await readPublicCategory(
      site,
      "bakeries",
      { page: 1 },
      database
    )
    expect(slugs(page?.listings ?? [])).toEqual(["open-bakery"])
    expect(page?.total).toBe(1)
    expect(page?.category.listingCount).toBe(1)
  })

  it("leaves a front page row", async () => {
    await twoBakeries()

    const row = await readListingsRow(site.id, {}, database)
    expect(slugs(row?.listings ?? [])).toEqual(["open-bakery"])
  })

  it("leaves the map", async () => {
    await twoBakeries()
    await saveDirectoryMapEnabled(site.id, true, database)
    await saveDirectoryMapDisplayKey(site.id, "not-a-real-key-1234", database)

    const map = await readDirectoryMap(site, {}, database)
    expect(slugs(map?.pins ?? [])).toEqual(["open-bakery"])
    expect(map?.total).toBe(1)
  })

  it("leaves the Also nearby row under the place next door", async () => {
    await twoBakeries()

    const page = await readPublicListing(site, "open-bakery", {}, database)
    expect(page?.nearby).toEqual([])

    // The closed page itself still points to the open one nearby.
    const shut = await readPublicListing(site, "shut-bakery", {}, database)
    expect(slugs(shut?.nearby ?? [])).toEqual(["open-bakery"])
  })

  it("is counted by the admin's Closed filter", async () => {
    await twoBakeries()

    const closed = await listListings(site.id, { status: "closed" }, database)
    expect(closed.total).toBe(1)
    expect(closed.listings.map((row) => row.status)).toEqual(["closed"])

    const published = await listListings(
      site.id,
      { status: "published" },
      database
    )
    expect(published.total).toBe(1)
  })
})

describe("closing a listing ends its featured spot", () => {
  /** A paid spot, 20 days left, on the closed bakery or the open one. */
  async function featured(on: "shut" | "open" = "shut") {
    const { shut, open } = await twoBakeries()
    const holder = on === "shut" ? shut : open
    const owner = await insertUser(database)
    const at = now()
    const [claim] = await database
      .insert(directoryClaims)
      .values({
        id: uuid(),
        workspaceId: site.id,
        listingId: holder.id,
        userId: owner.id,
        contactEmail: owner.email,
        claimantName: owner.name,
        status: "approved",
        reviewedAt: at,
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    const plan = await saveFeaturedPlan(
      site.id,
      {
        name: "Thirty days",
        priceCents: 5000,
        currency: "usd",
        durationDays: 30,
        priority: 10,
      },
      database
    )
    const endsAt = new Date(at.getTime() + 20 * 86_400_000)
    const spotId = uuid()
    await database.insert(directoryFeaturedEntitlements).values({
      id: spotId,
      workspaceId: site.id,
      listingId: holder.id,
      claimId: claim.id,
      buyerUserId: owner.id,
      planId: plan.id,
      stripeSessionId: "cs_closed_listing",
      amountTotal: 5000,
      currency: "usd",
      status: "active",
      startsAt: new Date(at.getTime() - 10 * 86_400_000),
      endsAt,
      createdAt: at,
      updatedAt: at,
    })
    return { shut, open, spotId, endsAt }
  }

  async function spotStatus(spotId: string) {
    const [spot] = await database
      .select()
      .from(directoryFeaturedEntitlements)
      .where(eq(directoryFeaturedEntitlements.id, spotId))
    return spot
  }

  it("ends the spot when the window saves the listing as closed, and not otherwise", async () => {
    const { open, spotId } = await featured("open")
    const admin = await insertUser(database)

    // An ordinary save of a featured listing leaves its spot running.
    await saveListingAsAdmin(site.id, open.id, { title: "Open Bakery" }, admin.id, database)
    expect((await spotStatus(spotId))?.status).toBe("active")

    await saveListingAsAdmin(site.id, open.id, { status: "closed" }, admin.id, database)
    const spot = await spotStatus(spotId)
    expect(spot?.status).toBe("revoked")
    expect(spot?.revokeNote).toBe(CLOSED_LISTING_REVOKE_NOTE)
    expect(spot?.revokedByUserId).toBe(admin.id)
  })

  it("tells the window when the spot runs out, and ends it with a note", async () => {
    const { shut, open, spotId, endsAt } = await featured()
    const admin = await insertUser(database)

    expect((await featuredSpotEndsAt(site.id, shut.id, database))?.getTime()).toBe(
      endsAt.getTime()
    )
    expect(await featuredSpotEndsAt(site.id, open.id, database)).toBeNull()

    expect(
      await endFeaturedSpotsOfClosedListing(site.id, shut.id, admin.id, database)
    ).toBe(1)

    const [spot] = await database
      .select()
      .from(directoryFeaturedEntitlements)
      .where(eq(directoryFeaturedEntitlements.id, spotId))
    expect(spot?.status).toBe("revoked")
    expect(spot?.revokeNote).toBe(CLOSED_LISTING_REVOKE_NOTE)
    expect(spot?.revokedByUserId).toBe(admin.id)
    // The money stays as it was paid. Nothing here touches the amount.
    expect(spot?.amountTotal).toBe(5000)
    expect(await featuredSpotEndsAt(site.id, shut.id, database)).toBeNull()

    // Saving it closed again finds nothing left to end.
    expect(
      await endFeaturedSpotsOfClosedListing(site.id, shut.id, admin.id, database)
    ).toBe(0)
  })
})
