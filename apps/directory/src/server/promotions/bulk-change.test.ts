import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, expect, it } from "vitest"

import { createListing, updateListing } from "@/server/directory/listings"
import {
  createPromotion,
  findPromotion,
  setPromotionsStatus,
  type PromotionInput,
} from "@/server/promotions/promotions"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Publishing many deals at once. A deal at a draft listing is published like
 * any other: the Deals page only shows deals at published listings, so the deal
 * waits for its listing rather than being refused.
 */

let client: PGlite
let database: TestDatabase
let site: string
let userId: string
let listingId: string

function input(overrides: Partial<PromotionInput> = {}): PromotionInput {
  return {
    title: "Two-for-one pasta Tuesdays",
    listingId,
    description: "",
    coverImage: "",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    code: "",
    smallPrint: "",
    dealType: "two_for_one",
    amount: "",
    headline: "2 for 1",
    status: "draft",
    ...overrides,
  }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database, { name: "Alpha" })).id
  userId = (await insertUser(database, { name: "Sam Admin" })).id
  listingId = (await createListing(site, { title: "43 Down" }, database)).id
})

afterEach(async () => {
  await client.close()
})

it("publishes the drafts and counts the ones already published", async () => {
  const draft = await createPromotion(site, userId, input(), database)
  const live = await createPromotion(
    site,
    userId,
    input({ title: "Half price wings", status: "published" }),
    database
  )

  const result = await setPromotionsStatus(
    site,
    [draft.id, live.id],
    "published",
    database
  )
  expect(result.done).toEqual([draft.id])
  expect(result.same).toEqual([live.id])
  expect(
    (await findPromotion(site, draft.id, database))?.promotion.status
  ).toBe("published")
})

it("publishes a deal whose listing is still a draft", async () => {
  await updateListing(site, listingId, { status: "draft" }, database)
  const deal = await createPromotion(site, userId, input(), database)

  const result = await setPromotionsStatus(
    site,
    [deal.id],
    "published",
    database
  )
  expect(result.done).toEqual([deal.id])
  expect(result.kept).toEqual([])
})

it("unpublishes without clearing the date of the first publish", async () => {
  const deal = await createPromotion(
    site,
    userId,
    input({ status: "published" }),
    database
  )
  const firstTime = (await findPromotion(site, deal.id, database))?.promotion
    .publishedAt

  await setPromotionsStatus(site, [deal.id], "draft", database)
  await setPromotionsStatus(site, [deal.id], "published", database)
  expect(
    (
      await findPromotion(site, deal.id, database)
    )?.promotion.publishedAt?.toISOString()
  ).toBe(firstTime?.toISOString())
})
