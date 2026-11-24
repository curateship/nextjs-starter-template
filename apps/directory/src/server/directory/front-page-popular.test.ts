import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { POPULAR_MIN_WEEK_VIEWS } from "@/lib/directory/front-page"
import { now } from "@/server/auth/security"
import { readListingsRow } from "@/server/directory/front-page-row-readers"
import { createListing, updateListing } from "@/server/directory/listings"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { customShellTrafficDailyFacts } from "@/server/schema"
import { trafficDay } from "@/server/traffic"
import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"

/**
 * The front page Listings row's "Most viewed this week": the last seven days
 * of views, most first, a listing under the minimum left to the newest, and
 * a full row on a week nobody visited.
 */

let client: PGlite
let database: TestDatabase
let site: string

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

const DAY = 24 * 60 * 60 * 1000

async function published(title: string) {
  const listing = await createListing(site, { title }, database)
  await updateListing(site, listing.id, { status: "published" }, database)
  return listing
}

async function viewed(slug: string, views: number, daysAgo = 0) {
  await database.insert(customShellTrafficDailyFacts).values({
    workspaceId: site,
    day: trafficDay(new Date(now().getTime() - daysAgo * DAY)),
    dimension: "path",
    key: `/directory/${slug}`,
    views,
  })
}

describe("Most viewed this week", () => {
  it("puts the most viewed first, ignores views older than a week and lets the newest fill the rest", async () => {
    const quiet = await published("Quiet Cafe")
    const busy = await published("Busy Cafe")
    const old = await published("Old Favourite")
    const newest = await published("Brand New")
    await viewed(quiet.slug, POPULAR_MIN_WEEK_VIEWS + 1, 2)
    await viewed(busy.slug, 40, 1)
    await viewed(busy.slug, 10, 6)
    // Eight days ago is not this week, and one view this week is under the minimum.
    await viewed(old.slug, 500, 8)
    await viewed(old.slug, 1, 0)

    const row = await readListingsRow(site, { sort: "popular", count: 4 }, database)
    expect(row?.listings.map((listing) => listing.title)).toEqual([busy.title, quiet.title, newest.title, old.title])
  })

  it("is the newest listings on a week nobody visited", async () => {
    await published("First")
    await published("Second")
    const row = await readListingsRow(site, { sort: "popular", count: 4 }, database)
    expect(row?.listings.map((listing) => listing.title)).toEqual(["Second", "First"])
  })
})
