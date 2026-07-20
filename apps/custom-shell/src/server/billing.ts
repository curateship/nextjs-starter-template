import Stripe from "stripe"
import { eq } from "drizzle-orm"

import { appUrlFor } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { findSubscription } from "@/server/entitlements"
import {
  findPlanByStripePrice,
  isPaidPlan,
  planIntervalForPrice,
  stripePriceIdFor,
} from "@/server/plans"
import {
  customShellBillingEvents,
  customShellSubscriptions,
  type CustomShellPlan,
  type CustomShellUser,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
])

let stripeClient: Stripe | null = null

export function billingEnabled() {
  return process.env.CUSTOM_SHELL_BILLING_ENABLED === "true"
}

export function stripe() {
  const key = process.env.CUSTOM_SHELL_STRIPE_SECRET_KEY
  if (!key) {
    throw new Error("BILLING_NOT_CONFIGURED")
  }

  stripeClient ??= new Stripe(key)
  return stripeClient
}

export function requireBilling() {
  if (!billingEnabled()) {
    throw new Error("BILLING_DISABLED")
  }
}

/**
 * Starts a Checkout session for a plan.
 *
 * The price is read from the plan row, never from the browser, so a tampered
 * request cannot buy Pro at another plan's price.
 */
export async function createCheckoutSession(
  user: Pick<CustomShellUser, "id" | "email">,
  plan: CustomShellPlan,
  interval: "monthly" | "yearly",
  database: CustomShellDb = db
) {
  requireBilling()

  if (!plan.active || !isPaidPlan(plan)) {
    throw new Error("PLAN_NOT_PURCHASABLE")
  }

  const price = stripePriceIdFor(plan, interval)
  if (!price) {
    throw new Error("PLAN_PRICE_MISSING")
  }

  const subscription = await findSubscription(user.id, database)
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: subscription?.stripeCustomerId || undefined,
    customer_email: subscription?.stripeCustomerId ? undefined : user.email,
    client_reference_id: user.id,
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: {
      metadata: { userId: user.id, planId: plan.id },
      ...(plan.trialDays > 0 ? { trial_period_days: plan.trialDays } : {}),
    },
    success_url: appUrlFor(
      "/account/billing/success?session_id={CHECKOUT_SESSION_ID}"
    ),
    cancel_url: appUrlFor("/pricing"),
  })

  if (!session.url) {
    throw new Error("CHECKOUT_FAILED")
  }

  return { url: session.url }
}

export async function createPortalSession(
  userId: string,
  database: CustomShellDb = db
) {
  requireBilling()

  const subscription = await findSubscription(userId, database)
  if (!subscription?.stripeCustomerId) {
    throw new Error("SUBSCRIPTION_NOT_FOUND")
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: appUrlFor("/account/billing"),
  })

  return { url: session.url }
}

export type BillingInvoice = {
  id: string
  number: string | null
  amountPaid: number
  currency: string
  status: string
  createdAt: string
  hostedInvoiceUrl: string | null
  invoicePdfUrl: string | null
}

export async function listCustomerInvoices(
  userId: string,
  database: CustomShellDb = db
): Promise<BillingInvoice[]> {
  const subscription = await findSubscription(userId, database)
  if (!billingEnabled() || !subscription?.stripeCustomerId) {
    return []
  }

  const invoices = await stripe().invoices.list({
    customer: subscription.stripeCustomerId,
    limit: 24,
  })

  return invoices.data.map((invoice) => ({
    id: invoice.id ?? "",
    number: invoice.number ?? null,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    status: invoice.status ?? "unknown",
    createdAt: new Date(invoice.created * 1_000).toISOString(),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdfUrl: invoice.invoice_pdf ?? null,
  }))
}

type SubscriptionLoader = (subscriptionId: string) => Promise<Stripe.Subscription>

const loadStripeSubscription: SubscriptionLoader = (subscriptionId) =>
  stripe().subscriptions.retrieve(subscriptionId)

/**
 * Applies one Stripe webhook event.
 *
 * Everything runs in a single transaction keyed by the Stripe event id, so a
 * replayed or duplicated delivery is recorded once and changes nothing.
 * Returns false when the event was already processed.
 */
export async function applyStripeEvent(
  event: Stripe.Event,
  database: CustomShellDb = db,
  fetchSubscription: SubscriptionLoader = loadStripeSubscription
) {
  const [seen] = await database
    .select({ eventId: customShellBillingEvents.eventId })
    .from(customShellBillingEvents)
    .where(eq(customShellBillingEvents.eventId, event.id))
    .limit(1)

  if (seen) {
    return false
  }

  const subscription = await resolveEventSubscription(event, fetchSubscription)
  // Read everything the write needs before opening the transaction, so the
  // transaction holds locks only for the two writes below.
  const values = subscription
    ? await buildSubscriptionValues(database, subscription)
    : null

  return database.transaction(async (tx) => {
    // Claiming the event id first makes a duplicate delivery a no-op even when
    // both copies arrive at the same moment: the loser's insert matches nothing.
    const [claimed] = await tx
      .insert(customShellBillingEvents)
      .values({ eventId: event.id, type: event.type, processedAt: now() })
      .onConflictDoNothing()
      .returning({ eventId: customShellBillingEvents.eventId })

    if (!claimed) {
      return false
    }

    if (values) {
      await tx
        .insert(customShellSubscriptions)
        .values(values.insert)
        .onConflictDoUpdate({
          target: customShellSubscriptions.userId,
          set: values.update,
        })
    }

    return true
  })
}

async function resolveEventSubscription(
  event: Stripe.Event,
  fetchSubscription: SubscriptionLoader
) {
  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    return event.data.object as Stripe.Subscription
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const subscriptionId = idOf(session.subscription)
    // Checkout alone does not carry the price or period, and the subscription
    // event may arrive after this one, so read the real subscription now.
    return subscriptionId ? await fetchSubscription(subscriptionId) : null
  }

  return null
}

/**
 * Turns a Stripe subscription into the row to write, or null when it cannot be
 * matched to an account (an event for a customer this app never created).
 */
async function buildSubscriptionValues(
  database: CustomShellDb,
  subscription: Stripe.Subscription
) {
  const customerId = idOf(subscription.customer)
  const userId = await resolveUserId(database, subscription, customerId)
  if (!userId || !customerId) {
    return null
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null
  const plan = priceId ? await findPlanByStripePrice(priceId, database) : null
  const interval =
    plan && priceId ? planIntervalForPrice(plan, priceId) : "monthly"
  const timestamp = now()

  const update = {
    planId: plan?.id ?? null,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    interval,
    source: "stripe" as const,
    currentPeriodEnd: periodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialEndsAt: subscription.trial_end
      ? new Date(subscription.trial_end * 1_000)
      : null,
    updatedAt: timestamp,
  }

  return {
    insert: { id: uuid(), userId, createdAt: timestamp, ...update },
    update,
  }
}

async function resolveUserId(
  database: CustomShellDb,
  subscription: Stripe.Subscription,
  customerId: string | null
) {
  const fromMetadata = subscription.metadata?.userId
  if (fromMetadata) {
    return fromMetadata
  }

  if (!customerId) {
    return null
  }

  const [existing] = await database
    .select({ userId: customShellSubscriptions.userId })
    .from(customShellSubscriptions)
    .where(eq(customShellSubscriptions.stripeCustomerId, customerId))
    .limit(1)

  return existing?.userId ?? null
}

// Stripe moved the period end onto subscription items; older payloads still
// carry it on the subscription itself.
function periodEnd(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0] as
    | { current_period_end?: number }
    | undefined
  const seconds =
    item?.current_period_end ??
    (subscription as unknown as { current_period_end?: number })
      .current_period_end

  return seconds ? new Date(seconds * 1_000) : null
}

function idOf(value: string | { id: string } | null | undefined) {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}
