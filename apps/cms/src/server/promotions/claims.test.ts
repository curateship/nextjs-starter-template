import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readScannedCode } from "@/lib/promotions/claim-code"
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
  markCodeUsed,
  newClaimCode,
  readClaimPass,
  readCodeAtCounter,
  removeClaim,
} from "@/server/promotions/claims"
import { dealViewAt } from "@/server/promotions/deal-view"
import {
  ownerDealClaims,
  ownersDealSite,
} from "@/server/promotions/owner-requests"
import {
  createPromotion,
  updatePromotion,
  type PromotionInput,
} from "@/server/promotions/promotions"
import { readPublicDeal } from "@/server/promotions/public"
import { promotionClaims, sitePromotions } from "@/server/promotions/schema"
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

    // The counter's doors take the site from here. A stranger gets no site,
    // so their code never reaches a read at all.
    expect(await ownersDealSite(owner, deal.id, database)).toBe(site.id)
    expect(await ownersDealSite(stranger, deal.id, database)).toBeNull()
  })
})

describe("codes", () => {
  it("never use letters and digits that are easy to misread", () => {
    for (let count = 0; count < 200; count += 1) {
      expect(newClaimCode()).not.toMatch(/[01ILO]/)
    }
  })
})

describe("at the counter", () => {
  /** Claims the deal and hands back the one code that was drawn. */
  async function claimCode(dealId: string, email = "ana@example.com") {
    const claimed = await claimDeal(
      site.id,
      dealId,
      { name: "Ana", email },
      visitor(),
      database
    )
    if (claimed.outcome !== "claimed") throw new Error("not claimed")
    return claimed.code
  }

  it("marks a code used once, and tells the second phone when the first one did", async () => {
    const deal = await createPromotion(site.id, userId, input(), database)
    const code = await claimCode(deal.id)
    const used = new Date("2026-10-05T18:30:00Z")

    const first = await markCodeUsed(site.id, code, userId, used, database)
    expect(first.done).toBe(true)
    expect(first.found?.claim).toMatchObject({ name: "Ana", usedAt: used })

    const later = new Date("2026-10-05T19:00:00Z")
    const second = await markCodeUsed(site.id, code, userId, later, database)
    expect(second.done).toBe(false)
    // The time the first one wrote, never this attempt's.
    expect(second.found?.claim.usedAt).toEqual(used)
  })

  it("reads a code typed any of the ways it is handed over", async () => {
    const deal = await createPromotion(site.id, userId, input(), database)
    const code = await claimCode(deal.id)
    for (const handed of [
      code,
      code.toLowerCase(),
      code.replace("-", ""),
      `https://alpha.example.com/deals/code/${code}`,
    ]) {
      expect(readScannedCode(handed)).toBe(code)
    }
    expect(
      (await readCodeAtCounter(site.id, readScannedCode(code), database))?.deal
    ).toMatchObject({ id: deal.id, title: "Free croissant", ended: false })
  })

  it("never uses a code whose claim was taken away", async () => {
    const deal = await createPromotion(site.id, userId, input(), database)
    const code = await claimCode(deal.id)
    const [ana] = await listClaims(site.id, deal.id, database)
    await removeClaim(site.id, ana!.id, database)

    const answer = await markCodeUsed(site.id, code, userId, at, database)
    expect(answer.done).toBe(false)
    expect(answer.found?.claim).toMatchObject({ cancelled: true, usedAt: null })
  })

  it("never takes a used claim away, and says why", async () => {
    const deal = await createPromotion(site.id, userId, input(), database)
    const code = await claimCode(deal.id)
    await markCodeUsed(site.id, code, userId, at, database)
    const [ana] = await listClaims(site.id, deal.id, database)
    await expect(removeClaim(site.id, ana!.id, database)).rejects.toThrow(
      "used at the counter"
    )
    expect((await listClaims(site.id, deal.id, database))[0]?.usedAt).toEqual(
      at
    )
  })

  it("belongs to one site: another site's counter never finds the code", async () => {
    const deal = await createPromotion(site.id, userId, input(), database)
    const code = await claimCode(deal.id)
    const beta = await insertWorkspace(database, { name: "Beta" })
    expect(await readCodeAtCounter(beta.id, code, database)).toBeNull()
    expect(await markCodeUsed(beta.id, code, userId, at, database)).toEqual({
      done: false,
      found: null,
    })
    expect((await listClaims(site.id, deal.id, database))[0]?.usedAt).toBeNull()
  })

  it("keeps a hidden deal's code off the page a customer shows, while the counter still reads it", async () => {
    const deal = await createPromotion(site.id, userId, input(), database)
    const code = await claimCode(deal.id)
    expect(await readClaimPass(site.id, code, database)).not.toBeNull()

    await updatePromotion(
      site.id,
      deal.id,
      { ...input({ status: "draft" }), slug: deal.slug },
      database
    )
    expect(await readClaimPass(site.id, code, database)).toBeNull()
    expect(await readCodeAtCounter(site.id, code, database)).not.toBeNull()

    await updatePromotion(
      site.id,
      deal.id,
      { ...input({ status: "published" }), slug: deal.slug },
      database
    )
    await updateListing(site.id, listingId, { status: "draft" }, database)
    expect(await readClaimPass(site.id, code, database)).toBeNull()
    expect(await readCodeAtCounter(site.id, code, database)).not.toBeNull()
  })

  it("says the deal has ended, so the counter is told before it honours one", async () => {
    const over = await createPromotion(
      site.id,
      userId,
      input({ startDate: "2026-09-01", endDate: "2026-09-30" }),
      database
    )
    // The claim is written straight in: claiming closes once a deal is over.
    const code = newClaimCode()
    await database.insert(promotionClaims).values({
      id: uuid(),
      workspaceId: site.id,
      promotionId: over.id,
      name: "Ana",
      email: "ana@example.com",
      code,
      createdAt: at,
    })
    expect((await readCodeAtCounter(site.id, code, database))?.deal.ended).toBe(
      true
    )
  })

  it("has no code like that for a code nobody drew", async () => {
    await createPromotion(site.id, userId, input(), database)
    expect(await readCodeAtCounter(site.id, "K7QX-P2MD", database)).toBeNull()
    expect(await readClaimPass(site.id, "K7QX-P2MD", database)).toBeNull()
  })
})
