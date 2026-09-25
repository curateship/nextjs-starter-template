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

describe("the type and headline", () => {
  it("builds money off and percent off from the number", async () => {
    const money = await createPromotion(
      siteId,
      userId,
      input({ dealType: "money_off", amount: "5.50", headline: "ignored" }),
      database
    )
    expect(money).toMatchObject({
      dealType: "money_off",
      amount: 5.5,
      headline: "$5.50 off",
    })
    const percent = await createPromotion(
      siteId,
      userId,
      input({ dealType: "percent_off", amount: "20", headline: "" }),
      database
    )
    expect(percent.headline).toBe("20% off")
  })

  it("keeps a typed headline and no number for the other types", async () => {
    const made = await createPromotion(
      siteId,
      userId,
      input({ dealType: "free_item", amount: "5", headline: " Free dessert " }),
      database
    )
    expect(made).toMatchObject({
      dealType: "free_item",
      amount: null,
      headline: "Free dessert",
    })
  })

  it("refuses a missing type, number or headline in words", async () => {
    await expect(
      createPromotion(siteId, userId, input({ dealType: "" }), database)
    ).rejects.toThrow("Pick the type of deal.")
    await expect(
      createPromotion(siteId, userId, input({ dealType: "bogo" }), database)
    ).rejects.toThrow("Pick the type of deal.")
    await expect(
      createPromotion(
        siteId,
        userId,
        input({ dealType: "percent_off", amount: "" }),
        database
      )
    ).rejects.toThrow("Type the percent off as a whole number from 1 to 100.")
    await expect(
      createPromotion(
        siteId,
        userId,
        input({ dealType: "other", headline: "  " }),
        database
      )
    ).rejects.toThrow("Type the headline")
    await expect(
      createPromotion(
        siteId,
        userId,
        input({ dealType: "other", headline: "x".repeat(25) }),
        database
      )
    ).rejects.toThrow("Keep the headline to 24 characters.")
  })

  it("leaves an old deal without one until it is saved, and then needs one", async () => {
    const made = await createPromotion(siteId, userId, input(), database)
    // What a deal made before migration 0096 looks like.
    await database
      .update(sitePromotions)
      .set({ dealType: null, amount: null, headline: "" })
      .where(eq(sitePromotions.id, made.id))
    const old = await findPromotion(siteId, made.id, database)
    expect(old?.promotion).toMatchObject({ dealType: null, headline: "" })

    await expect(
      updatePromotion(
        siteId,
        made.id,
        { ...input({ dealType: "" }), slug: made.slug },
        database
      )
    ).rejects.toThrow("Pick the type of deal.")
    const saved = await updatePromotion(
      siteId,
      made.id,
      { ...input({ dealType: "percent_off", amount: "15" }), slug: made.slug },
      database
    )
    expect(saved.headline).toBe("15% off")
  })

  it("is held together by the database too", async () => {
    const made = await createPromotion(siteId, userId, input(), database)
    const breaks = (values: Partial<typeof sitePromotions.$inferInsert>) =>
      database
        .update(sitePromotions)
        .set(values)
        .where(eq(sitePromotions.id, made.id))
    await expect(breaks({ headline: "" })).rejects.toThrow()
    await expect(breaks({ dealType: "percent_off", amount: null })).rejects.toThrow()
    await expect(breaks({ amount: 5 })).rejects.toThrow()
    await expect(breaks({ dealType: "bogo" })).rejects.toThrow()
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
