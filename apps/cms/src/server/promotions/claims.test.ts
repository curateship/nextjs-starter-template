import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CLAIMS_PER_HOUR } from "@/lib/promotions/claim-fields"
import { uuid } from "@/server/auth/security"
import { createListing, updateListing } from "@/server/directory/listings"
import { directoryClaims } from "@/server/directory/schema"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  ALL_CLAIMED,
  claimBoxFor,
  claimDeal,
  CLAIMS_CLOSED,
  listClaims,
  newClaimCode,
  removeClaim,
} from "@/server/promotions/claims"
import { dealViewAt } from "@/server/promotions/deal-view"
import { ownerDealClaims } from "@/server/promotions/owner-requests"
import {
  createPromotion,
  updatePromotion,
  type PromotionInput,
} from "@/server/promotions/promotions"
import { readPublicDeal } from "@/server/promotions/public"
import { sitePromotions } from "@/server/promotions/schema"
import { eq } from "drizzle-orm"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Claiming a deal: a name and an email, each person's own code, and an
 * optional limit. "Now" is noon on Monday 5 October 2026 in Toronto.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let userId: string
let listingId: string

const at = new Date("2026-10-05T16:00:00Z")
const now = "2026-10-05T12:00"
let ipCount = 0
/** A new visitor each time, so the hourly limit is only met on purpose. */
const visitor = () => ({ ip: `10.0.0.${(ipCount += 1)}`, at })

function input(overrides: Partial<PromotionInput> = {}): PromotionInput {
  return {
    title: "Free croissant",
    listingId,
    description: "",
    coverImage: "",
    code: "SHARED",
    smallPrint: "",
    dealType: "free_item",
    amount: "",
    headline: "Free croissant",
    status: "published",
    startDate: "2026-10-01",
    endDate: null,
    takesClaims: true,
    claimLimit: "2",
    ...overrides,
  }
}

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  userId = (await insertUser(database)).id
  const listing = await createListing(site.id, { title: "The Bakery" }, database)
  await updateListing(
    site.id,
    listing.id,
    {
      status: "published",
      contactLinks: { address: "1 Bread St", menuLinks: [], socialLinks: [] },
    },
    database
  )
  listingId = listing.id
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

describe("claiming", () => {
  it("gives each person their own code, and the deal and address for the email", async () => {
    const deal = await createPromotion(site.id, userId, input(), database)
    const first = await claimDeal(site.id, deal.id, { name: "Ana", email: "Ana@Example.com" }, visitor(), database)
    const second = await claimDeal(site.id, deal.id, { name: "Bo", email: "bo@example.com" }, visitor(), database)
    expect(first).toMatchObject({
      outcome: "claimed",
      email: "ana@example.com",
      deal: { title: "Free croissant", listingTitle: "The Bakery", listingAddress: "1 Bread St" },
    })
    if (first.outcome !== "claimed" || second.outcome !== "claimed") throw new Error("not claimed")
    expect(first.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    expect(first.code).not.toBe(second.code)
  })

  it("says All claimed once the limit is reached, and frees a place when one is taken away", async () => {
    const deal = await createPromotion(site.id, userId, input(), database)
    await claimDeal(site.id, deal.id, { name: "Ana", email: "ana@example.com" }, visitor(), database)
    await claimDeal(site.id, deal.id, { name: "Bo", email: "bo@example.com" }, visitor(), database)
    expect(
      await claimDeal(site.id, deal.id, { name: "Cy", email: "cy@example.com" }, visitor(), database)
    ).toEqual({ outcome: "refused", problem: ALL_CLAIMED })
    expect(await claimBoxFor(site.id, deal.id, now, database)).toEqual({
      limit: 2,
      left: 0,
      full: true,
      closed: false,
    })

    const [ana] = await listClaims(site.id, deal.id, database)
    await removeClaim(site.id, ana!.id, database)
    expect(
      (await claimDeal(site.id, deal.id, { name: "Cy", email: "cy@example.com" }, visitor(), database)).outcome
    ).toBe("claimed")
  })

  it("lets anyone claim with no limit", async () => {
    const deal = await createPromotion(site.id, userId, input({ claimLimit: "" }), database)
    for (let count = 0; count < 5; count += 1) {
      expect(
        (await claimDeal(site.id, deal.id, { name: `P${count}`, email: `p${count}@example.com` }, visitor(), database)).outcome
      ).toBe("claimed")
    }
    expect(await claimBoxFor(site.id, deal.id, now, database)).toMatchObject({ limit: null, left: null, full: false })
  })

  it("sends the same code again for the same email, and takes no second place", async () => {
    const deal = await createPromotion(site.id, userId, input({ claimLimit: "1" }), database)
    const first = await claimDeal(site.id, deal.id, { name: "Ana", email: "ana@example.com" }, visitor(), database)
    const again = await claimDeal(site.id, deal.id, { name: "Ana", email: " ANA@example.com " }, visitor(), database)
    if (first.outcome !== "claimed") throw new Error("not claimed")
    expect(again).toMatchObject({ outcome: "again", code: first.code })
    expect(await listClaims(site.id, deal.id, database)).toHaveLength(1)
  })

  it("refuses a deal that is over, one not taking claims, and one a visitor can't see", async () => {
    const over = await createPromotion(site.id, userId, input({ startDate: "2026-09-01", endDate: "2026-09-30" }), database)
    expect(
      await claimDeal(site.id, over.id, { name: "Ana", email: "ana@example.com" }, visitor(), database)
    ).toEqual({ outcome: "refused", problem: CLAIMS_CLOSED })
    expect((await claimBoxFor(site.id, over.id, now, database))?.closed).toBe(true)

    const plain = await createPromotion(site.id, userId, input({ takesClaims: false }), database)
    const draft = await createPromotion(site.id, userId, input({ status: "draft" }), database)
    for (const id of [plain.id, draft.id]) {
      expect(
        (await claimDeal(site.id, id, { name: "Ana", email: "ana@example.com" }, visitor(), database)).outcome
      ).toBe("refused")
      expect(await claimBoxFor(site.id, id, now, database)).toBeNull()
    }
  })

  it("checks the name and email before counting, and stops at the hourly limit", async () => {
    const deal = await createPromotion(site.id, userId, input({ claimLimit: "" }), database)
    expect(
      await claimDeal(site.id, deal.id, { name: "", email: "x@example.com" }, visitor(), database)
    ).toEqual({ outcome: "refused", problem: "Enter your name." })
    const from = { ip: "9.9.9.9", at }
    for (let count = 0; count < CLAIMS_PER_HOUR; count += 1) {
      await claimDeal(site.id, deal.id, { name: "P", email: `p${count}@example.com` }, from, database)
    }
    expect(
      await claimDeal(site.id, deal.id, { name: "P", email: "last@example.com" }, from, database)
    ).toMatchObject({ outcome: "refused", problem: expect.stringContaining("in the last hour") })
  })
})

describe("the page", () => {
  it("never shows the shared code while claims are on", async () => {
    const deal = await createPromotion(site.id, userId, input(), database)
    const page = await readPublicDeal(site, deal.slug, database)
    expect(dealViewAt(page!, at).deal.code).toBe("")
    await updatePromotion(site.id, deal.id, { ...input({ takesClaims: false }), slug: deal.slug }, database)
    resetPublicDirectoryCacheForTests()
    const plain = await readPublicDeal(site, deal.slug, database)
    expect(dealViewAt(plain!, at).deal.code).toBe("SHARED")
  })

  it("refuses a limit that isn't a whole number from 1 up", async () => {
    await expect(
      createPromotion(site.id, userId, input({ claimLimit: "0" }), database)
    ).rejects.toThrow("How many can claim it has to be a whole number")
    // Off, a leftover typo in the hidden box is not read.
    const off = await createPromotion(site.id, userId, input({ takesClaims: false, claimLimit: "abc" }), database)
    expect(off).toMatchObject({ takesClaims: false, claimLimit: null })
  })
})

describe("who claimed", () => {
  it("shows the owner only their own deal's claims", async () => {
    const owner = (await insertUser(database)).id
    const stranger = (await insertUser(database)).id
    await database.insert(directoryClaims).values({
      id: uuid(),
      workspaceId: site.id,
      listingId,
      userId: owner,
      contactEmail: "owner@example.com",
      claimantName: "Owner",
      status: "approved",
      createdAt: at,
      updatedAt: at,
    })
    const deal = await createPromotion(site.id, userId, input(), database)
    await database
      .update(sitePromotions)
      .set({ ownerUserId: owner })
      .where(eq(sitePromotions.id, deal.id))
    await claimDeal(site.id, deal.id, { name: "Ana", email: "ana@example.com" }, visitor(), database)

    expect((await ownerDealClaims(owner, deal.id, database))?.map((row) => row.name)).toEqual(["Ana"])
    expect(await ownerDealClaims(stranger, deal.id, database)).toBeNull()
  })
})

describe("codes", () => {
  it("never use letters and digits that are easy to misread", () => {
    for (let count = 0; count < 200; count += 1) {
      expect(newClaimCode()).not.toMatch(/[01ILO]/)
    }
  })
})
