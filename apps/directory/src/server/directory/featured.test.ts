import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import type Stripe from "stripe"

import { now, uuid } from "@/server/auth/security"
import { createCategory } from "@/server/directory/categories"
import {
  createListing,
  deleteListings,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import {
  activateFeaturedSession,
  activeFeaturedForListings,
  categorySpotsTaken,
  featuredPurchaseState,
  createFeaturedCheckout,
  deleteFeaturedPlan,
  featuredImpactForListings,
  pendingFeaturedImpactForListings,
  prepareFeaturedListingsForDeletion,
  saveFeaturedPlan,
} from "@/server/directory/featured"
import { listingsOwnedBy } from "@/server/directory/claims"
import { readPublicBrowse, readPublicCategory } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  DIRECTORY_SETTING_DEFAULTS,
  saveDirectoryBrowseSettings,
} from "@/server/directory/settings"
import {
  directoryClaims,
  directoryFeaturedCheckouts,
  directoryFeaturedEntitlements,
  directoryFeaturedPlans,
} from "@/server/directory/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function ownedListing() {
  const site = await insertWorkspace(database)
  const user = await insertUser(database)
  const draft = await createListing(site.id, { title: "Cafe" }, database)
  const listing = await updateListing(
    site.id,
    draft.id,
    { status: "published" },
    database
  )
  const timestamp = now()
  const [claim] = await database
    .insert(directoryClaims)
    .values({
      id: uuid(),
      workspaceId: site.id,
      listingId: listing.id,
      userId: user.id,
      contactEmail: user.email,
      claimantName: user.name,
      status: "approved",
      reviewedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  const plan = await saveFeaturedPlan(
    site.id,
    {
      name: "One week",
      priceCents: 2500,
      currency: "usd",
      durationDays: 7,
      priority: 10,
    },
    database
  )
  return { site, user, listing, claim, plan }
}

function checkoutStripe() {
  const sessions = new Map<string, Promise<Stripe.Checkout.Session>>()
  const idempotencyKeys: string[] = []
  let sequence = 0

  return {
    idempotencyKeys,
    sessions,
    client: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        idempotencyKey: string
      ) {
        idempotencyKeys.push(idempotencyKey)
        const existing = sessions.get(idempotencyKey)
        if (existing) return existing

        sequence += 1
        const session = new Promise<Stripe.Checkout.Session>((resolve) => {
          setTimeout(
            () =>
              resolve({
                id: `cs_test_reserved_${sequence}`,
                url: `https://checkout.stripe.test/reserved-${sequence}`,
                status: "open",
                payment_status: "unpaid",
                payment_intent: null,
                amount_total:
                  params.line_items?.[0]?.price_data?.unit_amount ?? null,
                currency: params.line_items?.[0]?.price_data?.currency ?? null,
                metadata: params.metadata ?? {},
              } as Stripe.Checkout.Session),
            5
          )
        })
        sessions.set(idempotencyKey, session)
        return session
      },
      async retrieve(id: string) {
        const saved = await Promise.all(sessions.values())
        const session = saved.find((item) => item.id === id)
        if (!session) throw new Error("missing test session")
        return session
      },
    },
  }
}

describe("featured placement", () => {
  it("loads owner card status and end dates consistently with the purchase popover", async () => {
    const { site, user, listing, claim, plan } = await ownedListing()
    const timestamp = now()
    const endsAt = new Date(timestamp.getTime() + 86_400_000)
    const id = uuid()
    expect((await listingsOwnedBy(user.id, database))[0].featured).toEqual({ active: false, endsAt: null })
    await database.insert(directoryFeaturedEntitlements).values({
      id, workspaceId: site.id, listingId: listing.id, claimId: claim.id,
      buyerUserId: user.id, planId: plan.id, stripeSessionId: "cs_owner_card",
      amountTotal: 2500, currency: "usd", status: "active",
      startsAt: new Date(timestamp.getTime() - 1000), endsAt,
      createdAt: timestamp, updatedAt: timestamp,
    })
    const [card] = await listingsOwnedBy(user.id, database)
    expect(card.featured.active).toBe(true)
    expect(new Date(card.featured.endsAt!).getTime()).toBe(endsAt.getTime())
    expect((await featuredPurchaseState(user.id, listing.id, database)).active).toBe(true)
    const stranger = await insertUser(database)
    expect(await listingsOwnedBy(stranger.id, database)).toEqual([])
    for (const changes of [
      { startsAt: new Date(endsAt.getTime() - 1000) },
      { startsAt: timestamp, status: "revoked" as const },
      { status: "active" as const, startsAt: new Date(timestamp.getTime() - 2000), endsAt: new Date(timestamp.getTime() - 1000) },
    ]) {
      await database.update(directoryFeaturedEntitlements).set(changes).where(eq(directoryFeaturedEntitlements.id, id))
      expect((await listingsOwnedBy(user.id, database))[0].featured).toEqual({ active: false, endsAt: null })
      expect((await featuredPurchaseState(user.id, listing.id, database)).active).toBe(false)
    }
  })

  it("reuses one Stripe session when checkout starts overlap", async () => {
    const { user, listing, plan } = await ownedListing()
    const fakeStripe = checkoutStripe()

    const results = await Promise.all([
      createFeaturedCheckout(
        user,
        { listingId: listing.id, planId: plan.id },
        database,
        fakeStripe.client
      ),
      createFeaturedCheckout(
        user,
        { listingId: listing.id, planId: plan.id },
        database,
        fakeStripe.client
      ),
    ])

    expect(results[0].url).toBe(results[1].url)
    expect(new Set(fakeStripe.idempotencyKeys).size).toBe(1)
    expect(
      await database.select().from(directoryFeaturedCheckouts)
    ).toHaveLength(1)
  })

  it("keeps a checkout plan until the paid session can be confirmed", async () => {
    const { site, user, listing, plan } = await ownedListing()
    const fakeStripe = checkoutStripe()
    await createFeaturedCheckout(
      user,
      { listingId: listing.id, planId: plan.id },
      database,
      fakeStripe.client
    )

    await expect(
      deleteFeaturedPlan(site.id, plan.id, database)
    ).rejects.toThrow("Archive this plan")

    const [openSession] = await Promise.all(fakeStripe.sessions.values())
    await activateFeaturedSession(
      user.id,
      {
        ...openSession,
        payment_status: "paid",
        payment_intent: "pi_reserved",
      },
      database
    )
    expect(
      await database.select().from(directoryFeaturedCheckouts)
    ).toHaveLength(0)
  })

  it("recovers the reserved session after its plan is archived", async () => {
    const { site, user, listing, plan } = await ownedListing()
    const fakeStripe = checkoutStripe()
    const first = await createFeaturedCheckout(
      user,
      { listingId: listing.id, planId: plan.id },
      database,
      fakeStripe.client
    )
    await saveFeaturedPlan(
      site.id,
      {
        ...plan,
        active: false,
      },
      database
    )

    const recovered = await createFeaturedCheckout(
      user,
      { listingId: listing.id, planId: plan.id },
      database,
      fakeStripe.client
    )
    expect(recovered.url).toBe(first.url)
  })

  it("replaces an expired reserved session without reusing its charge", async () => {
    const { user, listing, plan } = await ownedListing()
    const fakeStripe = checkoutStripe()
    const first = await createFeaturedCheckout(
      user,
      { listingId: listing.id, planId: plan.id },
      database,
      fakeStripe.client
    )
    const [expired] = await Promise.all(fakeStripe.sessions.values())
    expired.status = "expired"
    expired.url = null

    const replacement = await createFeaturedCheckout(
      user,
      { listingId: listing.id, planId: plan.id },
      database,
      fakeStripe.client
    )
    expect(replacement.url).not.toBe(first.url)
    const checkouts = await database.select().from(directoryFeaturedCheckouts)
    expect(checkouts).toHaveLength(1)
    expect(checkouts[0].stripeSessionId).toContain("cs_test_reserved_2")
  })

  it("protects a listing while its featured checkout is open", async () => {
    const { site, user, listing, plan } = await ownedListing()
    const fakeStripe = checkoutStripe()
    await createFeaturedCheckout(
      user,
      { listingId: listing.id, planId: plan.id },
      database,
      fakeStripe.client
    )

    expect(
      await pendingFeaturedImpactForListings(site.id, [listing.id], database)
    ).toEqual({ pendingFeatured: 1 })
    await expect(
      prepareFeaturedListingsForDeletion(
        site.id,
        [listing.id],
        database,
        fakeStripe.client
      )
    ).rejects.toThrow("still open")
    await expect(
      deleteListings(site.id, [listing.id], database)
    ).rejects.toThrow()
  })

  it("removes an expired checkout before deleting its listing", async () => {
    const { site, user, listing, plan } = await ownedListing()
    const fakeStripe = checkoutStripe()
    await createFeaturedCheckout(
      user,
      { listingId: listing.id, planId: plan.id },
      database,
      fakeStripe.client
    )
    const [session] = await Promise.all(fakeStripe.sessions.values())
    session.status = "expired"
    session.url = null

    await prepareFeaturedListingsForDeletion(
      site.id,
      [listing.id],
      database,
      fakeStripe.client
    )
    expect(
      await database.select().from(directoryFeaturedCheckouts)
    ).toHaveLength(0)
    await expect(
      deleteListings(site.id, [listing.id], database)
    ).resolves.toEqual({
      done: [listing.id],
      kept: [],
    })
  })

  it("confirms a paid checkout before allowing its listing to be reconsidered", async () => {
    const { site, user, listing, plan } = await ownedListing()
    const fakeStripe = checkoutStripe()
    await createFeaturedCheckout(
      user,
      { listingId: listing.id, planId: plan.id },
      database,
      fakeStripe.client
    )
    const [session] = await Promise.all(fakeStripe.sessions.values())
    session.payment_status = "paid"
    session.payment_intent = "pi_delete_guard"

    await expect(
      prepareFeaturedListingsForDeletion(
        site.id,
        [listing.id],
        database,
        fakeStripe.client
      )
    ).rejects.toThrow("payment completed")
    expect(
      await database.select().from(directoryFeaturedCheckouts)
    ).toHaveLength(0)
    expect(
      await database.select().from(directoryFeaturedEntitlements)
    ).toHaveLength(1)
    expect(
      await featuredImpactForListings(site.id, [listing.id], database)
    ).toEqual({
      activeFeatured: 1,
    })
  })

  it("confirms the same paid session once and keeps the server-side plan price", async () => {
    const { site, user, listing, claim, plan } = await ownedListing()
    const session = {
      id: "cs_test_paidonce",
      metadata: {
        kind: "cms_directory_featured",
        workspaceId: site.id,
        listingId: listing.id,
        claimId: claim.id,
        planId: plan.id,
        userId: user.id,
      },
      payment_status: "paid" as const,
      payment_intent: "pi_paidonce",
      amount_total: 2500,
      currency: "usd",
    }

    const first = await activateFeaturedSession(user.id, session, database)
    const second = await activateFeaturedSession(user.id, session, database)
    expect(second.id).toBe(first.id)
    expect(
      await database.select().from(directoryFeaturedEntitlements)
    ).toHaveLength(1)
  })

  it("refuses a paid session whose amount does not match the saved plan", async () => {
    const { site, user, listing, claim, plan } = await ownedListing()
    await expect(
      activateFeaturedSession(
        user.id,
        {
          id: "cs_test_tampered",
          metadata: {
            kind: "cms_directory_featured",
            workspaceId: site.id,
            listingId: listing.id,
            claimId: claim.id,
            planId: plan.id,
            userId: user.id,
          },
          payment_status: "paid",
          payment_intent: "pi_tampered",
          amount_total: 1,
          currency: "usd",
        },
        database
      )
    ).rejects.toThrow("does not match")
  })

  it("honours the paid terms if an admin edits the plan before the buyer returns", async () => {
    const { site, user, listing, claim, plan } = await ownedListing()
    await saveFeaturedPlan(
      site.id,
      {
        id: plan.id,
        name: plan.name,
        priceCents: 5000,
        currency: "usd",
        durationDays: 30,
      },
      database
    )

    const startedAt = now()
    const entitlement = await activateFeaturedSession(
      user.id,
      {
        id: "cs_test_original_terms",
        metadata: {
          kind: "cms_directory_featured",
          workspaceId: site.id,
          listingId: listing.id,
          claimId: claim.id,
          planId: plan.id,
          userId: user.id,
          priceCents: "2500",
          currency: "usd",
          durationDays: "7",
        },
        payment_status: "paid",
        payment_intent: "pi_original_terms",
        amount_total: 2500,
        currency: "usd",
      },
      database
    )

    const [saved] = await database
      .select()
      .from(directoryFeaturedEntitlements)
      .where(eq(directoryFeaturedEntitlements.id, entitlement.id))
    expect(saved.amountTotal).toBe(2500)
    expect(saved.endsAt.getTime() - startedAt.getTime()).toBeGreaterThanOrEqual(
      7 * 86_400_000
    )
    expect(saved.endsAt.getTime() - startedAt.getTime()).toBeLessThan(
      7 * 86_400_000 + 5_000
    )
  })

  it("stops expired and revoked purchases from counting without a cleanup job", async () => {
    const { site, user, listing, claim, plan } = await ownedListing()
    const timestamp = now()
    await database.insert(directoryFeaturedEntitlements).values([
      {
        id: uuid(),
        workspaceId: site.id,
        listingId: listing.id,
        claimId: claim.id,
        buyerUserId: user.id,
        planId: plan.id,
        stripeSessionId: "cs_test_expired",
        amountTotal: 2500,
        currency: "usd",
        status: "active",
        startsAt: new Date(timestamp.getTime() - 8 * 86_400_000),
        endsAt: new Date(timestamp.getTime() - 86_400_000),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: uuid(),
        workspaceId: site.id,
        listingId: listing.id,
        claimId: claim.id,
        buyerUserId: user.id,
        planId: plan.id,
        stripeSessionId: "cs_test_revoked",
        amountTotal: 2500,
        currency: "usd",
        status: "revoked",
        startsAt: timestamp,
        endsAt: new Date(timestamp.getTime() + 7 * 86_400_000),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ])

    expect(
      await activeFeaturedForListings(site.id, [listing.id], database)
    ).toEqual(new Set())
    expect(
      await featuredImpactForListings(site.id, [listing.id], database)
    ).toEqual({
      activeFeatured: 0,
    })
  })

  it("sorts an active featured listing first and drops the priority at expiry", async () => {
    const { site, user, listing, claim, plan } = await ownedListing()
    const ordinary = await createListing(
      site.id,
      { title: "New ordinary" },
      database
    )
    await updateListing(site.id, ordinary.id, { status: "published" }, database)
    const publicSite = {
      id: site.id,
      name: site.name,
      url: "https://site.test",
    }
    const browse = () =>
      readPublicBrowse(publicSite, { sort: "newest", page: 1 }, database)

    expect(
      (await browse()).listings.map((row) => [row.title, row.featured])
    ).toEqual([
      ["New ordinary", false],
      ["Cafe", false],
    ])

    const entitlement = await activateFeaturedSession(
      user.id,
      {
        id: "cs_test_sort",
        metadata: {
          kind: "cms_directory_featured",
          workspaceId: site.id,
          listingId: listing.id,
          claimId: claim.id,
          planId: plan.id,
          userId: user.id,
        },
        payment_status: "paid",
        payment_intent: "pi_sort",
        amount_total: 2500,
        currency: "usd",
      },
      database
    )

    expect(
      (await browse()).listings.map((row) => [row.title, row.featured])
    ).toEqual([
      ["Cafe", true],
      ["New ordinary", false],
    ])

    await saveDirectoryBrowseSettings(
      site.id,
      {
        ...DIRECTORY_SETTING_DEFAULTS,
        defaultSort: "newest",
        featuredFirst: false,
      },
      database
    )
    expect(
      (await browse()).listings.map((row) => [row.title, row.featured])
    ).toEqual([
      ["New ordinary", false],
      ["Cafe", true],
    ])

    await database
      .update(directoryFeaturedEntitlements)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(eq(directoryFeaturedEntitlements.id, entitlement.id))
    // This test edits the database directly to simulate time passing. A real
    // cached page may keep that placement for its remaining short lifetime.
    resetPublicDirectoryCacheForTests()
    expect(
      (await browse()).listings.map((row) => [row.title, row.featured])
    ).toEqual([
      ["New ordinary", false],
      ["Cafe", false],
    ])
  })
})

/**
 * A featured spot in one category. The whole-directory plans above are
 * untouched by any of this, which is the first thing these tests check.
 */
describe("a featured spot in one category", () => {
  /** A published listing on this site with an approved claim and its owner. */
  async function ownerOn(site: { id: string }, title: string) {
    const user = await insertUser(database)
    const draft = await createListing(site.id, { title }, database)
    const listing = await updateListing(
      site.id,
      draft.id,
      { status: "published" },
      database
    )
    const timestamp = now()
    const [claim] = await database
      .insert(directoryClaims)
      .values({
        id: uuid(),
        workspaceId: site.id,
        listingId: listing.id,
        userId: user.id,
        contactEmail: user.email,
        claimantName: user.name,
        status: "approved",
        reviewedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
    return { user, listing, claim }
  }

  function categoryPlan(
    site: { id: string },
    input: { name: string; categoryId: string; spots: number }
  ) {
    return saveFeaturedPlan(
      site.id,
      {
        name: input.name,
        priceCents: 2900,
        currency: "usd",
        durationDays: 30,
        priority: 5,
        categoryId: input.categoryId,
        categorySpots: input.spots,
      },
      database
    )
  }

  /** Pays for a plan the whole way through, as the owner's button does. */
  async function buy(
    user: { id: string; email: string },
    listingId: string,
    planId: string
  ) {
    const fakeStripe = checkoutStripe()
    await createFeaturedCheckout(
      user,
      { listingId, planId },
      database,
      fakeStripe.client
    )
    const [session] = await Promise.all(fakeStripe.sessions.values())
    return activateFeaturedSession(
      user.id,
      { ...session, payment_status: "paid", payment_intent: `pi_${planId}` },
      database
    )
  }

  it("leaves a plan with no category selling the whole directory", async () => {
    const { user, listing, plan } = await ownedListing()
    expect(plan.categoryId).toBeNull()
    expect(plan.categoryName).toBeNull()
    expect(plan.categorySpots).toBeNull()

    const offered = await featuredPurchaseState(user.id, listing.id, database)
    expect(offered.plans.map((row) => [row.name, row.spotsLeft])).toEqual([
      ["One week", null],
    ])
  })

  it("offers a category plan only to a listing in that category", async () => {
    const { site } = await ownedListing()
    const bakeries = await createCategory(site.id, { name: "Bakeries" }, database)
    const cafes = await createCategory(site.id, { name: "Cafes" }, database)
    const bakery = await ownerOn(site, "Rye and Co")
    await setListingCategories(
      site.id,
      bakery.listing.id,
      [bakeries.id],
      bakeries.id,
      database
    )
    const onBakeries = await categoryPlan(site, {
      name: "Top of Bakeries",
      categoryId: bakeries.id,
      spots: 3,
    })
    const onCafes = await categoryPlan(site, {
      name: "Top of Cafes",
      categoryId: cafes.id,
      spots: 3,
    })

    const offered = await featuredPurchaseState(
      bakery.user.id,
      bakery.listing.id,
      database
    )
    // The whole-directory plan from `ownedListing` and the Bakeries one. The
    // Cafes plan is not an offer this listing could ever take, so it is not
    // on the list at all.
    expect(offered.plans.map((row) => [row.name, row.spotsLeft])).toEqual([
      ["One week", null],
      ["Top of Bakeries", 3],
    ])
    expect(offered.plans.map((row) => row.categoryName)).toEqual([
      null,
      "Bakeries",
    ])

    await expect(
      buy(bakery.user, bakery.listing.id, onCafes.id)
    ).rejects.toThrow("not in Cafes")
    await expect(
      buy(bakery.user, bakery.listing.id, onBakeries.id)
    ).resolves.toMatchObject({ kind: "listing" })
  })

  it("gives the last spot to one buyer and refuses the other", async () => {
    const { site } = await ownedListing()
    const bakeries = await createCategory(site.id, { name: "Bakeries" }, database)
    const plan = await categoryPlan(site, {
      name: "Top of Bakeries",
      categoryId: bakeries.id,
      spots: 1,
    })
    const first = await ownerOn(site, "Rye and Co")
    const second = await ownerOn(site, "Crumb")
    for (const owner of [first, second]) {
      await setListingCategories(
        site.id,
        owner.listing.id,
        [bakeries.id],
        bakeries.id,
        database
      )
    }

    const races = await Promise.allSettled([
      buy(first.user, first.listing.id, plan.id),
      buy(second.user, second.listing.id, plan.id),
    ])
    expect(races.filter((race) => race.status === "fulfilled")).toHaveLength(1)
    const refused = races.find((race) => race.status === "rejected")
    expect(String((refused as PromiseRejectedResult).reason)).toContain(
      "Every featured spot on Bakeries is taken"
    )

    expect((await categorySpotsTaken(site.id, [bakeries.id], database)).get(bakeries.id)).toBe(1)
    const stillOffered = await featuredPurchaseState(
      second.user.id,
      second.listing.id,
      database
    )
    // Sold out, not hidden: the owner can see the spot exists and come back.
    expect(
      stillOffered.plans.map((row) => [row.name, row.spotsLeft])
    ).toContainEqual(["Top of Bakeries", 0])
  })

  it("leads the category's own page and sorts normally everywhere else", async () => {
    const { site } = await ownedListing()
    const bakeries = await createCategory(
      site.id,
      { name: "Bakeries", slug: "bakeries" },
      database
    )
    const plan = await categoryPlan(site, {
      name: "Top of Bakeries",
      categoryId: bakeries.id,
      spots: 3,
    })
    const older = await ownerOn(site, "Aaa Bakery")
    const newer = await ownerOn(site, "Zzz Bakery")
    for (const owner of [older, newer]) {
      await setListingCategories(
        site.id,
        owner.listing.id,
        [bakeries.id],
        bakeries.id,
        database
      )
    }
    const publicSite = { id: site.id, name: site.name, url: "https://site.test" }
    const onCategory = () =>
      readPublicCategory(publicSite, "bakeries", { page: 1 }, database)
    const onBrowse = () =>
      readPublicBrowse(publicSite, { sort: "title", page: 1 }, database)

    // The site's own order, newest first inside one display order.
    expect((await onCategory())?.listings.map((row) => row.title)).toEqual([
      "Zzz Bakery",
      "Aaa Bakery",
    ])

    const entitlement = await buy(older.user, older.listing.id, plan.id)
    resetPublicDirectoryCacheForTests()

    expect(
      (await onCategory())?.listings.map((row) => [row.title, row.featured])
    ).toEqual([
      ["Aaa Bakery", true],
      ["Zzz Bakery", false],
    ])
    // The browse page is somebody else's page as far as this spot is
    // concerned: alphabetical order, and no badge to claim otherwise.
    expect(
      (await onBrowse()).listings.map((row) => [row.title, row.featured])
    ).toEqual([
      ["Aaa Bakery", false],
      ["Cafe", false],
      ["Zzz Bakery", false],
    ])

    await database
      .update(directoryFeaturedEntitlements)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(eq(directoryFeaturedEntitlements.id, entitlement.id))
    resetPublicDirectoryCacheForTests()
    expect(
      (await onCategory())?.listings.map((row) => [row.title, row.featured])
    ).toEqual([
      ["Zzz Bakery", false],
      ["Aaa Bakery", false],
    ])
    expect(
      (await categorySpotsTaken(site.id, [bakeries.id], database)).get(bakeries.id)
    ).toBeUndefined()
  })

  it("stops an unfinished checkout holding a spot once Stripe could no longer take it", async () => {
    const { site } = await ownedListing()
    const bakeries = await createCategory(site.id, { name: "Bakeries" }, database)
    const plan = await categoryPlan(site, {
      name: "Top of Bakeries",
      categoryId: bakeries.id,
      spots: 1,
    })
    const first = await ownerOn(site, "Rye and Co")
    const second = await ownerOn(site, "Crumb")
    for (const owner of [first, second]) {
      await setListingCategories(
        site.id,
        owner.listing.id,
        [bakeries.id],
        bakeries.id,
        database
      )
    }

    const fakeStripe = checkoutStripe()
    await createFeaturedCheckout(
      first.user,
      { listingId: first.listing.id, planId: plan.id },
      database,
      fakeStripe.client
    )
    // Still on Stripe's page, so the spot is held and nobody else gets it.
    expect(
      (await categorySpotsTaken(site.id, [bakeries.id], database)).get(bakeries.id)
    ).toBe(1)
    await expect(
      createFeaturedCheckout(
        second.user,
        { listingId: second.listing.id, planId: plan.id },
        database,
        fakeStripe.client
      )
    ).rejects.toThrow("Every featured spot on Bakeries is taken")

    // A day later that session has expired at Stripe, so it can never become
    // a payment and must stop blocking the next buyer.
    await database
      .update(directoryFeaturedCheckouts)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(directoryFeaturedCheckouts.listingId, first.listing.id))
    expect(
      (await categorySpotsTaken(site.id, [bakeries.id], database)).get(bakeries.id)
    ).toBeUndefined()
    await expect(
      createFeaturedCheckout(
        second.user,
        { listingId: second.listing.id, planId: plan.id },
        database,
        fakeStripe.client
      )
    ).resolves.toHaveProperty("url")
  })

  it("holds the shape in the database, not only in the server code", async () => {
    const { site } = await ownedListing()
    const bakeries = await createCategory(site.id, { name: "Bakeries" }, database)
    const base = {
      workspaceId: site.id,
      name: "Hand written",
      priceCents: 2900,
      currency: "usd",
      durationDays: 30,
      createdAt: now(),
      updatedAt: now(),
    }
    // A row written straight into the database, going round every check in
    // `saveFeaturedPlan`. The migration's own checks are the last guarantee
    // that a plan is either whole-directory or one category with a limit.
    for (const broken of [
      { categoryId: bakeries.id, categorySpots: null },
      { categoryId: null, categorySpots: 3 },
      { categoryId: bakeries.id, categorySpots: 0 },
      { categoryId: bakeries.id, categorySpots: 101 },
      { kind: "event", durationDays: null, categoryId: bakeries.id, categorySpots: 3 },
    ]) {
      await expect(
        database
          .insert(directoryFeaturedPlans)
          .values({ id: uuid(), ...base, ...broken })
      ).rejects.toThrow()
    }
    await expect(
      database
        .insert(directoryFeaturedPlans)
        .values({ id: uuid(), ...base, categoryId: bakeries.id, categorySpots: 3 })
    ).resolves.toBeDefined()
  })

  it("gives the buyer the category their session named, not the plan's today", async () => {
    const { site, user, listing, claim, plan } = await ownedListing()
    const bakeries = await createCategory(site.id, { name: "Bakeries" }, database)

    // The session was made while the plan sold the whole directory, and it
    // carries no category. The admin then narrows the plan to one category
    // before the buyer gets back from Stripe. What was paid for must not
    // shrink, so the session's own metadata is the only thing that decides.
    await saveFeaturedPlan(
      site.id,
      { ...plan, categoryId: bakeries.id, categorySpots: 3 },
      database
    )
    const paid = await activateFeaturedSession(
      user.id,
      {
        id: "cs_test_whole_directory",
        metadata: {
          kind: "cms_directory_featured",
          workspaceId: site.id,
          listingId: listing.id,
          claimId: claim.id,
          planId: plan.id,
          userId: user.id,
          priceCents: "2500",
          currency: "usd",
          durationDays: "7",
        },
        payment_status: "paid",
        payment_intent: "pi_whole_directory",
        amount_total: 2500,
        currency: "usd",
      },
      database
    )

    const [saved] = await database
      .select({ categoryId: directoryFeaturedEntitlements.categoryId })
      .from(directoryFeaturedEntitlements)
      .where(eq(directoryFeaturedEntitlements.id, paid.id))
    expect(saved.categoryId).toBeNull()
    // Still featured everywhere, which is what the money bought.
    expect(
      await activeFeaturedForListings(site.id, [listing.id], database, {
        categoryId: null,
      })
    ).toEqual(new Set([listing.id]))
  })

  it("refuses a category from another site and a category with no spots", async () => {
    const { site } = await ownedListing()
    const other = await insertWorkspace(database)
    const theirs = await createCategory(other.id, { name: "Bakeries" }, database)
    const mine = await createCategory(site.id, { name: "Cafes" }, database)

    await expect(
      categoryPlan(site, { name: "Theirs", categoryId: theirs.id, spots: 3 })
    ).rejects.toThrow("not on this site")
    await expect(
      saveFeaturedPlan(
        site.id,
        {
          name: "No spots",
          priceCents: 2900,
          currency: "usd",
          durationDays: 30,
          categoryId: mine.id,
          categorySpots: null,
        },
        database
      )
    ).rejects.toThrow("between 1 and 100")
  })
})
