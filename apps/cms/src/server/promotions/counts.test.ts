import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createListing, updateListing } from "@/server/directory/listings"
import {
  countDealVisit,
  dealCountsFor,
  resetDealCountSweepForTests,
} from "@/server/promotions/counts"
import {
  createPromotion,
  deletePromotions,
  listPromotions,
  type PromotionInput,
} from "@/server/promotions/promotions"
import { promotionCountVisitors } from "@/server/promotions/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * A deal's views and Show code taps: one per person per deal per day, each
 * counted on its own, and only ever this site's deals on its admin list.
 */

let client: PGlite
let database: TestDatabase
let siteId: string
let userId: string
let listingId: string

const morning = new Date("2026-10-09T09:00:00Z")
const evening = new Date("2026-10-09T22:00:00Z")
const nextDay = new Date("2026-10-10T09:00:00Z")

function input(overrides: Partial<PromotionInput> = {}): PromotionInput {
  return {
    title: "Free cookie",
    listingId,
    description: "",
    coverImage: "",
    code: "COOKIE",
    smallPrint: "",
    dealType: "free_item",
    amount: "",
    headline: "Free cookie",
    status: "published",
    startDate: "2026-10-01",
    endDate: null,
    ...overrides,
  }
}

const view = (promotionId: string, visitorHash: string, at = morning) =>
  countDealVisit({ promotionId, kind: "view", visitorHash }, database, at)
const tap = (promotionId: string, visitorHash: string, at = morning) =>
  countDealVisit({ promotionId, kind: "code", visitorHash }, database, at)

beforeEach(async () => {
  resetDealCountSweepForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
  userId = (await insertUser(database)).id
  const listing = await createListing(siteId, { title: "43 Down" }, database)
  await updateListing(siteId, listing.id, { status: "published" }, database)
  listingId = listing.id
})

afterEach(async () => {
  await client.close()
})

describe("counting", () => {
  it("counts one person once a day, however often they look or tap", async () => {
    const deal = await createPromotion(siteId, userId, input(), database)
    for (let i = 0; i < 5; i += 1) {
      await view(deal.id, "anna")
      await tap(deal.id, "anna", evening)
    }
    await view(deal.id, "ben")
    expect((await dealCountsFor([deal.id], database)).get(deal.id)).toEqual({
      views: 2,
      codeTaps: 1,
    })
  })

  it("counts the same person again the next day", async () => {
    const deal = await createPromotion(siteId, userId, input(), database)
    await view(deal.id, "anna")
    await view(deal.id, "anna", nextDay)
    expect((await dealCountsFor([deal.id], database)).get(deal.id)).toEqual({
      views: 2,
      codeTaps: 0,
    })
  })

  it("keeps each deal's numbers apart", async () => {
    const cookie = await createPromotion(siteId, userId, input(), database)
    const pasta = await createPromotion(
      siteId,
      userId,
      input({ title: "Pasta night" }),
      database
    )
    await view(cookie.id, "anna")
    await view(pasta.id, "anna")
    await tap(pasta.id, "anna")
    const counts = await dealCountsFor([cookie.id, pasta.id], database)
    expect(counts.get(cookie.id)).toEqual({ views: 1, codeTaps: 0 })
    expect(counts.get(pasta.id)).toEqual({ views: 1, codeTaps: 1 })
  })

  it("throws away a finished day's hashes and keeps its numbers", async () => {
    const deal = await createPromotion(siteId, userId, input(), database)
    await view(deal.id, "anna")
    await view(deal.id, "ben", nextDay)
    const left = await database.select().from(promotionCountVisitors)
    expect(left.map((row) => row.day)).toEqual(["2026-10-10"])
    expect((await dealCountsFor([deal.id], database)).get(deal.id)?.views).toBe(2)
  })

  it("goes with the deal when it is deleted", async () => {
    const deal = await createPromotion(siteId, userId, input(), database)
    await view(deal.id, "anna")
    await deletePromotions(siteId, [deal.id], database)
    expect((await dealCountsFor([deal.id], database)).size).toBe(0)
  })
})

describe("Admin → Promotions", () => {
  it("shows each deal's numbers, and none for a deal with no code", async () => {
    const cookie = await createPromotion(siteId, userId, input(), database)
    const plain = await createPromotion(
      siteId,
      userId,
      input({ title: "Happy hour", code: "" }),
      database
    )
    const claimed = await createPromotion(
      siteId,
      userId,
      input({ title: "First fifty", takesClaims: true, claimLimit: "50" }),
      database
    )
    await view(cookie.id, "anna")
    await tap(cookie.id, "anna")
    await view(plain.id, "anna")

    const { promotions } = await listPromotions(siteId, {}, database)
    const byId = new Map(promotions.map((row) => [row.id, row]))
    expect(byId.get(cookie.id)).toMatchObject({ views: 1, codeTaps: 1 })
    expect(byId.get(plain.id)).toMatchObject({ views: 1, codeTaps: null })
    expect(byId.get(claimed.id)).toMatchObject({ views: 0, codeTaps: null })
  })

  it("sorts the whole list by views, biggest first", async () => {
    const quiet = await createPromotion(siteId, userId, input(), database)
    const busy = await createPromotion(
      siteId,
      userId,
      input({ title: "Pasta night" }),
      database
    )
    for (const person of ["anna", "ben", "cleo"]) await view(busy.id, person)
    await view(quiet.id, "anna")
    const { promotions } = await listPromotions(
      siteId,
      { sort: "views" },
      database
    )
    expect(promotions.map((row) => row.id)).toEqual([busy.id, quiet.id])
  })

  it("never shows another site's numbers", async () => {
    const otherSite = (await insertWorkspace(database, { name: "Beta" })).id
    const otherListing = await createListing(
      otherSite,
      { title: "Elsewhere" },
      database
    )
    const theirs = await createPromotion(
      otherSite,
      userId,
      input({ listingId: otherListing.id }),
      database
    )
    await view(theirs.id, "anna")
    const { promotions } = await listPromotions(siteId, {}, database)
    expect(promotions).toEqual([])
  })
})
