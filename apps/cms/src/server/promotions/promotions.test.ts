import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createListing,
  deleteListings,
} from "@/server/directory/listings"
import {
  createPromotion,
  dealImpactForListings,
  deletePromotions,
  findPromotion,
  listPromotions,
  updatePromotion,
  type PromotionInput,
} from "@/server/promotions/promotions"
import { sitePromotions } from "@/server/promotions/schema"
import { customShellUsers } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Admin → Promotions: an admin makes, edits, publishes, unpublishes and
 * deletes deals on their own site, each at one of that site's listings.
 */

let client: PGlite
let database: TestDatabase
let siteId: string
let otherSiteId: string
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
    status: "draft",
    ...overrides,
  }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
  otherSiteId = (await insertWorkspace(database, { name: "Beta" })).id
  userId = (await insertUser(database, { name: "Sam Admin" })).id
  listingId = (await createListing(siteId, { title: "43 Down" }, database)).id
})

afterEach(async () => {
  await client.close()
})

describe("making a deal", () => {
  it("saves it whole, with a free address from its title and who wrote it", async () => {
    const first = await createPromotion(siteId, userId, input(), database)
    const second = await createPromotion(siteId, userId, input(), database)
    expect(first.slug).toBe("two-for-one-pasta-tuesdays")
    expect(second.slug).toBe("two-for-one-pasta-tuesdays-2")
    expect(first.status).toBe("draft")
    expect(first.publishedAt).toBeNull()

    const found = await findPromotion(siteId, first.id, database)
    expect(found?.createdBy).toBe("Sam Admin")
    expect(found?.listing?.title).toBe("43 Down")
  })

  it("refuses a typed address that is taken", async () => {
    await createPromotion(siteId, userId, input({ slug: "pasta" }), database)
    await expect(
      createPromotion(siteId, userId, input({ slug: "pasta" }), database)
    ).rejects.toThrow("Another deal already uses the address pasta.")
  })

  it("refuses a title that gives no address", async () => {
    await expect(
      createPromotion(siteId, userId, input({ title: "🍝🍝" }), database)
    ).rejects.toThrow("The address part cannot be empty")
  })

  it("needs a listing on this site", async () => {
    const elsewhere = await createListing(
      otherSiteId,
      { title: "Beta Bar" },
      database
    )
    await expect(
      createPromotion(siteId, userId, input({ listingId: "" }), database)
    ).rejects.toThrow("Pick the listing the deal is at.")
    await expect(
      createPromotion(
        siteId,
        userId,
        input({ listingId: elsewhere.id }),
        database
      )
    ).rejects.toThrow("That listing is not on this site any more.")
  })

  it("needs a start day and an end no earlier than it", async () => {
    await expect(
      createPromotion(siteId, userId, input({ startDate: "" }), database)
    ).rejects.toThrow("Pick the first day of the deal.")
    await expect(
      createPromotion(
        siteId,
        userId,
        input({ startDate: "2026-10-05", endDate: "2026-10-04" }),
        database
      )
    ).rejects.toThrow("The deal ends before it starts.")
    const oneDay = await createPromotion(
      siteId,
      userId,
      input({ startDate: "2026-10-05", endDate: "2026-10-05" }),
      database
    )
    expect(oneDay.endDate).toBe("2026-10-05")
    const noEnd = await createPromotion(
      siteId,
      userId,
      input({ endDate: null }),
      database
    )
    expect(noEnd.endDate).toBeNull()
  })
})

describe("changing a deal", () => {
  it("publishes, unpublishes and publishes again, keeping the first publish date", async () => {
    const made = await createPromotion(siteId, userId, input(), database)
    const published = await updatePromotion(
      siteId,
      made.id,
      { ...input({ status: "published" }), slug: made.slug },
      database
    )
    expect(published.publishedAt).not.toBeNull()

    const unpublished = await updatePromotion(
      siteId,
      made.id,
      { ...input({ status: "draft" }), slug: made.slug },
      database
    )
    expect(unpublished.status).toBe("draft")

    const again = await updatePromotion(
      siteId,
      made.id,
      { ...input({ status: "published" }), slug: made.slug },
      database
    )
    expect(again.publishedAt).toEqual(published.publishedAt)
  })

  it("never changes another site's deal", async () => {
    const otherListing = await createListing(
      otherSiteId,
      { title: "Beta Bar" },
      database
    )
    const theirs = await createPromotion(
      otherSiteId,
      userId,
      input({ listingId: otherListing.id }),
      database
    )
    await expect(
      updatePromotion(
        siteId,
        theirs.id,
        { ...input({ title: "Mine now" }), slug: theirs.slug },
        database
      )
    ).rejects.toThrow("That deal no longer exists.")
  })
})

describe("the list", () => {
  it("searches the title, the listing's name and the code, on this site only", async () => {
    const pasta = await createPromotion(
      siteId,
      userId,
      input({ code: "PASTA2" }),
      database
    )
    const otherListing = await createListing(
      otherSiteId,
      { title: "43 Down Beta" },
      database
    )
    await createPromotion(
      otherSiteId,
      userId,
      input({ listingId: otherListing.id }),
      database
    )

    const byListing = await listPromotions(siteId, { search: "43 down" }, database)
    expect(byListing.promotions.map((row) => row.id)).toEqual([pasta.id])
    expect(byListing.promotions[0]?.listingTitle).toBe("43 Down")
    // The long words stay with the window, not the table.
    expect(byListing.promotions[0]).not.toHaveProperty("description")
    const byCode = await listPromotions(siteId, { search: "pasta2" }, database)
    expect(byCode.total).toBe(1)
    const none = await listPromotions(siteId, { search: "sushi" }, database)
    expect(none.total).toBe(0)
  })

  it("filters by status and gives the site's today", async () => {
    await createPromotion(siteId, userId, input(), database)
    await createPromotion(
      siteId,
      userId,
      input({ status: "published" }),
      database
    )
    const drafts = await listPromotions(siteId, { status: "draft" }, database)
    expect(drafts.total).toBe(1)
    expect(drafts.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("deleting", () => {
  it("deletes this site's deals and counts another site's as kept", async () => {
    const mine = await createPromotion(siteId, userId, input(), database)
    const otherListing = await createListing(
      otherSiteId,
      { title: "Beta Bar" },
      database
    )
    const theirs = await createPromotion(
      otherSiteId,
      userId,
      input({ listingId: otherListing.id }),
      database
    )
    expect(
      await deletePromotions(siteId, [mine.id, theirs.id], database)
    ).toEqual({ done: [mine.id], kept: [theirs.id] })
    expect(await findPromotion(otherSiteId, theirs.id, database)).not.toBeNull()
  })

  it("goes with its listing, and the listing's warning counts it first", async () => {
    const made = await createPromotion(siteId, userId, input(), database)
    await createPromotion(siteId, userId, input(), database)
    expect(await dealImpactForListings(siteId, [listingId], database)).toEqual({
      deals: 2,
    })
    expect(
      await dealImpactForListings(otherSiteId, [listingId], database)
    ).toEqual({ deals: 0 })
    await deleteListings(siteId, [listingId], database)
    expect(await findPromotion(siteId, made.id, database)).toBeNull()
  })

  it("stays when the account that wrote it is deleted", async () => {
    const made = await createPromotion(siteId, userId, input(), database)
    await database.delete(customShellUsers).where(eq(customShellUsers.id, userId))
    const found = await findPromotion(siteId, made.id, database)
    expect(found?.createdBy).toBeNull()
    const [row] = await database
      .select({ by: sitePromotions.createdByUserId })
      .from(sitePromotions)
      .where(eq(sitePromotions.id, made.id))
    expect(row?.by).toBeNull()
  })
})
