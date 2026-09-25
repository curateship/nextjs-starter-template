import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/media/storage", () => ({
  uploadToR2: vi.fn(async () => undefined),
  deleteFromR2: vi.fn(async () => undefined),
  getPublicMediaUrl: async (path: string) =>
    `https://media.example.test/${path}`,
  R2StorageNotConfiguredError: class extends Error {},
}))

import { blankListingHours } from "@/lib/directory/listing-details"
import { uuid } from "@/server/auth/security"
import { setPageVisibility } from "@/server/content/pages"
import { createListing, updateListing } from "@/server/directory/listings"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { directoryClaims } from "@/server/directory/schema"
import type { VisitorSite } from "@/server/directory/public"
import { dealViewAt } from "@/server/promotions/deal-view"
import {
  decidePromotionRequest,
  endOwnerDeal,
  listPromotionRequests,
  OWNER_DEALS_PER_HOUR,
  ownerDealsFor,
  ownerListingHours,
  sendOwnerDeal,
  sendOwnerDealChange,
} from "@/server/promotions/owner-requests"
import {
  findPromotion,
  reopenPromotion,
  type DealContentInput,
} from "@/server/promotions/promotions"
import { readDeals, readPublicDeal } from "@/server/promotions/public"
import { promotionRequests } from "@/server/promotions/schema"
import { customShellMedia } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * A listing's owner posting deals from My listings, changing them and ending
 * them early: only their own listing, reviewed every time except "End now",
 * and published when approved.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let ownerId: string
let otherOwnerId: string
let adminId: string
let listingId: string
let claimId: string

// Thursday 24 September 2026, noon in Toronto.
const at = new Date("2026-09-24T16:00:00Z")
const now = "2026-09-24T12:00"

async function claim(userId: string, onListing: string, status = "approved") {
  const id = uuid()
  await database.insert(directoryClaims).values({
    id,
    workspaceId: site.id,
    listingId: onListing,
    userId,
    contactEmail: "owner@example.com",
    claimantName: "Owner",
    status,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

function cookie(overrides: Partial<DealContentInput> = {}): DealContentInput {
  return {
    title: "Free cookie with any coffee",
    description: "All week.",
    coverImage: "",
    code: "",
    smallPrint: "",
    dealType: "free_item",
    amount: "",
    headline: "Free cookie",
    startDate: "2026-09-24",
    endDate: "2026-09-30",
    times: blankListingHours(),
    ...overrides,
  }
}

async function sendAndApprove(overrides: Partial<DealContentInput> = {}) {
  const sent = await sendOwnerDeal(ownerId, claimId, cookie(overrides), database, at)
  if (sent.outcome !== "sent") throw new Error(JSON.stringify(sent))
  const [request] = (
    await listPromotionRequests(site.id, { status: "pending" }, database)
  ).requests
  const decided = await decidePromotionRequest(
    site.id,
    request!.id,
    { decision: "approve", reviewerId: adminId },
    database,
    async () => ({ delivered: true })
  )
  return decided.promotionId!
}

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  ownerId = (await insertUser(database, { email: "cafe@example.com", name: "Ari" })).id
  otherOwnerId = (await insertUser(database, { email: "shop@example.com" })).id
  adminId = (await insertUser(database, { email: "admin@example.com" })).id
  const cafe = await createListing(site.id, { title: "Café Luna" }, database)
  await updateListing(site.id, cafe.id, { status: "published" }, database)
  listingId = cafe.id
  claimId = await claim(ownerId, cafe.id)
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

describe("sending a deal", () => {
  it("queues it at the owner's listing, marked new, nothing public yet", async () => {
    expect(
      await sendOwnerDeal(ownerId, claimId, cookie(), database, at)
    ).toMatchObject({ outcome: "sent", listingTitle: "Café Luna" })
    const { requests } = await listPromotionRequests(
      site.id,
      { status: "pending" },
      database
    )
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      kind: "new",
      listingTitle: "Café Luna",
      ownerEmail: "cafe@example.com",
      content: { title: "Free cookie with any coffee", headline: "Free cookie" },
    })
    expect((await readDeals(site, 1, now, database)).total).toBe(0)
  })

  it("refuses a listing the account does not look after", async () => {
    const shop = await createListing(site.id, { title: "The Shop" }, database)
    const theirClaim = await claim(otherOwnerId, shop.id)
    expect(
      await sendOwnerDeal(ownerId, theirClaim, cookie(), database, at)
    ).toEqual({ outcome: "refused", problem: "You do not look after that listing." })
    const pending = await claim(otherOwnerId, listingId, "pending_review")
    expect(
      (await sendOwnerDeal(otherOwnerId, pending, cookie(), database, at)).outcome
    ).toBe("refused")
  })

  it("refuses in words: Deals off, bad content, an end day gone", async () => {
    expect(
      await sendOwnerDeal(ownerId, claimId, cookie({ headline: "" }), database, at)
    ).toMatchObject({ outcome: "refused", problem: expect.stringContaining("Type the headline") })
    expect(
      await sendOwnerDeal(
        ownerId,
        claimId,
        cookie({ startDate: "2026-09-01", endDate: "2026-09-23" }),
        database,
        at
      )
    ).toEqual({
      outcome: "refused",
      problem: "That end day has been. Pick today or a later day.",
    })
    await setPageVisibility(site.id, { path: "/deals", visibility: "off" }, database)
    expect(
      (await sendOwnerDeal(ownerId, claimId, cookie(), database, at)).outcome
    ).toBe("refused")
    expect((await ownerDealsFor(ownerId, database, at)).sites[site.id]).toEqual({
      dealsOn: false,
    })
  })

  it("takes the owner's own photo and nobody else's", async () => {
    const theirs = `${otherOwnerId}/cookie.png`
    await database.insert(customShellMedia).values({
      id: uuid(),
      workspaceId: site.id,
      userId: otherOwnerId,
      filename: "cookie.png",
      originalName: "cookie.png",
      altText: null,
      fileSize: 10,
      mimeType: "image/png",
      fileType: "image",
      storagePath: theirs,
      emailProtectedAt: null,
      createdAt: at,
      updatedAt: at,
    })
    expect(
      await sendOwnerDeal(
        ownerId,
        claimId,
        cookie({ coverImage: `https://media.example.test/${theirs}` }),
        database,
        at
      )
    ).toEqual({
      outcome: "refused",
      problem: "That photo is not one of your uploads. Pick it again.",
    })
  })

  it(`stops at ${OWNER_DEALS_PER_HOUR} an hour`, async () => {
    for (let count = 0; count < OWNER_DEALS_PER_HOUR; count += 1) {
      expect((await sendOwnerDeal(ownerId, claimId, cookie(), database, at)).outcome).toBe("sent")
    }
    expect(
      await sendOwnerDeal(ownerId, claimId, cookie(), database, at)
    ).toMatchObject({ outcome: "refused", problem: expect.stringContaining("in the last hour") })
  })

  it("copies the listing's hours only for its owner", async () => {
    const hours = blankListingHours()
    hours.monday = { open: "08:00", close: "16:00" }
    await updateListing(site.id, listingId, { hours }, database)
    expect((await ownerListingHours(ownerId, claimId, database))?.monday).toEqual(
      hours.monday
    )
    expect(await ownerListingHours(otherOwnerId, claimId, database)).toBeNull()
  })
})

describe("the admin's answer", () => {
  it("publishes an approved deal with the owner as the one who may change it", async () => {
    const id = await sendAndApprove()
    const found = await findPromotion(site.id, id, database)
    expect(found?.promotion).toMatchObject({
      status: "published",
      ownerUserId: ownerId,
      listingId,
      headline: "Free cookie",
    })
    expect(
      (await readDeals(site, 1, now, database)).deals.map((deal) => deal.id)
    ).toEqual([id])
    const [row] = (await ownerDealsFor(ownerId, database, at)).deals[listingId]!
    expect(row).toMatchObject({ status: "approved", live: { id, stage: "on" } })
  })

  it("keeps a rejected deal as a record with the note, and never twice", async () => {
    await sendOwnerDeal(ownerId, claimId, cookie(), database, at)
    const [request] = (
      await listPromotionRequests(site.id, { status: "pending" }, database)
    ).requests
    const sentMail: string[] = []
    await decidePromotionRequest(
      site.id,
      request!.id,
      { decision: "reject", note: "We need a price.", reviewerId: adminId },
      database,
      async (email) => {
        sentMail.push(email.subject)
        return { delivered: true }
      }
    )
    expect(sentMail).toEqual(["About your deal, Free cookie with any coffee"])
    const [row] = (await ownerDealsFor(ownerId, database, at)).deals[listingId]!
    expect(row).toMatchObject({ status: "rejected", reviewNote: "We need a price.", live: null })
    await expect(
      decidePromotionRequest(site.id, request!.id, { decision: "approve", reviewerId: adminId }, database)
    ).rejects.toThrow("Somebody has already dealt with this one.")
  })

  it("never undoes a decision because the email failed", async () => {
    await sendOwnerDeal(ownerId, claimId, cookie(), database, at)
    const [request] = (
      await listPromotionRequests(site.id, { status: "pending" }, database)
    ).requests
    const result = await decidePromotionRequest(
      site.id,
      request!.id,
      { decision: "approve", reviewerId: adminId },
      database,
      async () => {
        throw new Error("mail server down")
      }
    )
    expect(result.emailed).toBe(false)
    expect(result.promotionId).toBeTruthy()
    expect((await readDeals(site, 1, now, database)).total).toBe(1)
  })
})

describe("who sees what", () => {
  it("shows an owner only their own deals, and a new owner none of the old one's", async () => {
    await sendAndApprove()
    expect((await ownerDealsFor(otherOwnerId, database, at)).deals).toEqual({})
    await database
      .update(directoryClaims)
      .set({ status: "rejected" })
      .where(eq(directoryClaims.id, claimId))
    await claim(otherOwnerId, listingId)
    expect((await ownerDealsFor(otherOwnerId, database, at)).deals).toEqual({})
  })
})

describe("changing a live deal", () => {
  it("waits for approval with the live deal untouched, then swaps it in", async () => {
    const id = await sendAndApprove()
    expect(
      await sendOwnerDealChange(ownerId, id, cookie({ dealType: "percent_off", amount: "10" }), database, at)
    ).toMatchObject({ outcome: "sent" })
    expect((await findPromotion(site.id, id, database))?.promotion.headline).toBe("Free cookie")

    const { requests } = await listPromotionRequests(site.id, { status: "pending" }, database)
    expect(requests[0]).toMatchObject({
      kind: "change",
      content: { headline: "10% off" },
      live: { content: { headline: "Free cookie" } },
    })
    const [row] = (await ownerDealsFor(ownerId, database, at)).deals[listingId]!
    expect(row?.live?.changeWaiting).toBe(true)

    expect(
      await sendOwnerDealChange(ownerId, id, cookie(), database, at)
    ).toMatchObject({ outcome: "refused", problem: expect.stringContaining("still waiting") })

    await decidePromotionRequest(
      site.id,
      requests[0]!.id,
      { decision: "approve", reviewerId: adminId },
      database,
      async () => ({ delivered: true })
    )
    const changed = (await findPromotion(site.id, id, database))!.promotion
    expect(changed).toMatchObject({ headline: "10% off", amount: 10, status: "published" })
  })

  it("refuses a deal that is not the account's own", async () => {
    const id = await sendAndApprove()
    expect(
      await sendOwnerDealChange(otherOwnerId, id, cookie(), database, at)
    ).toEqual({ outcome: "refused", problem: "That deal is not one of yours." })
  })
})

describe("End now", () => {
  it("takes the deal off every list at once and its page says it has ended", async () => {
    const id = await sendAndApprove()
    await sendOwnerDealChange(ownerId, id, cookie({ title: "Two cookies" }), database, at)
    expect(await endOwnerDeal(ownerId, id, database)).toEqual({ ended: true })

    expect((await readDeals(site, 1, now, database)).total).toBe(0)
    const slug = (await findPromotion(site.id, id, database))!.promotion.slug
    const page = await readPublicDeal(site, slug, database)
    expect(dealViewAt(page!, at)).toMatchObject({ ended: true, deal: { code: "" } })

    // The waiting change is closed, never approvable later.
    const [change] = await database
      .select()
      .from(promotionRequests)
      .where(eq(promotionRequests.kind, "change"))
    expect(change).toMatchObject({ status: "rejected" })
    const [row] = (await ownerDealsFor(ownerId, database, at)).deals[listingId]!
    expect(row?.live).toMatchObject({ stage: "ended", endedEarly: true })
    expect(
      await sendOwnerDealChange(ownerId, id, cookie(), database, at)
    ).toMatchObject({ outcome: "refused", problem: expect.stringContaining("has ended") })
  })

  it("keeps the first moment when pressed twice", async () => {
    const id = await sendAndApprove()
    await endOwnerDeal(ownerId, id, database)
    const first = (await findPromotion(site.id, id, database))!.promotion.endedAt
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(await endOwnerDeal(ownerId, id, database)).toEqual({ ended: true })
    expect((await findPromotion(site.id, id, database))!.promotion.endedAt).toEqual(first)
  })

  it("is only for the deal's owner, and an admin can start it again", async () => {
    const id = await sendAndApprove()
    expect(await endOwnerDeal(otherOwnerId, id, database)).toEqual({
      ended: false,
      problem: "That deal is not one of yours.",
    })
    await endOwnerDeal(ownerId, id, database)
    await reopenPromotion(site.id, id, database)
    resetPublicDirectoryCacheForTests()
    expect((await readDeals(site, 1, now, database)).total).toBe(1)
  })
})
