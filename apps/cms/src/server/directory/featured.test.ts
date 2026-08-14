import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import type Stripe from "stripe"

import { now, uuid } from "@/server/auth/security"
import {
  createListing,
  deleteListings,
  updateListing,
} from "@/server/directory/listings"
import {
  activateFeaturedSession,
  activeFeaturedForListings,
  createFeaturedCheckout,
  deleteFeaturedPlan,
  featuredImpactForListings,
  pendingFeaturedImpactForListings,
  prepareFeaturedListingsForDeletion,
  saveFeaturedPlan,
} from "@/server/directory/featured"
import { readPublicBrowse } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  DIRECTORY_SETTING_DEFAULTS,
  saveDirectoryBrowseSettings,
} from "@/server/directory/settings"
import {
  directoryClaims,
  directoryFeaturedCheckouts,
  directoryFeaturedEntitlements,
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
