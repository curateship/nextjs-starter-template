import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import type Stripe from "stripe"

import { daysUntil, reminderDue } from "@/lib/directory/featured"
import { eventEndMoment } from "@/lib/events/calendar-file"
import {
  eventHasEnded,
  toClock,
  type EventWhen,
} from "@/lib/events/event-time"
import { appUrlFor } from "@/server/app-url"
import { now, uuid } from "@/server/auth/security"
import { stripe } from "@/server/billing/stripe"
import { readPageVisibility } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import { sendDirectoryEmail } from "@/server/directory/mail"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import {
  directoryClaims,
  directoryFeaturedCheckouts,
  directoryFeaturedEntitlements,
  directoryFeaturedPlans,
  directoryListings,
} from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import { eventSubmissions, siteEvents } from "@/server/events/schema"
import { customShellUsers } from "@/server/schema"

const DAY_MS = 24 * 60 * 60 * 1000
const FEATURED_METADATA_KIND = "cms_directory_featured"

type FeaturedCheckoutStripe = {
  create(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string
  ): Promise<Stripe.Checkout.Session>
  retrieve(id: string): Promise<Stripe.Checkout.Session>
}

async function featuredCheckoutStripe(): Promise<FeaturedCheckoutStripe> {
  const client = await stripe()
  return {
    create: (params, idempotencyKey) =>
      client.checkout.sessions.create(params, { idempotencyKey }),
    retrieve: (id) => client.checkout.sessions.retrieve(id),
  }
}

type FeaturedCheckoutReservation =
  typeof directoryFeaturedCheckouts.$inferSelect

/**
 * What Stripe keeps on the session. A listing's names the listing and the
 * days; an event's names the event and has no days, because its spot ends
 * when the event does.
 */
function featuredCheckoutMetadata(reservation: FeaturedCheckoutReservation) {
  return {
    kind: FEATURED_METADATA_KIND,
    workspaceId: reservation.workspaceId,
    ...(reservation.eventId
      ? { eventId: reservation.eventId }
      : { listingId: reservation.listingId ?? "" }),
    claimId: reservation.claimId,
    planId: reservation.planId,
    userId: reservation.buyerUserId,
    priceCents: String(reservation.priceCents),
    currency: reservation.currency,
    ...(reservation.durationDays === null
      ? {}
      : { durationDays: String(reservation.durationDays) }),
  }
}

async function sessionForFeaturedCheckout(
  reservation: FeaturedCheckoutReservation,
  checkoutClient: FeaturedCheckoutStripe
) {
  if (reservation.stripeSessionId) {
    return checkoutClient.retrieve(reservation.stripeSessionId)
  }

  const metadata = featuredCheckoutMetadata(reservation)
  return checkoutClient.create(
    {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: reservation.currency,
            unit_amount: reservation.priceCents,
            product_data: { name: reservation.productName },
          },
          quantity: 1,
        },
      ],
      customer_email: reservation.customerEmail,
      client_reference_id: reservation.buyerUserId,
      metadata,
      payment_intent_data: { metadata },
      success_url: reservation.successUrl,
      cancel_url: reservation.cancelUrl,
    },
    `cms-directory-featured-${reservation.id}`
  )
}

/** What a plan sells spots on. */
export type FeaturedPlanKind = "listing" | "event"

export type FeaturedPlan = {
  id: string
  kind: FeaturedPlanKind
  name: string
  description: string
  priceCents: number
  currency: string
  /** A listing plan's days. Null on an event plan, which lasts until the event ends. */
  durationDays: number | null
  priority: number
  active: boolean
}

export type FeaturedEntitlement = {
  id: string
  kind: FeaturedPlanKind
  /** The listing's or the event's title. */
  title: string
  buyerEmail: string
  planName: string
  amountTotal: number
  currency: string
  status: "active" | "expired" | "revoked"
  startsAt: Date
  endsAt: Date
  revokeNote: string
}

function planFrom(row: typeof directoryFeaturedPlans.$inferSelect): FeaturedPlan {
  return {
    id: row.id,
    kind: row.kind === "event" ? "event" : "listing",
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    currency: row.currency,
    durationDays: row.durationDays,
    priority: row.priority,
    active: row.active,
  }
}

export async function listFeaturedPlans(
  workspaceId: string,
  options: { activeOnly?: boolean; kind?: FeaturedPlanKind } = {},
  database: CustomShellDb = db
) {
  const rows = await database
    .select()
    .from(directoryFeaturedPlans)
    .where(
      and(
        eq(directoryFeaturedPlans.workspaceId, workspaceId),
        options.activeOnly ? eq(directoryFeaturedPlans.active, true) : undefined,
        options.kind ? eq(directoryFeaturedPlans.kind, options.kind) : undefined
      )
    )
    .orderBy(desc(directoryFeaturedPlans.active), desc(directoryFeaturedPlans.priority), asc(directoryFeaturedPlans.name))
  return rows.map(planFrom)
}

export async function saveFeaturedPlan(
  workspaceId: string,
  input: {
    id?: string
    /** Only read when the plan is made. A saved plan keeps its kind. */
    kind?: FeaturedPlanKind
    name: string
    description?: string
    priceCents: number
    currency: string
    /** A listing plan's days. Ignored on an event plan. */
    durationDays?: number | null
    priority?: number
    active?: boolean
  },
  database: CustomShellDb = db
) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 120)
  const currency = input.currency.trim().toLowerCase()
  if (!name) throw new Error("A featured plan needs a name.")
  if (!Number.isInteger(input.priceCents) || input.priceCents < 1) {
    throw new Error("The price must be at least one cent.")
  }
  if (!/^[a-z]{3}$/.test(currency)) throw new Error("Use a three-letter currency code.")

  // A plan that was sold as one kind stays that kind, so an old purchase
  // never changes what it bought.
  let kind: FeaturedPlanKind = input.kind ?? "listing"
  if (input.id) {
    const [saved] = await database
      .select({ kind: directoryFeaturedPlans.kind })
      .from(directoryFeaturedPlans)
      .where(
        and(
          eq(directoryFeaturedPlans.id, input.id),
          eq(directoryFeaturedPlans.workspaceId, workspaceId)
        )
      )
      .limit(1)
    if (!saved) throw new Error("That featured plan no longer exists.")
    kind = saved.kind === "event" ? "event" : "listing"
  }
  const days = input.durationDays ?? null
  if (
    kind === "listing" &&
    (days === null || !Number.isInteger(days) || days < 1 || days > 3650)
  ) {
    throw new Error("The period must be between 1 and 3650 days.")
  }
  const at = now()
  const values = {
    name,
    description: (input.description ?? "").trim().slice(0, 500),
    priceCents: input.priceCents,
    currency,
    durationDays: kind === "listing" ? days : null,
    // Events sit soonest first among themselves, so an event plan has no rank.
    priority:
      kind === "listing"
        ? Math.max(-10_000, Math.min(10_000, Math.trunc(input.priority ?? 0)))
        : 0,
    active: input.active ?? true,
    updatedAt: at,
  }

  if (input.id) {
    const [updated] = await database
      .update(directoryFeaturedPlans)
      .set(values)
      .where(
        and(
          eq(directoryFeaturedPlans.id, input.id),
          eq(directoryFeaturedPlans.workspaceId, workspaceId)
        )
      )
      .returning()
    if (!updated) throw new Error("That featured plan no longer exists.")
    return planFrom(updated)
  }

  const [created] = await database
    .insert(directoryFeaturedPlans)
    .values({ id: uuid(), workspaceId, kind, ...values, createdAt: at })
    .returning()
  if (!created) throw new Error("The featured plan was not created.")
  return planFrom(created)
}

export async function deleteFeaturedPlan(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
) {
  const [used, checkout] = await Promise.all([
    database
      .select({ id: directoryFeaturedEntitlements.id })
      .from(directoryFeaturedEntitlements)
      .where(
        and(
          eq(directoryFeaturedEntitlements.workspaceId, workspaceId),
          eq(directoryFeaturedEntitlements.planId, id)
        )
      )
      .limit(1),
    database
      .select({ id: directoryFeaturedCheckouts.id })
      .from(directoryFeaturedCheckouts)
      .where(
        and(
          eq(directoryFeaturedCheckouts.workspaceId, workspaceId),
          eq(directoryFeaturedCheckouts.planId, id)
        )
      )
      .limit(1),
  ])
  if (used[0] || checkout[0]) {
    throw new Error("Archive this plan instead because a checkout or purchase already uses it.")
  }

  const [deleted] = await database
    .delete(directoryFeaturedPlans)
    .where(
      and(
        eq(directoryFeaturedPlans.workspaceId, workspaceId),
        eq(directoryFeaturedPlans.id, id)
      )
    )
    .returning({ id: directoryFeaturedPlans.id })
  if (!deleted) throw new Error("That featured plan no longer exists.")
  return deleted.id
}

const derivedStatus = sql<"active" | "expired" | "revoked">`
  case
    when ${directoryFeaturedEntitlements.status} = 'revoked' then 'revoked'
    when ${directoryFeaturedEntitlements.endsAt} <= now() then 'expired'
    else 'active'
  end
`

/**
 * Everything the admin screen draws: the plans, one page of placements, and
 * the money.
 *
 * **The plans come back whole and the placements come back a page at a time**,
 * and the difference is how they grow. A site offers a handful of plans and an
 * admin creates them by hand, so paging that in the browser costs nothing and
 * keeps the counts above it honest. Placements are one row per purchase, for
 * as long as the site sells them, so they have to page on the server or the
 * screen eventually draws every sale the site has ever made.
 */
export async function featuredAdminOverview(
  workspaceId: string,
  options: {
    /** Matches the listing's or event's title, or the buyer's email. */
    search?: string
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()

  // The site's own placements, always. The search narrows what is already
  // inside that boundary — it never replaces it.
  const filters = [eq(directoryFeaturedEntitlements.workspaceId, workspaceId)]
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(directoryListings.title, pattern),
      ilike(siteEvents.title, pattern),
      ilike(customShellUsers.email, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  const where = and(...filters)

  const [plans, rows, [countRow], [activeRow], revenueRows] = await Promise.all([
    listFeaturedPlans(workspaceId, {}, database),
    database
      .select({
        id: directoryFeaturedEntitlements.id,
        kind: sql<FeaturedPlanKind>`case when ${directoryFeaturedEntitlements.eventId} is null then 'listing' else 'event' end`,
        title: sql<string>`coalesce(${directoryListings.title}, ${siteEvents.title}, '')`,
        buyerEmail: customShellUsers.email,
        planName: directoryFeaturedPlans.name,
        amountTotal: directoryFeaturedEntitlements.amountTotal,
        currency: directoryFeaturedEntitlements.currency,
        status: derivedStatus,
        startsAt: directoryFeaturedEntitlements.startsAt,
        endsAt: directoryFeaturedEntitlements.endsAt,
        revokeNote: directoryFeaturedEntitlements.revokeNote,
      })
      .from(directoryFeaturedEntitlements)
      .leftJoin(directoryListings, eq(directoryListings.id, directoryFeaturedEntitlements.listingId))
      .leftJoin(siteEvents, eq(siteEvents.id, directoryFeaturedEntitlements.eventId))
      .innerJoin(customShellUsers, eq(customShellUsers.id, directoryFeaturedEntitlements.buyerUserId))
      .innerJoin(directoryFeaturedPlans, eq(directoryFeaturedPlans.id, directoryFeaturedEntitlements.planId))
      .where(where)
      // The id breaks ties so a page boundary cannot land mid-tie and show the
      // same placement twice or skip one.
      .orderBy(
        desc(directoryFeaturedEntitlements.createdAt),
        asc(directoryFeaturedEntitlements.id)
      )
      .limit(limit)
      .offset(offset),
    // The same joins as the page above it, because the search reaches the
    // titles and the buyer's email. Count without them and the footer counts
    // a different set from the one on screen.
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(directoryFeaturedEntitlements)
      .leftJoin(directoryListings, eq(directoryListings.id, directoryFeaturedEntitlements.listingId))
      .leftJoin(siteEvents, eq(siteEvents.id, directoryFeaturedEntitlements.eventId))
      .innerJoin(customShellUsers, eq(customShellUsers.id, directoryFeaturedEntitlements.buyerUserId))
      .where(where),
    // "Active now" is the whole site's figure, not this page's. Counting the
    // rows on screen would have made the card fall as somebody paged.
    database
      .select({
        active: sql<number>`count(*) filter (where ${directoryFeaturedEntitlements.status} <> 'revoked' and ${directoryFeaturedEntitlements.endsAt} > now())::int`,
      })
      .from(directoryFeaturedEntitlements)
      .where(eq(directoryFeaturedEntitlements.workspaceId, workspaceId)),
    database
      .select({
        currency: directoryFeaturedEntitlements.currency,
        amount: sql<number>`coalesce(sum(${directoryFeaturedEntitlements.amountTotal}), 0)::int`,
        purchases: sql<number>`count(*)::int`,
      })
      .from(directoryFeaturedEntitlements)
      .where(eq(directoryFeaturedEntitlements.workspaceId, workspaceId))
      .groupBy(directoryFeaturedEntitlements.currency),
  ])
  return {
    plans,
    entitlements: rows as FeaturedEntitlement[],
    entitlementsTotal: countRow?.total ?? 0,
    activeCount: activeRow?.active ?? 0,
    revenue: revenueRows,
  }
}

export async function revokeFeaturedEntitlement(
  workspaceId: string,
  entitlementId: string,
  adminId: string,
  note: string,
  database: CustomShellDb = db
) {
  const at = now()
  const [updated] = await database
    .update(directoryFeaturedEntitlements)
    .set({
      status: "revoked",
      revokedByUserId: adminId,
      revokedAt: at,
      revokeNote: note.trim().slice(0, 500),
      updatedAt: at,
    })
    .where(
      and(
        eq(directoryFeaturedEntitlements.id, entitlementId),
        eq(directoryFeaturedEntitlements.workspaceId, workspaceId),
        eq(directoryFeaturedEntitlements.status, "active")
      )
    )
    .returning({ id: directoryFeaturedEntitlements.id })
  if (!updated) throw new Error("That placement is no longer active.")
  // The Events page and the listing sorts are cached, and the badge should
  // go now rather than when the cache runs out.
  clearPublicDirectoryCache(workspaceId)
  return updated.id
}

/** SQL value used before every public sort: active placements first, strongest priority first. */
export function featuredPriorityFor(workspaceId: string) {
  return sql<number>`coalesce((
    select max(fp.priority)
    from directory_featured_entitlements fe
    inner join directory_featured_plans fp on fp.id = fe.plan_id
    inner join directory_claims fc
      on fc.id = fe.claim_id
      and fc.status = 'approved'
      and fc.user_id = fe.buyer_user_id
      and fc.listing_id = fe.listing_id
    where fe.workspace_id = ${workspaceId}
      and fe.listing_id = ${directoryListings.id}
      and fe.status = 'active'
      and fe.starts_at <= now()
      and fe.ends_at > now()
  ), -2147483648)`
}

export async function activeFeaturedForListings(
  workspaceId: string,
  listingIds: string[],
  database: CustomShellDb = db
) {
  if (listingIds.length === 0) return new Set<string>()
  const rows = await database
    .select({ listingId: directoryFeaturedEntitlements.listingId })
    .from(directoryFeaturedEntitlements)
    .innerJoin(
      directoryClaims,
      and(
        eq(directoryClaims.id, directoryFeaturedEntitlements.claimId),
        eq(directoryClaims.status, "approved"),
        eq(directoryClaims.userId, directoryFeaturedEntitlements.buyerUserId),
        eq(directoryClaims.listingId, directoryFeaturedEntitlements.listingId)
      )
    )
    .where(
      and(
        eq(directoryFeaturedEntitlements.workspaceId, workspaceId),
        inArray(directoryFeaturedEntitlements.listingId, listingIds),
        eq(directoryFeaturedEntitlements.status, "active"),
        lte(directoryFeaturedEntitlements.startsAt, now()),
        gt(directoryFeaturedEntitlements.endsAt, now())
      )
    )
  return new Set(rows.map((row) => row.listingId))
}

export async function featuredPurchaseState(
  userId: string,
  listingId: string,
  database: CustomShellDb = db
) {
  const [owned] = await database
    .select({ workspaceId: directoryClaims.workspaceId })
    .from(directoryClaims)
    .innerJoin(directoryListings, eq(directoryListings.id, directoryClaims.listingId))
    .where(
      and(
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.listingId, listingId),
        eq(directoryClaims.status, "approved"),
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)
  if (!owned) throw new Error("You do not look after that listing.")

  const [plans, active] = await Promise.all([
    listFeaturedPlans(owned.workspaceId, { activeOnly: true, kind: "listing" }, database),
    activeFeaturedForListings(owned.workspaceId, [listingId], database),
  ])
  return { plans, active: active.has(listingId) }
}

/**
 * Reserves a checkout and hands back where to pay, for a listing or an event.
 *
 * `pending` finds the one open reservation for the thing being featured.
 * `reserve` is only asked when there is none, and returns the new row, or
 * throws with words for the owner.
 */
async function openFeaturedCheckout(
  userId: string,
  pending: SQL | undefined,
  reserve: () => Promise<typeof directoryFeaturedCheckouts.$inferInsert>,
  database: CustomShellDb,
  checkoutClient: FeaturedCheckoutStripe
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let [reservation] = await database
      .select()
      .from(directoryFeaturedCheckouts)
      .where(pending)
      .limit(1)

    if (!reservation) {
      const [created] = await database
        .insert(directoryFeaturedCheckouts)
        .values(await reserve())
        .onConflictDoNothing()
        .returning()
      reservation = created
      if (!reservation) {
        const [concurrent] = await database
          .select()
          .from(directoryFeaturedCheckouts)
          .where(pending)
          .limit(1)
        reservation = concurrent
      }
    }
    if (!reservation || reservation.buyerUserId !== userId) {
      throw new Error("CHECKOUT_ALREADY_STARTED")
    }

    let session: Stripe.Checkout.Session
    try {
      session = await sessionForFeaturedCheckout(reservation, checkoutClient)
    } catch (error) {
      if (error instanceof Error && error.message.includes("BILLING_NOT_CONFIGURED")) {
        throw error
      }
      throw new Error("CHECKOUT_FAILED")
    }

    await database
      .update(directoryFeaturedCheckouts)
      .set({ stripeSessionId: session.id, updatedAt: now() })
      .where(eq(directoryFeaturedCheckouts.id, reservation.id))

    if (session.payment_status === "paid") {
      await activateFeaturedSession(userId, session, database)
      return { url: appUrlFor(`/my-listings?featured_session=${session.id}`) }
    }
    if (session.status === "expired") {
      await database
        .delete(directoryFeaturedCheckouts)
        .where(eq(directoryFeaturedCheckouts.id, reservation.id))
      continue
    }
    if (session.status === "complete") throw new Error("CHECKOUT_PAYMENT_PROCESSING")
    if (!session.url) throw new Error("Stripe did not return a checkout address.")

    return { url: session.url }
  }
  throw new Error("CHECKOUT_FAILED")
}

const FEATURED_SUCCESS_URL = "/my-listings?featured_session={CHECKOUT_SESSION_ID}"
const FEATURED_CANCEL_URL = "/my-listings?featured_checkout=cancelled"

export async function createFeaturedCheckout(
  user: { id: string; email: string },
  input: { listingId: string; planId: string },
  database: CustomShellDb = db,
  stripeCheckout?: FeaturedCheckoutStripe
) {
  const [owned] = await database
    .select({
      workspaceId: directoryClaims.workspaceId,
      claimId: directoryClaims.id,
      listingTitle: directoryListings.title,
    })
    .from(directoryClaims)
    .innerJoin(
      directoryListings,
      and(
        eq(directoryListings.id, directoryClaims.listingId),
        eq(directoryListings.workspaceId, directoryClaims.workspaceId)
      )
    )
    .where(
      and(
        eq(directoryClaims.userId, user.id),
        eq(directoryClaims.listingId, input.listingId),
        eq(directoryClaims.status, "approved"),
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)
  if (!owned) throw new Error("That featured plan is not available for this listing.")
  if ((await activeFeaturedForListings(owned.workspaceId, [input.listingId], database)).size) {
    throw new Error("This listing already has an active featured placement.")
  }

  return openFeaturedCheckout(
    user.id,
    and(
      eq(directoryFeaturedCheckouts.workspaceId, owned.workspaceId),
      eq(directoryFeaturedCheckouts.listingId, input.listingId)
    ),
    async () => {
      const [plan] = await database
        .select()
        .from(directoryFeaturedPlans)
        .where(
          and(
            eq(directoryFeaturedPlans.id, input.planId),
            eq(directoryFeaturedPlans.workspaceId, owned.workspaceId),
            eq(directoryFeaturedPlans.kind, "listing"),
            eq(directoryFeaturedPlans.active, true)
          )
        )
        .limit(1)
      if (!plan) throw new Error("That featured plan is not available for this listing.")
      const at = now()
      return {
        id: uuid(),
        workspaceId: owned.workspaceId,
        listingId: input.listingId,
        claimId: owned.claimId,
        buyerUserId: user.id,
        planId: plan.id,
        priceCents: plan.priceCents,
        currency: plan.currency,
        durationDays: plan.durationDays,
        productName: `${owned.listingTitle} — ${plan.name}`,
        customerEmail: user.email,
        successUrl: appUrlFor(FEATURED_SUCCESS_URL),
        cancelUrl: appUrlFor(FEATURED_CANCEL_URL),
        createdAt: at,
        updatedAt: at,
      }
    },
    database,
    stripeCheckout ?? (await featuredCheckoutStripe())
  )
}

/**
 * Whether an event is featured, for any read that selects from `events`: its
 * main event is switched on in Admin → Events, or has a paid spot running
 * whose buyer still looks after the listing. A date of a repeating event
 * follows its main event, so every date is featured or none is.
 */
export const eventIsFeatured = sql<boolean>`exists (
  select 1 from events fm
  where fm.id = coalesce(${siteEvents.seriesId}, ${siteEvents.id})
    and (fm.featured or exists (
      select 1
      from directory_featured_entitlements fe
      inner join directory_claims fc
        on fc.id = fe.claim_id
        and fc.status = 'approved'
        and fc.user_id = fe.buyer_user_id
      where fe.event_id = fm.id
        and fe.status = 'active'
        and fe.starts_at <= now()
        and fe.ends_at > now()
    ))
)`

/** Which of these events are featured now, by either kind of spot. */
export async function featuredEventIds(
  eventIds: string[],
  database: CustomShellDb = db
): Promise<Set<string>> {
  const unique = [...new Set(eventIds)].filter(Boolean)
  if (unique.length === 0) return new Set()
  const rows = await database
    .select({ id: siteEvents.id })
    .from(siteEvents)
    .where(and(inArray(siteEvents.id, unique), eventIsFeatured))
  return new Set(rows.map((row) => row.id))
}

/** The paid spot running on an event now, or null. The buyer must still look after the listing. */
export async function activeEventSpot(
  workspaceId: string,
  eventId: string,
  database: CustomShellDb = db
): Promise<{ endsAt: Date; buyerEmail: string } | null> {
  const [row] = await database
    .select({
      endsAt: directoryFeaturedEntitlements.endsAt,
      buyerEmail: customShellUsers.email,
    })
    .from(directoryFeaturedEntitlements)
    .innerJoin(
      directoryClaims,
      and(
        eq(directoryClaims.id, directoryFeaturedEntitlements.claimId),
        eq(directoryClaims.status, "approved"),
        eq(directoryClaims.userId, directoryFeaturedEntitlements.buyerUserId)
      )
    )
    .innerJoin(customShellUsers, eq(customShellUsers.id, directoryFeaturedEntitlements.buyerUserId))
    .where(
      and(
        eq(directoryFeaturedEntitlements.workspaceId, workspaceId),
        eq(directoryFeaturedEntitlements.eventId, eventId),
        eq(directoryFeaturedEntitlements.status, "active"),
        lte(directoryFeaturedEntitlements.startsAt, now()),
        gt(directoryFeaturedEntitlements.endsAt, now())
      )
    )
    .limit(1)
  return row ?? null
}

/**
 * An event this account sent in from My listings, approved, while the account
 * still looks after the listing it was sent for. Found by the account on both
 * the suggestion and the claim, so another owner's event is simply not found.
 */
async function ownedEvent(
  userId: string,
  eventId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select({
      workspaceId: siteEvents.workspaceId,
      claimId: directoryClaims.id,
      title: siteEvents.title,
      status: siteEvents.status,
      visibility: siteEvents.visibility,
      featured: siteEvents.featured,
      startDate: siteEvents.startDate,
      startTime: siteEvents.startTime,
      endDate: siteEvents.endDate,
      endTime: siteEvents.endTime,
    })
    .from(eventSubmissions)
    .innerJoin(
      siteEvents,
      and(
        eq(siteEvents.id, eventSubmissions.eventId),
        eq(siteEvents.workspaceId, eventSubmissions.workspaceId)
      )
    )
    .innerJoin(
      directoryClaims,
      and(
        eq(directoryClaims.listingId, eventSubmissions.listingId),
        eq(directoryClaims.workspaceId, eventSubmissions.workspaceId),
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.status, "approved")
      )
    )
    .where(
      and(
        eq(eventSubmissions.eventId, eventId),
        eq(eventSubmissions.ownerUserId, userId),
        eq(eventSubmissions.fromOwner, true),
        eq(eventSubmissions.status, "approved")
      )
    )
    .limit(1)
  if (!row) return null
  const when: EventWhen = {
    startDate: row.startDate,
    startTime: toClock(row.startTime),
    endDate: row.endDate,
    endTime: row.endTime ? toClock(row.endTime) : null,
  }
  return { ...row, when }
}

/**
 * Why an owner cannot pay to feature this event now, in words for them, or
 * null when they can. The Events page is the only place a featured event
 * shows, so an event that cannot be on it cannot be featured.
 */
async function eventFeatureProblem(
  event: NonNullable<Awaited<ReturnType<typeof ownedEvent>>>,
  database: CustomShellDb
): Promise<string | null> {
  if (event.status !== "published") return "Only a published event can be featured."
  if (event.visibility !== "public") {
    return "A private event is not on the Events page, so it cannot be featured."
  }
  const [visibility, timeZone] = await Promise.all([
    readPageVisibility(event.workspaceId, "/events", database),
    siteTimeZone(event.workspaceId, database),
  ])
  if (visibility === "off") return "This site has its Events page switched off."
  if (eventHasEnded(event.when, timeZone, new Date())) return "This event is over."
  return null
}

/**
 * What the owner's Feature button offers for one of their events: the site's
 * event plans, whether it is featured already, and why it cannot be, if so.
 */
export async function eventFeaturedPurchaseState(
  userId: string,
  eventId: string,
  database: CustomShellDb = db
): Promise<{ plans: FeaturedPlan[]; active: boolean; problem: string | null }> {
  const event = await ownedEvent(userId, eventId, database)
  if (!event) throw new Error("That event is not one you sent in.")
  const [plans, spot, problem] = await Promise.all([
    listFeaturedPlans(event.workspaceId, { activeOnly: true, kind: "event" }, database),
    activeEventSpot(event.workspaceId, eventId, database),
    eventFeatureProblem(event, database),
  ])
  return { plans, active: event.featured || spot !== null, problem }
}

/** Starts the owner's payment for a featured spot on their own event. */
export async function createEventFeaturedCheckout(
  user: { id: string; email: string },
  input: { eventId: string; planId: string },
  database: CustomShellDb = db,
  stripeCheckout?: FeaturedCheckoutStripe
) {
  const event = await ownedEvent(user.id, input.eventId, database)
  if (!event) throw new Error("That event is not one you sent in.")
  const problem = await eventFeatureProblem(event, database)
  if (problem) throw new Error(problem)
  if (event.featured || (await activeEventSpot(event.workspaceId, input.eventId, database))) {
    throw new Error("This event is already featured.")
  }

  return openFeaturedCheckout(
    user.id,
    and(
      eq(directoryFeaturedCheckouts.workspaceId, event.workspaceId),
      eq(directoryFeaturedCheckouts.eventId, input.eventId)
    ),
    async () => {
      const [plan] = await database
        .select()
        .from(directoryFeaturedPlans)
        .where(
          and(
            eq(directoryFeaturedPlans.id, input.planId),
            eq(directoryFeaturedPlans.workspaceId, event.workspaceId),
            eq(directoryFeaturedPlans.kind, "event"),
            eq(directoryFeaturedPlans.active, true)
          )
        )
        .limit(1)
      if (!plan) throw new Error("That featured plan is not available for this event.")
      const at = now()
      return {
        id: uuid(),
        workspaceId: event.workspaceId,
        eventId: input.eventId,
        claimId: event.claimId,
        buyerUserId: user.id,
        planId: plan.id,
        priceCents: plan.priceCents,
        currency: plan.currency,
        durationDays: null,
        productName: `${event.title} — ${plan.name}`,
        customerEmail: user.email,
        successUrl: appUrlFor(FEATURED_SUCCESS_URL),
        cancelUrl: appUrlFor(FEATURED_CANCEL_URL),
        createdAt: at,
        updatedAt: at,
      }
    },
    database,
    stripeCheckout ?? (await featuredCheckoutStripe())
  )
}

/**
 * Moves a paid spot's end with its event, so "until the event ends" stays
 * true when an admin changes the event's day or time.
 */
export async function moveEventSpotEnd(
  workspaceId: string,
  eventId: string,
  when: EventWhen,
  database: CustomShellDb = db
) {
  const endsAt = eventEndMoment(when, await siteTimeZone(workspaceId, database))
  await database
    .update(directoryFeaturedEntitlements)
    .set({ endsAt, updatedAt: now() })
    .where(
      and(
        eq(directoryFeaturedEntitlements.workspaceId, workspaceId),
        eq(directoryFeaturedEntitlements.eventId, eventId),
        eq(directoryFeaturedEntitlements.status, "active")
      )
    )
}

export type CompletedFeaturedSession = Pick<
  Stripe.Checkout.Session,
  "id" | "metadata" | "payment_status" | "payment_intent" | "amount_total" | "currency"
>

export async function activateFeaturedSession(
  userId: string,
  session: CompletedFeaturedSession,
  database: CustomShellDb = db
): Promise<{ id: string; kind: FeaturedPlanKind }> {
  if (session.payment_status !== "paid") throw new Error("The payment is not complete yet.")
  const metadata = session.metadata
  if (metadata?.kind !== FEATURED_METADATA_KIND || metadata.userId !== userId) {
    throw new Error("That checkout does not belong to this account.")
  }
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null

  const target = metadata.eventId
    ? await paidEventTarget(userId, metadata, database)
    : await paidListingTarget(userId, metadata, database)

  // New checkouts carry the server-chosen terms in Stripe's signed session so
  // a later admin edit cannot strand a payment before the buyer returns. Older
  // sessions fall back to the current plan terms.
  const snapshotPrice = Number(metadata.priceCents)
  const hasPriceSnapshot =
    Number.isInteger(snapshotPrice) &&
    snapshotPrice > 0 &&
    /^[a-z]{3}$/.test(metadata.currency ?? "")
  const paidPrice = hasPriceSnapshot ? snapshotPrice : target.priceCents
  const paidCurrency = hasPriceSnapshot ? metadata.currency! : target.currency
  const amountTotal = session.amount_total
  const currency = session.currency
  if (amountTotal !== paidPrice || currency !== paidCurrency) {
    throw new Error("The completed payment does not match the selected plan.")
  }

  const entitlement = await database.transaction(async (tx) => {
    const at = now()
    await tx
      .insert(directoryFeaturedEntitlements)
      .values({
        id: uuid(),
        workspaceId: target.workspaceId,
        listingId: target.listingId,
        eventId: target.eventId,
        claimId: metadata.claimId!,
        buyerUserId: userId,
        planId: metadata.planId!,
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        amountTotal,
        currency,
        status: "active",
        startsAt: at,
        endsAt: target.endsAt(at),
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoNothing()

    const [entitlement] = await tx
      .select({ id: directoryFeaturedEntitlements.id })
      .from(directoryFeaturedEntitlements)
      .where(eq(directoryFeaturedEntitlements.stripeSessionId, session.id))
      .limit(1)
    if (!entitlement) throw new Error("The paid placement could not be confirmed.")

    await tx
      .delete(directoryFeaturedCheckouts)
      .where(
        and(
          eq(directoryFeaturedCheckouts.stripeSessionId, session.id),
          eq(directoryFeaturedCheckouts.buyerUserId, userId)
        )
      )
    return entitlement
  })
  clearPublicDirectoryCache(target.workspaceId)
  return { id: entitlement.id, kind: target.eventId ? "event" : "listing" }
}

type FeaturedMetadata = NonNullable<CompletedFeaturedSession["metadata"]>

/** What a paid session is for, checked again against the database. */
type PaidTarget = {
  workspaceId: string
  listingId: string | null
  eventId: string | null
  /** The plan's terms now, for a session too old to carry its own. */
  priceCents: number
  currency: string
  endsAt: (startsAt: Date) => Date
}

async function paidListingTarget(
  userId: string,
  metadata: FeaturedMetadata,
  database: CustomShellDb
): Promise<PaidTarget> {
  const [valid] = await database
    .select({
      workspaceId: directoryClaims.workspaceId,
      durationDays: directoryFeaturedPlans.durationDays,
      priceCents: directoryFeaturedPlans.priceCents,
      currency: directoryFeaturedPlans.currency,
    })
    .from(directoryClaims)
    .innerJoin(directoryListings, eq(directoryListings.id, directoryClaims.listingId))
    .innerJoin(
      directoryFeaturedPlans,
      and(
        eq(directoryFeaturedPlans.id, metadata.planId ?? ""),
        eq(directoryFeaturedPlans.workspaceId, directoryClaims.workspaceId),
        eq(directoryFeaturedPlans.kind, "listing")
      )
    )
    .where(
      and(
        eq(directoryClaims.id, metadata.claimId ?? ""),
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.listingId, metadata.listingId ?? ""),
        eq(directoryClaims.workspaceId, metadata.workspaceId ?? ""),
        eq(directoryClaims.status, "approved"),
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)
  if (!valid) throw new Error("The paid placement no longer matches an approved listing.")
  const snapshotDays = Number(metadata.durationDays)
  const days =
    Number.isInteger(snapshotDays) && snapshotDays >= 1 && snapshotDays <= 3650
      ? snapshotDays
      : (valid.durationDays ?? 0)
  if (days < 1) throw new Error("The paid placement no longer matches an approved listing.")
  return {
    workspaceId: valid.workspaceId,
    listingId: metadata.listingId!,
    eventId: null,
    priceCents: valid.priceCents,
    currency: valid.currency,
    endsAt: (startsAt) => new Date(startsAt.getTime() + days * DAY_MS),
  }
}

/**
 * An event's paid session. The spot is recorded even if the event ended or
 * was unpublished while the owner was paying, so the payment is never lost
 * from the admin's list; it simply shows as ended there.
 */
async function paidEventTarget(
  userId: string,
  metadata: FeaturedMetadata,
  database: CustomShellDb
): Promise<PaidTarget> {
  const event = await ownedEvent(userId, metadata.eventId ?? "", database)
  if (
    !event ||
    event.claimId !== metadata.claimId ||
    event.workspaceId !== metadata.workspaceId
  ) {
    throw new Error("The paid placement no longer matches an event you sent in.")
  }
  const [plan] = await database
    .select({
      priceCents: directoryFeaturedPlans.priceCents,
      currency: directoryFeaturedPlans.currency,
    })
    .from(directoryFeaturedPlans)
    .where(
      and(
        eq(directoryFeaturedPlans.id, metadata.planId ?? ""),
        eq(directoryFeaturedPlans.workspaceId, event.workspaceId),
        eq(directoryFeaturedPlans.kind, "event")
      )
    )
    .limit(1)
  if (!plan) throw new Error("The paid placement no longer matches an event you sent in.")
  const endsAt = eventEndMoment(
    event.when,
    await siteTimeZone(event.workspaceId, database)
  )
  return {
    workspaceId: event.workspaceId,
    listingId: null,
    eventId: metadata.eventId!,
    priceCents: plan.priceCents,
    currency: plan.currency,
    endsAt: () => endsAt,
  }
}

export async function confirmFeaturedCheckout(
  userId: string,
  sessionId: string,
  database: CustomShellDb = db
) {
  let session: Stripe.Checkout.Session
  try {
    session = await (await stripe()).checkout.sessions.retrieve(sessionId)
  } catch (error) {
    if (error instanceof Error && error.message.includes("BILLING_NOT_CONFIGURED")) {
      throw error
    }
    throw new Error("CHECKOUT_NOT_FOUND")
  }
  return activateFeaturedSession(userId, session, database)
}

export async function featuredImpactForListings(
  workspaceId: string,
  listingIds: string[],
  database: CustomShellDb = db
) {
  if (listingIds.length === 0) return { activeFeatured: 0 }
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(directoryFeaturedEntitlements)
    .where(
      and(
        eq(directoryFeaturedEntitlements.workspaceId, workspaceId),
        inArray(directoryFeaturedEntitlements.listingId, listingIds),
        eq(directoryFeaturedEntitlements.status, "active"),
        lte(directoryFeaturedEntitlements.startsAt, now()),
        gt(directoryFeaturedEntitlements.endsAt, now())
      )
    )
  return { activeFeatured: row?.count ?? 0 }
}

export async function pendingFeaturedImpactForListings(
  workspaceId: string,
  listingIds: string[],
  database: CustomShellDb = db
) {
  if (listingIds.length === 0) return { pendingFeatured: 0 }
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(directoryFeaturedCheckouts)
    .where(
      and(
        eq(directoryFeaturedCheckouts.workspaceId, workspaceId),
        inArray(directoryFeaturedCheckouts.listingId, listingIds)
      )
    )
  return { pendingFeatured: row?.count ?? 0 }
}

/**
 * Resolves every open payment before a listing delete is allowed to proceed.
 * The foreign key is the final protection if a checkout begins after this
 * check but before the delete reaches the database.
 */
export async function prepareFeaturedListingsForDeletion(
  workspaceId: string,
  listingIds: string[],
  database: CustomShellDb = db,
  stripeCheckout?: FeaturedCheckoutStripe
) {
  if (listingIds.length === 0) return
  await settleOpenCheckouts(
    and(
      eq(directoryFeaturedCheckouts.workspaceId, workspaceId),
      inArray(directoryFeaturedCheckouts.listingId, listingIds)
    ),
    "A featured payment completed while deleting. Review the updated warning before trying again.",
    database,
    stripeCheckout
  )
}

/** The same for events, before Admin → Events deletes them. */
export async function prepareFeaturedEventsForDeletion(
  workspaceId: string,
  eventIds: string[],
  database: CustomShellDb = db,
  stripeCheckout?: FeaturedCheckoutStripe
) {
  if (eventIds.length === 0) return
  await settleOpenCheckouts(
    and(
      eq(directoryFeaturedCheckouts.workspaceId, workspaceId),
      inArray(directoryFeaturedCheckouts.eventId, eventIds)
    ),
    "The listing's owner has just paid to feature this event. Deleting it now deletes that paid spot too, so check with them first.",
    database,
    stripeCheckout
  )
}

/**
 * Settles each open checkout with Stripe: a paid one is recorded, an expired
 * one is cleared, and one still open stops the delete. `paidWhileDeleting`
 * is what the admin reads when a payment had landed.
 */
async function settleOpenCheckouts(
  which: SQL | undefined,
  paidWhileDeleting: string,
  database: CustomShellDb,
  stripeCheckout?: FeaturedCheckoutStripe
) {
  const reservations = await database
    .select()
    .from(directoryFeaturedCheckouts)
    .where(which)
  if (reservations.length === 0) return

  const checkoutClient = stripeCheckout ?? (await featuredCheckoutStripe())
  let completed = false
  let open = false

  for (const reservation of reservations) {
    let session: Stripe.Checkout.Session
    try {
      session = await sessionForFeaturedCheckout(reservation, checkoutClient)
    } catch {
      throw new Error(
        "A featured checkout could not be checked with Stripe. Try again before deleting."
      )
    }

    await database
      .update(directoryFeaturedCheckouts)
      .set({ stripeSessionId: session.id, updatedAt: now() })
      .where(eq(directoryFeaturedCheckouts.id, reservation.id))

    if (session.payment_status === "paid") {
      await activateFeaturedSession(
        reservation.buyerUserId,
        session,
        database
      )
      completed = true
      continue
    }
    if (session.status === "expired") {
      await database
        .delete(directoryFeaturedCheckouts)
        .where(eq(directoryFeaturedCheckouts.id, reservation.id))
      continue
    }
    open = true
  }

  if (completed) throw new Error(paidWhileDeleting)
  if (open) {
    throw new Error(
      "A featured checkout is still open. Try deleting again after it finishes or expires."
    )
  }
}

/**
 * Claims due reminders before sending, so overlapping ticker passes cannot
 * send twice. Listings only: the inner join on the listing leaves out an
 * event's spot, which ends with the event and cannot be bought again.
 */
export async function runFeaturedRenewalReminders(database: CustomShellDb = db) {
  const at = now()
  const candidates = await database
    .select({
      id: directoryFeaturedEntitlements.id,
      workspaceId: directoryFeaturedEntitlements.workspaceId,
      endsAt: directoryFeaturedEntitlements.endsAt,
      lastSent: directoryFeaturedEntitlements.reminderThresholdDays,
      email: customShellUsers.email,
      title: directoryListings.title,
    })
    .from(directoryFeaturedEntitlements)
    .innerJoin(customShellUsers, eq(customShellUsers.id, directoryFeaturedEntitlements.buyerUserId))
    .innerJoin(directoryListings, eq(directoryListings.id, directoryFeaturedEntitlements.listingId))
    .where(
      and(
        eq(directoryFeaturedEntitlements.status, "active"),
        gt(directoryFeaturedEntitlements.endsAt, at),
        lte(directoryFeaturedEntitlements.endsAt, new Date(at.getTime() + 7 * DAY_MS)),
        or(
          isNull(directoryFeaturedEntitlements.reminderClaimedAt),
          lt(directoryFeaturedEntitlements.reminderClaimedAt, new Date(at.getTime() - 10 * 60 * 1000))
        )
      )
    )
    .orderBy(asc(directoryFeaturedEntitlements.endsAt))
    .limit(20)

  for (const candidate of candidates) {
    const threshold = reminderDue(daysUntil(candidate.endsAt, at), candidate.lastSent)
    if (threshold === null) continue
    const [claimed] = await database
      .update(directoryFeaturedEntitlements)
      .set({ reminderClaimedAt: at })
      .where(
        and(
          eq(directoryFeaturedEntitlements.id, candidate.id),
          eq(directoryFeaturedEntitlements.status, "active"),
          or(
            isNull(directoryFeaturedEntitlements.reminderClaimedAt),
            lt(directoryFeaturedEntitlements.reminderClaimedAt, new Date(at.getTime() - 10 * 60 * 1000))
          )
        )
      )
      .returning({ id: directoryFeaturedEntitlements.id })
    if (!claimed) continue

    try {
      await sendDirectoryEmail({
        workspaceId: candidate.workspaceId,
        to: candidate.email,
        subject: `${candidate.title}'s featured placement ends soon`,
        lines: [
          `${candidate.title}'s featured placement ends in ${threshold === 1 ? "about one day" : `about ${threshold} days`}.`,
          "Open My listings if you would like to feature it again after it ends.",
        ],
      }, database)
      await database
        .update(directoryFeaturedEntitlements)
        .set({ reminderThresholdDays: threshold, reminderClaimedAt: null, updatedAt: now() })
        .where(eq(directoryFeaturedEntitlements.id, candidate.id))
    } catch {
      await database
        .update(directoryFeaturedEntitlements)
        .set({ reminderClaimedAt: null })
        .where(eq(directoryFeaturedEntitlements.id, candidate.id))
    }
  }
}
