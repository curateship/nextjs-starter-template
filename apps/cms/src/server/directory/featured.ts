import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm"
import type Stripe from "stripe"

import { daysUntil, reminderDue } from "@/lib/directory/featured"
import { appUrlFor } from "@/server/app-url"
import { now, uuid } from "@/server/auth/security"
import { stripe } from "@/server/billing/stripe"
import { db, type CustomShellDb } from "@/server/db"
import { sendDirectoryEmail } from "@/server/directory/mail"
import {
  directoryClaims,
  directoryFeaturedCheckouts,
  directoryFeaturedEntitlements,
  directoryFeaturedPlans,
  directoryListings,
} from "@/server/directory/schema"
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

function featuredCheckoutMetadata(reservation: FeaturedCheckoutReservation) {
  return {
    kind: FEATURED_METADATA_KIND,
    workspaceId: reservation.workspaceId,
    listingId: reservation.listingId,
    claimId: reservation.claimId,
    planId: reservation.planId,
    userId: reservation.buyerUserId,
    priceCents: String(reservation.priceCents),
    currency: reservation.currency,
    durationDays: String(reservation.durationDays),
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

export type FeaturedPlan = {
  id: string
  name: string
  description: string
  priceCents: number
  currency: string
  durationDays: number
  priority: number
  active: boolean
}

export type FeaturedEntitlement = {
  id: string
  listingId: string
  listingTitle: string
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
  options: { activeOnly?: boolean } = {},
  database: CustomShellDb = db
) {
  const rows = await database
    .select()
    .from(directoryFeaturedPlans)
    .where(
      options.activeOnly
        ? and(
            eq(directoryFeaturedPlans.workspaceId, workspaceId),
            eq(directoryFeaturedPlans.active, true)
          )
        : eq(directoryFeaturedPlans.workspaceId, workspaceId)
    )
    .orderBy(desc(directoryFeaturedPlans.active), desc(directoryFeaturedPlans.priority), asc(directoryFeaturedPlans.name))
  return rows.map(planFrom)
}

export async function saveFeaturedPlan(
  workspaceId: string,
  input: {
    id?: string
    name: string
    description?: string
    priceCents: number
    currency: string
    durationDays: number
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
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 3650) {
    throw new Error("The period must be between 1 and 3650 days.")
  }
  const at = now()
  const values = {
    name,
    description: (input.description ?? "").trim().slice(0, 500),
    priceCents: input.priceCents,
    currency,
    durationDays: input.durationDays,
    priority: Math.max(-10_000, Math.min(10_000, Math.trunc(input.priority ?? 0))),
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
    .values({ id: uuid(), workspaceId, ...values, createdAt: at })
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

export async function featuredAdminOverview(
  workspaceId: string,
  database: CustomShellDb = db
) {
  const [plans, rows, revenueRows] = await Promise.all([
    listFeaturedPlans(workspaceId, {}, database),
    database
      .select({
        id: directoryFeaturedEntitlements.id,
        listingId: directoryFeaturedEntitlements.listingId,
        listingTitle: directoryListings.title,
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
      .innerJoin(directoryListings, eq(directoryListings.id, directoryFeaturedEntitlements.listingId))
      .innerJoin(customShellUsers, eq(customShellUsers.id, directoryFeaturedEntitlements.buyerUserId))
      .innerJoin(directoryFeaturedPlans, eq(directoryFeaturedPlans.id, directoryFeaturedEntitlements.planId))
      .where(eq(directoryFeaturedEntitlements.workspaceId, workspaceId))
      .orderBy(desc(directoryFeaturedEntitlements.createdAt))
      .limit(100),
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
  return { plans, entitlements: rows as FeaturedEntitlement[], revenue: revenueRows }
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
    listFeaturedPlans(owned.workspaceId, { activeOnly: true }, database),
    activeFeaturedForListings(owned.workspaceId, [listingId], database),
  ])
  return { plans, active: active.has(listingId) }
}

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

  const checkoutClient = stripeCheckout ?? (await featuredCheckoutStripe())
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pendingWhere = and(
      eq(directoryFeaturedCheckouts.workspaceId, owned.workspaceId),
      eq(directoryFeaturedCheckouts.listingId, input.listingId)
    )
    let [reservation] = await database
      .select()
      .from(directoryFeaturedCheckouts)
      .where(pendingWhere)
      .limit(1)

    if (!reservation) {
      const [plan] = await database
        .select()
        .from(directoryFeaturedPlans)
        .where(
          and(
            eq(directoryFeaturedPlans.id, input.planId),
            eq(directoryFeaturedPlans.workspaceId, owned.workspaceId),
            eq(directoryFeaturedPlans.active, true)
          )
        )
        .limit(1)
      if (!plan) throw new Error("That featured plan is not available for this listing.")

      const at = now()
      const [created] = await database
        .insert(directoryFeaturedCheckouts)
        .values({
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
          successUrl: appUrlFor("/my-listings?featured_session={CHECKOUT_SESSION_ID}"),
          cancelUrl: appUrlFor("/my-listings?featured_checkout=cancelled"),
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoNothing()
        .returning()
      reservation = created
      if (!reservation) {
        const [concurrent] = await database
          .select()
          .from(directoryFeaturedCheckouts)
          .where(pendingWhere)
          .limit(1)
        reservation = concurrent
      }
    }
    if (!reservation || reservation.buyerUserId !== user.id) {
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
      await activateFeaturedSession(user.id, session, database)
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

export type CompletedFeaturedSession = Pick<
  Stripe.Checkout.Session,
  "id" | "metadata" | "payment_status" | "payment_intent" | "amount_total" | "currency"
>

export async function activateFeaturedSession(
  userId: string,
  session: CompletedFeaturedSession,
  database: CustomShellDb = db
) {
  if (session.payment_status !== "paid") throw new Error("The payment is not complete yet.")
  const metadata = session.metadata
  if (metadata?.kind !== FEATURED_METADATA_KIND || metadata.userId !== userId) {
    throw new Error("That checkout does not belong to this account.")
  }
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null

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
        eq(directoryFeaturedPlans.workspaceId, directoryClaims.workspaceId)
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
  // New checkouts carry the server-chosen terms in Stripe's signed session so
  // a later admin edit cannot strand a payment before the buyer returns. Older
  // sessions fall back to the current plan terms.
  const snapshotPrice = Number(metadata.priceCents)
  const snapshotDays = Number(metadata.durationDays)
  const hasSnapshot =
    Number.isInteger(snapshotPrice) &&
    snapshotPrice > 0 &&
    Number.isInteger(snapshotDays) &&
    snapshotDays >= 1 &&
    snapshotDays <= 3650 &&
    /^[a-z]{3}$/.test(metadata.currency ?? "")
  const paidPrice = hasSnapshot ? snapshotPrice : valid.priceCents
  const paidCurrency = hasSnapshot ? metadata.currency! : valid.currency
  const paidDays = hasSnapshot ? snapshotDays : valid.durationDays
  const amountTotal = session.amount_total
  const currency = session.currency
  if (amountTotal !== paidPrice || currency !== paidCurrency) {
    throw new Error("The completed payment does not match the selected plan.")
  }

  return database.transaction(async (tx) => {
    const at = now()
    await tx
      .insert(directoryFeaturedEntitlements)
      .values({
        id: uuid(),
        workspaceId: valid.workspaceId,
        listingId: metadata.listingId!,
        claimId: metadata.claimId!,
        buyerUserId: userId,
        planId: metadata.planId!,
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        amountTotal,
        currency,
        status: "active",
        startsAt: at,
        endsAt: new Date(at.getTime() + paidDays * DAY_MS),
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
  const reservations = await database
    .select()
    .from(directoryFeaturedCheckouts)
    .where(
      and(
        eq(directoryFeaturedCheckouts.workspaceId, workspaceId),
        inArray(directoryFeaturedCheckouts.listingId, listingIds)
      )
    )
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

  if (completed) {
    throw new Error(
      "A featured payment completed while deleting. Review the updated warning before trying again."
    )
  }
  if (open) {
    throw new Error(
      "A featured checkout is still open. Try deleting again after it finishes or expires."
    )
  }
}

/** Claims due reminders before sending, so overlapping ticker passes cannot send twice. */
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
