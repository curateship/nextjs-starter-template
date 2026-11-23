import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import type Stripe from "stripe"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { eventEndMoment } from "@/lib/events/calendar-file"
import { uuid } from "@/server/auth/security"
import {
  activateFeaturedSession,
  createEventFeaturedCheckout,
  eventFeaturedPurchaseState,
  featuredAdminOverview,
  prepareFeaturedEventsForDeletion,
  saveFeaturedPlan,
} from "@/server/directory/featured"
import { createListing, updateListing } from "@/server/directory/listings"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  directoryClaims,
  directoryFeaturedCheckouts,
  directoryFeaturedEntitlements,
} from "@/server/directory/schema"
import { createEvent, deleteEvents, updateEvent } from "@/server/events/events"
import { ownerEventsFor, sendOwnerEvent } from "@/server/events/owner-submissions"
import { readEventsBetween, readUpcomingEvents } from "@/server/events/public"
import { saveEventAndDates } from "@/server/events/repeats"
import { siteEvents } from "@/server/events/schema"
import { reviewEventSubmission } from "@/server/events/submissions"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Featured events: free from Admin → Events, paid by a listing's owner for
 * an event they sent in, and on top of the Events page until the event ends.
 * The dates are in 2030 so the real clock, which the paid spots are read
 * against, never makes them the past.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function dated(
  title: string,
  startDate: string,
  extra: { featured?: boolean; visibility?: "public" | "private" } = {}
) {
  const created = await createEvent(
    site.id,
    { title, when: { startDate, startTime: "18:00" } },
    database
  )
  return updateEvent(
    site.id,
    created.id,
    { status: "published", ...extra },
    database
  )
}

async function upcoming(now: string, featured = true) {
  resetPublicDirectoryCacheForTests()
  return (await readUpcomingEvents(site, 1, now, database, { featured })).events
}

describe("the admin's switch", () => {
  // Tuesday 1 January 2030, noon on the site's clock.
  const now = "2030-01-01T12:00"

  it("puts featured events on top, soonest first among themselves", async () => {
    await dated("Monday quiz", "2030-01-07")
    await dated("Festival", "2030-01-20", { featured: true })
    await dated("Street fair", "2030-01-15", { featured: true })
    await dated("Saturday market", "2030-01-05")

    const events = await upcoming(now)
    expect(events.map((row) => [row.title, row.featured])).toEqual([
      ["Street fair", true],
      ["Festival", true],
      ["Saturday market", false],
      ["Monday quiz", false],
    ])
  })

  it("leaves every other page soonest first and unmarked", async () => {
    await dated("Monday quiz", "2030-01-07")
    await dated("Festival", "2030-01-20", { featured: true })

    const events = await upcoming(now, false)
    expect(events.map((row) => row.title)).toEqual(["Monday quiz", "Festival"])
    expect(events.every((row) => !("featured" in row))).toBe(true)
  })

  it("marks a featured event in the month", async () => {
    const festival = await dated("Festival", "2030-01-20", { featured: true })
    await dated("Monday quiz", "2030-01-07")
    const month = await readEventsBetween(
      site,
      "2029-12-30",
      "2030-02-09",
      database
    )
    expect(
      month.map((row) => [row.id === festival.id, row.featured])
    ).toEqual([
      [false, false],
      [true, true],
    ])
  })

  it("puts only the next date of a featured repeating event on top", async () => {
    const made = await createEvent(
      site.id,
      { title: "Trivia", when: { startDate: "2030-01-03", startTime: "19:00" } },
      database
    )
    // 4 is Thursday.
    await saveEventAndDates(
      site.id,
      made.id,
      {
        status: "published",
        featured: true,
        repeat: { freq: "weekly", weekdays: [4], until: null },
      },
      database,
      new Date("2030-01-01T17:00:00Z")
    )
    await dated("Book club", "2030-01-02")

    const events = await upcoming(now)
    expect(events.slice(0, 3).map((row) => [row.title, row.startDate])).toEqual([
      ["Trivia", "2030-01-03"],
      ["Book club", "2030-01-02"],
      ["Trivia", "2030-01-10"],
    ])
    // Every date carries the mark, but only the next one is on top.
    expect(
      events.filter((row) => row.title === "Trivia").every((row) => row.featured)
    ).toBe(true)

    // Once the first Thursday is over, the next one takes its place.
    const later = await upcoming("2030-01-04T10:00")
    expect(later[0]).toMatchObject({ title: "Trivia", startDate: "2030-01-10" })
    expect(later[1]).toMatchObject({ title: "Trivia", startDate: "2030-01-17" })
  })

  it("keeps the switch on the main event of a repeat", async () => {
    const made = await createEvent(
      site.id,
      { title: "Trivia", when: { startDate: "2030-01-03", startTime: "19:00" } },
      database
    )
    await saveEventAndDates(
      site.id,
      made.id,
      { repeat: { freq: "weekly", weekdays: [4], until: null } },
      database,
      new Date("2030-01-01T17:00:00Z")
    )
    const [date] = await database
      .select({ id: siteEvents.id })
      .from(siteEvents)
      .where(eq(siteEvents.seriesId, made.id))
      .limit(1)
    await expect(
      saveEventAndDates(site.id, date!.id, { featured: true }, database)
    ).rejects.toThrow("Feature it from the main event.")
  })
})

describe("an owner paying", () => {
  let ownerId: string
  let ownerEmail: string
  let otherId: string
  let listingId: string
  let claimId: string
  let eventId: string
  let planId: string

  beforeEach(async () => {
    const owner = await insertUser(database, { email: "cafe@example.com" })
    ownerId = owner.id
    ownerEmail = owner.email
    otherId = (await insertUser(database, { email: "shop@example.com" })).id
    const adminId = (await insertUser(database, { email: "admin@example.com" }))
      .id
    const cafe = await createListing(site.id, { title: "Café Luna" }, database)
    await updateListing(site.id, cafe.id, { status: "published" }, database)
    listingId = cafe.id
    claimId = uuid()
    await database.insert(directoryClaims).values({
      id: claimId,
      workspaceId: site.id,
      listingId,
      userId: ownerId,
      contactEmail: ownerEmail,
      claimantName: "Ari",
      status: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const sent = await sendOwnerEvent(
      ownerId,
      claimId,
      {
        title: "Harvest festival",
        startDate: "2030-01-20",
        startTime: "12:00",
        endTime: "20:00",
        description: "",
        coverImage: "",
      },
      database,
      new Date("2029-12-01T17:00:00Z")
    )
    if (sent.outcome !== "sent") throw new Error(JSON.stringify(sent))
    const approved = await reviewEventSubmission(
      site.id,
      sent.submission.id,
      { decision: "approve", reviewerId: adminId },
      database
    )
    eventId = approved.eventId!

    planId = (
      await saveFeaturedPlan(
        site.id,
        {
          kind: "event",
          name: "Feature an event",
          priceCents: 2500,
          currency: "usd",
          durationDays: 30,
        },
        database
      )
    ).id
    // A listing plan on the same site, which an event is never offered.
    await saveFeaturedPlan(
      site.id,
      { name: "One week", priceCents: 1500, currency: "usd", durationDays: 7 },
      database
    )
  })

  function fakeStripe() {
    const created: Stripe.Checkout.SessionCreateParams[] = []
    let session: Stripe.Checkout.Session | null = null
    return {
      created,
      expire() {
        session = { ...session!, status: "expired" }
      },
      client: {
        async create(params: Stripe.Checkout.SessionCreateParams) {
          created.push(params)
          session = {
            id: "cs_test_event",
            url: "https://checkout.stripe.test/event",
            status: "open",
            payment_status: "unpaid",
            payment_intent: null,
            amount_total: params.line_items?.[0]?.price_data?.unit_amount,
            currency: params.line_items?.[0]?.price_data?.currency,
            metadata: params.metadata ?? {},
          } as Stripe.Checkout.Session
          return session
        },
        async retrieve() {
          return session!
        },
      },
    }
  }

  it("keeps an event plan without days, and keeps its kind when edited", async () => {
    const overview = await featuredAdminOverview(site.id, {}, database)
    const plan = overview.plans.find((row) => row.id === planId)
    expect(plan).toMatchObject({ kind: "event", durationDays: null, priority: 0 })
    const edited = await saveFeaturedPlan(
      site.id,
      {
        id: planId,
        kind: "listing",
        name: "Feature an event",
        priceCents: 3000,
        currency: "usd",
      },
      database
    )
    expect(edited).toMatchObject({ kind: "event", priceCents: 3000 })
  })

  it("offers only event plans, and checks out for the owner's own event", async () => {
    const state = await eventFeaturedPurchaseState(ownerId, eventId, database)
    expect(state.plans.map((plan) => plan.id)).toEqual([planId])
    expect(state).toMatchObject({ active: false, problem: null })

    const stripe = fakeStripe()
    const { url } = await createEventFeaturedCheckout(
      { id: ownerId, email: ownerEmail },
      { eventId, planId },
      database,
      stripe.client
    )
    expect(url).toBe("https://checkout.stripe.test/event")
    expect(stripe.created[0]?.metadata).toMatchObject({
      eventId,
      claimId,
      planId,
      priceCents: "2500",
    })
    expect(stripe.created[0]?.metadata).not.toHaveProperty("durationDays")
    expect(stripe.created[0]?.metadata).not.toHaveProperty("listingId")
    const [reservation] = await database
      .select()
      .from(directoryFeaturedCheckouts)
    expect(reservation).toMatchObject({
      eventId,
      listingId: null,
      durationDays: null,
    })
  })

  it("puts the paid event on top until it ends, and moves the end with it", async () => {
    const stripe = fakeStripe()
    await createEventFeaturedCheckout(
      { id: ownerId, email: ownerEmail },
      { eventId, planId },
      database,
      stripe.client
    )
    const paid = await activateFeaturedSession(
      ownerId,
      {
        id: "cs_test_event",
        payment_status: "paid",
        payment_intent: "pi_event",
        amount_total: 2500,
        currency: "usd",
        metadata: stripe.created[0]!.metadata as Stripe.Metadata,
      },
      database
    )
    expect(paid.kind).toBe("event")

    const [spot] = await database.select().from(directoryFeaturedEntitlements)
    const festivalEnds = eventEndMoment(
      {
        startDate: "2030-01-20",
        startTime: "12:00",
        endDate: "2030-01-20",
        endTime: "20:00",
      },
      "America/Toronto"
    )
    expect(spot).toMatchObject({ eventId, listingId: null })
    expect(spot!.endsAt.getTime()).toBe(festivalEnds.getTime())
    expect(await database.select().from(directoryFeaturedCheckouts)).toEqual([])

    await dated("Saturday market", "2030-01-05")
    const events = await upcoming("2030-01-01T12:00")
    expect(events.map((row) => [row.title, row.featured])).toEqual([
      ["Harvest festival", true],
      ["Saturday market", false],
    ])
    const owned = await ownerEventsFor(ownerId, database)
    expect(owned.events[listingId]?.[0]).toMatchObject({
      eventId,
      featured: true,
    })

    await updateEvent(
      site.id,
      eventId,
      { when: { startDate: "2030-01-27", startTime: "12:00", endTime: "20:00" } },
      database
    )
    const [moved] = await database.select().from(directoryFeaturedEntitlements)
    expect(moved!.endsAt.getTime()).toBe(
      festivalEnds.getTime() + 7 * 24 * 60 * 60 * 1000
    )

    // The owner cannot buy a second spot, and the admin sees the sale.
    await expect(
      createEventFeaturedCheckout(
        { id: ownerId, email: ownerEmail },
        { eventId, planId },
        database,
        fakeStripe().client
      )
    ).rejects.toThrow("This event is already featured.")
    const overview = await featuredAdminOverview(
      site.id,
      { search: "harvest" },
      database
    )
    expect(overview.entitlements).toMatchObject([
      { kind: "event", title: "Harvest festival", status: "active" },
    ])
  })

  it("stops the paid spot when the owner no longer looks after the listing", async () => {
    const at = new Date()
    await database.insert(directoryFeaturedEntitlements).values({
      id: uuid(),
      workspaceId: site.id,
      eventId,
      claimId,
      buyerUserId: ownerId,
      planId,
      stripeSessionId: "cs_test_claim",
      amountTotal: 2500,
      currency: "usd",
      startsAt: new Date(at.getTime() - 1000),
      endsAt: new Date("2030-01-21T01:00:00Z"),
      createdAt: at,
      updatedAt: at,
    })
    expect((await upcoming("2030-01-01T12:00"))[0]?.featured).toBe(true)
    await database
      .update(directoryClaims)
      .set({ status: "rejected" })
      .where(eq(directoryClaims.id, claimId))
    expect((await upcoming("2030-01-01T12:00"))[0]?.featured).toBe(false)
  })

  it("refuses somebody else's event, a listing plan, a private event and one already featured", async () => {
    const stripe = fakeStripe()
    const user = { id: ownerId, email: ownerEmail }
    await expect(
      createEventFeaturedCheckout(
        { id: otherId, email: "shop@example.com" },
        { eventId, planId },
        database,
        stripe.client
      )
    ).rejects.toThrow("That event is not one you sent in.")

    const [listingPlan] = (await featuredAdminOverview(site.id, {}, database))
      .plans.filter((plan) => plan.kind === "listing")
    await expect(
      createEventFeaturedCheckout(
        user,
        { eventId, planId: listingPlan!.id },
        database,
        stripe.client
      )
    ).rejects.toThrow("That featured plan is not available for this event.")

    await updateEvent(site.id, eventId, { visibility: "private" }, database)
    expect(
      (await eventFeaturedPurchaseState(ownerId, eventId, database)).problem
    ).toBe("A private event is not on the Events page, so it cannot be featured.")

    await updateEvent(
      site.id,
      eventId,
      { visibility: "public", featured: true },
      database
    )
    expect(
      (await eventFeaturedPurchaseState(ownerId, eventId, database)).active
    ).toBe(true)
    await expect(
      createEventFeaturedCheckout(user, { eventId, planId }, database, stripe.client)
    ).rejects.toThrow("This event is already featured.")
    expect(stripe.created).toEqual([])
  })

  it("holds the delete while the owner's checkout is open, and clears an expired one", async () => {
    const stripe = fakeStripe()
    await createEventFeaturedCheckout(
      { id: ownerId, email: ownerEmail },
      { eventId, planId },
      database,
      stripe.client
    )
    await expect(
      prepareFeaturedEventsForDeletion(site.id, [eventId], database, stripe.client)
    ).rejects.toThrow("A featured checkout is still open.")

    stripe.expire()
    await prepareFeaturedEventsForDeletion(
      site.id,
      [eventId],
      database,
      stripe.client
    )
    expect(await database.select().from(directoryFeaturedCheckouts)).toEqual([])
    expect((await deleteEvents(site.id, [eventId], database)).done).toEqual([
      eventId,
    ])
  })
})
