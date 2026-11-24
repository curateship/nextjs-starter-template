import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ordinal, rankSentence } from "@/lib/directory/listing-rank"
import { now } from "@/server/auth/security"
import { createCategory } from "@/server/directory/categories"
import { createListing, setListingCategories, updateListing } from "@/server/directory/listings"
import { listingCategoryRank } from "@/server/directory/views"
import { customShellTrafficDailyFacts } from "@/server/schema"
import { trafficDay } from "@/server/traffic"
import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"

/**
 * Where an owner's listing stands in its primary category over 30 days: the
 * place in words, shared places, nothing outside the top ten, and nothing in
 * a category too small to rank.
 */

let client: PGlite
let database: TestDatabase
let site: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

describe("ordinal", () => {
  it("says each place the way people say it", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
    ])
    expect(rankSentence({ position: 3, category: "Ramen" })).toBe("3rd most viewed in Ramen over the last 30 days.")
  })
})

describe("listingCategoryRank", () => {
  async function inRamen(title: string, views: number, primary = true) {
    const listing = await createListing(site, { title }, database)
    await updateListing(site, listing.id, { status: "published" }, database)
    await setListingCategories(site, listing.id, primary ? [ramen, other] : [other, ramen], primary ? ramen : other, database)
    if (views) {
      await database.insert(customShellTrafficDailyFacts).values({
        workspaceId: site,
        day: trafficDay(now()),
        dimension: "path",
        key: `/directory/${listing.slug}`,
        views,
      })
    }
    return listing
  }
  let ramen: string
  let other: string

  beforeEach(async () => {
    ramen = (await createCategory(site, { name: "Ramen" }, database)).id
    other = (await createCategory(site, { name: "Late night" }, database)).id
  })

  it("names the place in the primary category, shares a place between equal views, and stops after the top ten", async () => {
    const top = await inRamen("Top Ramen", 90)
    const tieOne = await inRamen("Tie One", 40)
    const tieTwo = await inRamen("Tie Two", 40)
    const fourth = await inRamen("Fourth", 10)
    const unseen = await inRamen("Unseen", 0)

    expect(await listingCategoryRank(site, top.id, database)).toEqual({ position: 1, category: "Ramen" })
    expect(await listingCategoryRank(site, tieOne.id, database)).toEqual({ position: 2, category: "Ramen" })
    expect(await listingCategoryRank(site, tieTwo.id, database)).toEqual({ position: 2, category: "Ramen" })
    expect(await listingCategoryRank(site, fourth.id, database)).toEqual({ position: 4, category: "Ramen" })
    expect(await listingCategoryRank(site, unseen.id, database)).toBeNull()

    for (let index = 0; index < 10; index += 1) await inRamen(`Busier ${index}`, 100 + index)
    expect(await listingCategoryRank(site, fourth.id, database)).toBeNull()
  })

  it("ranks in the primary category, not the first one listed, and says nothing in a category too small to rank", async () => {
    await inRamen("Busy Ramen", 90)
    await inRamen("Quiet Ramen", 1)
    // In Ramen too, where it would be 2nd, but its primary category is Late night.
    const lateFirst = await inRamen("Late Bar", 50, false)
    expect(await listingCategoryRank(site, lateFirst.id, database)).toEqual({ position: 2, category: "Late night" })

    const tiny = (await createCategory(site, { name: "Tiny" }, database)).id
    const alone = await createListing(site, { title: "Alone" }, database)
    await updateListing(site, alone.id, { status: "published" }, database)
    await setListingCategories(site, alone.id, [tiny], tiny, database)
    expect(await listingCategoryRank(site, alone.id, database)).toBeNull()
  })
})
