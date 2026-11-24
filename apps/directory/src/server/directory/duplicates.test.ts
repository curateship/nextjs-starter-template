import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { MERGE_ERRORS } from "@/lib/directory/listing-duplicates"
import { now, uuid } from "@/server/auth/security"
import {
  duplicatePairCount,
  listDuplicatePairs,
  markNotDuplicate,
  mergedSpotNote,
  mergeListings,
} from "@/server/directory/duplicates"
import { saveFeaturedPlan } from "@/server/directory/featured"
import { createListing, findListing, updateListing } from "@/server/directory/listings"
import { currentAddressFor } from "@/server/directory/old-addresses"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { createSaveCollection } from "@/server/directory/saves"
import {
  directoryClaims,
  directoryFeaturedCheckouts,
  directoryFeaturedEntitlements,
  directorySaveCollections,
  directorySaveItems,
} from "@/server/directory/schema"
import { createEvent } from "@/server/events/events"
import { siteEvents } from "@/server/events/schema"
import { createPost } from "@/server/posts/posts"
import { sitePosts } from "@/server/posts/schema"
import { setFollowing } from "@/server/promotions/follows"
import { createPromotion } from "@/server/promotions/promotions"
import { listingFollows, sitePromotions } from "@/server/promotions/schema"
import { createTestDatabase, insertUser, insertWorkspace, type TestDatabase } from "@/server/test-support"

/**
 * The Duplicates row: which pairs of listings count as the same place, a pair
 * an admin said is not, and merging one listing into another. Two sites,
 * because a pair across sites must never be found and a merge must never
 * reach another site's listing.
 */

let client: PGlite
let database: TestDatabase
let site: string
let other: string

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database, { name: "Alpha" })).id
  other = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  await client.close()
})

async function place(
  title: string,
  address: string,
  options: { phone?: string; website?: string; on?: string; status?: "draft" | "published" } = {}
) {
  const on = options.on ?? site
  const listing = await createListing(on, { title }, database)
  const menuLinks = [
    ...(options.phone ? [{ id: "p", type: "phone" as const, label: "", value: options.phone }] : []),
    ...(options.website ? [{ id: "w", type: "website" as const, label: "", value: options.website }] : []),
  ]
  await updateListing(
    on,
    listing.id,
    { status: options.status ?? "published", contactLinks: { address, menuLinks, socialLinks: [] } },
    database
  )
  return (await findListing(on, listing.id, database))!
}

describe("which listings pair up", () => {
  it("pairs a close name at the same street address, and never a chain's other branches or a food hall's counters", async () => {
    const first = await place("The Luigi's Pizza & Pasta", "575 College St, Toronto, ON M6G 1B2")
    const second = await place("Luigis Pizza and Pasta", "575 college st., Toronto, Ontario")
    // A chain: the same name at another address.
    await place("Luigis Pizza and Pasta", "3803 Lake Shore Blvd W, Etobicoke, ON")
    // A food hall: one phone and one address, different names.
    await place("Konjiki Ramen", "41 Elm St, Toronto", { phone: "416 555 0100" })
    await place("Tendon Akimitsu", "41 Elm St, Toronto", { phone: "+1 (416) 555-0100" })
    // The same place on another site is that site's business.
    await place("Luigis Pizza and Pasta", "575 College St, Toronto", { on: other })

    const page = await listDuplicatePairs(site, {}, database)
    expect(page.total).toBe(1)
    expect(page.pairs[0]!.first.id).toBe(first.id)
    expect(page.pairs[0]!.second.id).toBe(second.id)
    expect(page.pairs[0]!.matched).toEqual(["address", "name"])
    expect(await duplicatePairCount(other, database)).toBe(0)
  })

  it("pairs a listing with no address on a close name and the same phone, and not on the name alone", async () => {
    await place("Joe's Diner", "12 Main St, Toronto", { phone: "416-555-0199" })
    const noAddress = await place("Joes Diner", "", { phone: "(416) 555 0199" })
    await place("Joes Diner", "")

    const page = await listDuplicatePairs(site, {}, database)
    expect(page.total).toBe(1)
    expect([page.pairs[0]!.first.id, page.pairs[0]!.second.id]).toContain(noAddress.id)
    expect(page.pairs[0]!.matched).toEqual(["phone", "name"])
  })

  it("stops showing a pair marked not a duplicate", async () => {
    const first = await place("Chef's Hall", "111 Richmond St W, Toronto")
    const second = await place("Ramen Isshin at Chefs Hall", "111 Richmond St W, Toronto")
    expect(await duplicatePairCount(site, database)).toBe(1)

    const admin = await insertUser(database)
    await markNotDuplicate(site, [second.id, first.id], admin.id, database)
    // Saying it twice is the same answer.
    await markNotDuplicate(site, [first.id, second.id], admin.id, database)
    expect(await duplicatePairCount(site, database)).toBe(0)
  })
})

describe("merging", () => {
  async function pair() {
    const kept = await place("Joe's Diner", "12 Main St, Toronto")
    const gone = await place("Joes Diner", "12 Main St, Toronto")
    return { kept, gone }
  }

  it("moves saves, follows, events, deals and post cards onto the kept listing, keeps each once, and forwards the old address", async () => {
    const { kept, gone } = await pair()
    const visitor = await insertUser(database)
    await createSaveCollection(site, visitor.id, { listingId: kept.id, name: "Brunch" }, database)
    const [both] = await database.select().from(directorySaveCollections).where(eq(directorySaveCollections.name, "Brunch"))
    await database.insert(directorySaveItems).values({
      id: uuid(),
      workspaceId: site,
      userId: visitor.id,
      collectionId: both!.id,
      listingId: gone.id,
      createdAt: now(),
    })
    await createSaveCollection(site, visitor.id, { listingId: gone.id, name: "Later" }, database)
    await setFollowing(site, visitor.id, { listingId: kept.id, following: true }, database)
    await setFollowing(site, visitor.id, { listingId: gone.id, following: true }, database)

    const event = await createEvent(site, { title: "Pancake night", when: { startDate: "2099-01-02", startTime: "18:00" } }, database)
    await database.update(siteEvents).set({ listingId: gone.id }).where(eq(siteEvents.id, event.id))
    const deal = await createPromotion(
      site,
      visitor.id,
      {
        title: "Two for one",
        listingId: gone.id,
        description: "",
        coverImage: "",
        startDate: "2099-01-01",
        endDate: "2099-01-31",
        code: "",
        smallPrint: "",
        dealType: "two_for_one",
        amount: "",
        headline: "2 for 1",
        status: "draft",
      },
      database
    )
    const post = await createPost(site, { title: "Where to eat" }, database)
    await database
      .update(sitePosts)
      .set({ body: { type: "doc", content: [{ type: "listingCard", attrs: { listingId: gone.id } }] } })
      .where(eq(sitePosts.id, post.id))

    const admin = await insertUser(database)
    await mergeListings(site, { keepId: kept.id, mergeId: gone.id }, admin.id, database)

    expect(await findListing(site, gone.id, database)).toBeNull()
    const saves = await database.select().from(directorySaveItems).where(eq(directorySaveItems.listingId, kept.id))
    // "Brunch" held both and keeps one; "Later" moved across.
    expect(saves).toHaveLength(2)
    const follows = await database.select().from(listingFollows).where(eq(listingFollows.listingId, kept.id))
    expect(follows).toHaveLength(1)
    const [movedEvent] = await database.select().from(siteEvents).where(eq(siteEvents.id, event.id))
    expect(movedEvent!.listingId).toBe(kept.id)
    const [movedDeal] = await database.select().from(sitePromotions).where(eq(sitePromotions.id, deal.id))
    expect(movedDeal!.listingId).toBe(kept.id)
    const [movedPost] = await database.select().from(sitePosts).where(eq(sitePosts.id, post.id))
    expect(JSON.stringify(movedPost!.body)).toContain(kept.id)
    expect(JSON.stringify(movedPost!.body)).not.toContain(gone.id)
    expect(await currentAddressFor(site, "listing", gone.slug, database)).toBe(kept.slug)
    expect(await duplicatePairCount(site, database)).toBe(0)
  })

  it("refuses two different owners, the same listing twice, another site's listing and a payment in progress", async () => {
    const { kept, gone } = await pair()
    const admin = await insertUser(database)
    await expect(mergeListings(site, { keepId: kept.id, mergeId: kept.id }, admin.id, database)).rejects.toThrow(MERGE_ERRORS.same)
    const elsewhere = await place("Joes Diner", "12 Main St, Toronto", { on: other })
    await expect(mergeListings(site, { keepId: kept.id, mergeId: elsewhere.id }, admin.id, database)).rejects.toThrow(
      MERGE_ERRORS.missing
    )
    expect(await findListing(other, elsewhere.id, database)).not.toBeNull()

    const one = await approvedClaim(kept.id)
    const two = await approvedClaim(gone.id)
    await expect(mergeListings(site, { keepId: kept.id, mergeId: gone.id }, admin.id, database)).rejects.toThrow(MERGE_ERRORS.owners)

    await database.delete(directoryClaims).where(eq(directoryClaims.id, two.claim.id))
    const plan = await saveFeaturedPlan(site, { name: "Month", priceCents: 5000, currency: "usd", durationDays: 30, priority: 1 }, database)
    const at = now()
    await database.insert(directoryFeaturedCheckouts).values({
      id: uuid(),
      workspaceId: site,
      listingId: gone.id,
      claimId: one.claim.id,
      buyerUserId: one.owner.id,
      planId: plan.id,
      priceCents: 5000,
      currency: "usd",
      productName: "Month",
      customerEmail: one.owner.email,
      successUrl: "https://example.test/ok",
      cancelUrl: "https://example.test/no",
      createdAt: at,
      updatedAt: at,
    })
    await expect(mergeListings(site, { keepId: kept.id, mergeId: gone.id }, admin.id, database)).rejects.toThrow(MERGE_ERRORS.paying)
    expect(await findListing(site, gone.id, database)).not.toBeNull()
  })

  it("keeps one owner's paid spots when they own both, and ends the shorter of two running spots", async () => {
    const { kept, gone } = await pair()
    const { owner, claim: keptClaim } = await approvedClaim(kept.id)
    const { claim: goneClaim } = await approvedClaim(gone.id, owner)
    const plan = await saveFeaturedPlan(site, { name: "Month", priceCents: 5000, currency: "usd", durationDays: 30, priority: 1 }, database)
    const day = 86_400_000
    const longer = await spot(gone.id, goneClaim.id, owner.id, plan.id, 20 * day)
    const shorter = await spot(kept.id, keptClaim.id, owner.id, plan.id, 5 * day)

    const admin = await insertUser(database)
    await mergeListings(site, { keepId: kept.id, mergeId: gone.id }, admin.id, database)

    const spots = await database.select().from(directoryFeaturedEntitlements)
    const stayed = spots.find((each) => each.id === longer)!
    const ended = spots.find((each) => each.id === shorter)!
    expect(stayed).toMatchObject({ listingId: kept.id, claimId: keptClaim.id, status: "active" })
    expect(ended).toMatchObject({ status: "revoked", revokeNote: mergedSpotNote(kept.title) })
  })

  it("never ends the kept listing's own spots when the merged listing had none", async () => {
    const { kept, gone } = await pair()
    const { owner, claim } = await approvedClaim(kept.id)
    const plan = await saveFeaturedPlan(site, { name: "Month", priceCents: 5000, currency: "usd", durationDays: 30, priority: 1 }, database)
    const day = 86_400_000
    // One running now and one bought to start when it ends: both the kept listing's own.
    const now30 = await spot(kept.id, claim.id, owner.id, plan.id, 10 * day)
    const next30 = await spot(kept.id, claim.id, owner.id, plan.id, 40 * day)

    const admin = await insertUser(database)
    await mergeListings(site, { keepId: kept.id, mergeId: gone.id }, admin.id, database)

    const spots = await database.select().from(directoryFeaturedEntitlements)
    const own: string[] = [now30, next30]
    expect(spots.filter((each) => own.includes(each.id)).map((each) => each.status)).toEqual(["active", "active"])
  })

  async function approvedClaim(listingId: string, owner?: Awaited<ReturnType<typeof insertUser>>) {
    const person = owner ?? (await insertUser(database))
    const at = now()
    const [claim] = await database
      .insert(directoryClaims)
      .values({
        id: uuid(),
        workspaceId: site,
        listingId,
        userId: person.id,
        contactEmail: person.email,
        claimantName: person.name,
        status: "approved",
        reviewedAt: at,
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    return { owner: person, claim: claim! }
  }

  async function spot(listingId: string, claimId: string, buyerUserId: string, planId: string, left: number) {
    const id = uuid()
    const at = now()
    await database.insert(directoryFeaturedEntitlements).values({
      id,
      workspaceId: site,
      listingId,
      claimId,
      buyerUserId,
      planId,
      stripeSessionId: `cs_${id}`,
      amountTotal: 5000,
      currency: "usd",
      status: "active",
      startsAt: new Date(at.getTime() - 86_400_000),
      endsAt: new Date(at.getTime() + left),
      createdAt: at,
      updatedAt: at,
    })
    return id
  }
})
