import Stripe from "stripe"
import { and, eq, inArray, isNull } from "drizzle-orm"

import {
  billingMomentNode,
  isBillingMoment,
} from "@/lib/automations/nodes/billing-moment"
import { formatMoney } from "@/lib/format/money"
import { appUrlFor } from "@/server/app-url"
import {
  automationSubjectLabel,
  fireAutomationTrigger,
  type AutomationTriggerEvent,
} from "@/server/automations/triggers"
import { db, type CustomShellDb } from "@/server/db"
import { findSubscription, subscriptionIsActive } from "@/server/billing/entitlements"
import {
  findPlanByStripePrice,
  getPlan,
  isPaidPlan,
  planIntervalForPrice,
  stripePriceIdFor,
} from "@/server/billing/plans"
import {
  customShellBillingEvents,
  customShellSubscriptions,
  customShellUsers,
  type CustomShellPlan,
  type CustomShellSubscription,
  type CustomShellUser,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"
import { getActiveStripeConfig } from "@/server/billing/settings"
import {
  deriveSubscriptionEvent,
  recordSubscriptionEvent,
  snapshotOf,
} from "@/server/billing/subscription-events"

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
])

let stripeClient: Stripe | null = null
let stripeClientKey: string | null = null

export function billingEnabled() {
  return process.env.CUSTOM_SHELL_BILLING_ENABLED === "true"
}

/**
 * The Stripe client on whichever keys Settings → Payments says: the sandbox
 * set when its switch is on, otherwise the live set, with the old env vars
 * backing the live set. Cached per key so flipping the switch or saving a new
 * key takes effect on the next call without a restart.
 */
export async function stripe() {
  const { secretKey } = await getActiveStripeConfig()
  if (!secretKey) {
    throw new Error("BILLING_NOT_CONFIGURED")
  }

  if (!stripeClient || stripeClientKey !== secretKey) {
    stripeClient = new Stripe(secretKey)
    stripeClientKey = secretKey
  }
  return stripeClient
}

export function requireBilling() {
  if (!billingEnabled()) {
    throw new Error("BILLING_DISABLED")
  }
}

/**
 * Whether this plan's free trial applies to this person.
 *
 * One trial per account, not per plan: once someone has had a free trial on
 * anything, every later checkout bills them from day one. That is the simpler
 * rule and the harder one to play — otherwise a three-plan product is three
 * free trials, and cancelling and coming back is an endless one.
 */
export function trialDaysFor(
  user: Pick<CustomShellUser, "firstTrialAt">,
  plan: CustomShellPlan
) {
  return user.firstTrialAt ? 0 : plan.trialDays
}

/**
 * Starts a Checkout session for a plan.
 *
 * The price is read from the plan row, never from the browser, so a tampered
 * request cannot buy Pro at another plan's price. The trial is decided here for
 * the same reason: the browser only ever names a plan.
 */
export async function createCheckoutSession(
  user: Pick<CustomShellUser, "id" | "email" | "firstTrialAt">,
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
  const trialDays = trialDaysFor(user, plan)
  const session = await (await stripe()).checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: subscription?.stripeCustomerId || undefined,
    customer_email: subscription?.stripeCustomerId ? undefined : user.email,
    client_reference_id: user.id,
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: {
      metadata: { userId: user.id, planId: plan.id },
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
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

  const session = await (await stripe()).billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: appUrlFor("/?account=billing"),
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

  const invoices = await (await stripe()).invoices.list({
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

/**
 * A saved card that runs out before the plan renews.
 *
 * Only the four things a person needs to recognise their own card. Read fresh
 * from Stripe on every look and written down nowhere — this app stores no card
 * details, and an expiry date is a card detail.
 */
export type CardExpiryWarning = {
  brand: string
  last4: string
  /** 1-12, as Stripe gives it. */
  expMonth: number
  expYear: number
  /** True when the date has already passed, rather than merely being close. */
  expired: boolean
}

/** Reads the card a subscription renews on. Injectable so tests need no Stripe. */
type CardReader = (subscriptionId: string) => Promise<Stripe.Subscription>

const loadSubscriptionCard: CardReader = async (subscriptionId) =>
  (await stripe()).subscriptions.retrieve(subscriptionId, {
    // Both cards in one call: the subscription's own, and the customer's, which
    // is what Stripe falls back to.
    expand: [
      "default_payment_method",
      "customer.invoice_settings.default_payment_method",
    ],
  })

type SubscriptionForCard = Pick<
  CustomShellSubscription,
  | "source"
  | "status"
  | "stripeSubscriptionId"
  | "currentPeriodEnd"
  | "cancelAtPeriodEnd"
>

/**
 * The saved card that will not survive the next renewal, or null when there is
 * nothing worth saying.
 *
 * The point is to catch it before the payment fails rather than after, so this
 * compares the card's own last day against the renewal date.
 *
 * Silent in every case where a warning would be wrong: a plan already set to
 * end has no renewal to fail, a plan an admin granted is not charged to a card
 * at all, and a card that outlives the renewal is somebody else's problem next
 * cycle. Stripe refusing to answer is silent too — a warning that could not be
 * worked out is not worth taking the billing page down for.
 */
export async function findExpiringCard(
  subscription: SubscriptionForCard,
  timestamp = now(),
  read: CardReader = loadSubscriptionCard
): Promise<CardExpiryWarning | null> {
  const renewsOn = subscription.currentPeriodEnd
  if (
    subscription.source !== "stripe" ||
    !subscription.stripeSubscriptionId ||
    !renewsOn ||
    subscription.cancelAtPeriodEnd ||
    !subscriptionIsActive(subscription, timestamp)
  ) {
    return null
  }

  // Only the call out to Stripe is allowed to fail quietly. Wrapping the
  // reading below in this too would turn a bug of ours into a warning that
  // silently never appears.
  let fromStripe: Stripe.Subscription
  try {
    fromStripe = await read(subscription.stripeSubscriptionId)
  } catch (error) {
    console.error(
      "Card expiry check could not run",
      subscription.stripeSubscriptionId,
      error
    )
    return null
  }

  const card = renewalCard(fromStripe)
  if (!card) {
    return null
  }

  // A card works until the end of the month printed on it, so it is only a
  // problem when that moment lands before the renewal.
  const lastDay = endOfMonth(card.exp_year, card.exp_month)
  if (lastDay >= renewsOn) {
    return null
  }

  return {
    brand: card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
    expired: lastDay < timestamp,
  }
}

/**
 * The card Stripe will actually charge: the subscription's own when it has one,
 * otherwise the customer's default. Anything that is not a card — a bank debit,
 * a method Stripe adds later — has no expiry to warn about.
 */
function renewalCard(subscription: Stripe.Subscription) {
  const customer = subscription.customer
  const onCustomer =
    customer && typeof customer === "object" && !customer.deleted
      ? customer.invoice_settings?.default_payment_method
      : null

  const method = subscription.default_payment_method ?? onCustomer
  if (!method || typeof method !== "object" || method.type !== "card") {
    return null
  }

  return method.card ?? null
}

/** The last moment of a card's expiry month, which is when it stops working. */
function endOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1) - 1)
}

export type CancelSubscriptionMode = "period_end" | "immediate"

/** The two Stripe calls a cancel can make, injectable so tests need no Stripe. */
export type CancelApi = {
  cancelNow: (subscriptionId: string) => Promise<Stripe.Subscription>
  stopRenewal: (subscriptionId: string) => Promise<Stripe.Subscription>
}

const stripeCancelApi: CancelApi = {
  cancelNow: async (subscriptionId) =>
    (await stripe()).subscriptions.cancel(subscriptionId),
  stopRenewal: async (subscriptionId) =>
    (await stripe()).subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    }),
}

/**
 * Ends someone's paid plan on their behalf.
 *
 * "period_end" stops the renewal: they keep what they already paid for and are
 * not charged again. "immediate" ends it now. Neither refunds anything — money
 * already taken stays taken unless it is refunded separately in Stripe.
 *
 * A granted plan (`source: "manual"`) is not billed, so there is no period to
 * wait out: whichever mode was asked for, ending it takes it away now, with no
 * Stripe involved.
 */
export async function cancelSubscriptionByAdmin(
  userId: string,
  mode: CancelSubscriptionMode,
  database: CustomShellDb = db,
  api: CancelApi = stripeCancelApi
) {
  const subscription = await findSubscription(userId, database)
  if (!subscription || !subscriptionIsActive(subscription)) {
    throw new Error("SUBSCRIPTION_NOT_FOUND")
  }

  // The plan's name is read before anything is ended, because ending it is what
  // takes the name away — and the history has to say what was ended.
  const planName = subscription.planId
    ? ((await getPlan(subscription.planId, database))?.name ?? null)
    : null

  if (subscription.source === "manual") {
    await database
      .delete(customShellSubscriptions)
      .where(eq(customShellSubscriptions.id, subscription.id))

    await recordSubscriptionEvent(database, {
      userId,
      kind: "canceled",
      planName,
      source: "admin",
    })

    return { mode: "immediate" as const, endsAt: null }
  }

  if (!subscription.stripeSubscriptionId) {
    throw new Error("SUBSCRIPTION_NOT_FOUND")
  }
  if (mode === "period_end" && subscription.cancelAtPeriodEnd) {
    throw new Error("ALREADY_ENDING")
  }

  const result =
    mode === "immediate"
      ? await api.cancelNow(subscription.stripeSubscriptionId)
      : await api.stopRenewal(subscription.stripeSubscriptionId)

  // Mirror Stripe's answer locally right away. The webhook will repeat it
  // later, but the admin looking at the table should not have to wait for it.
  const endsAt = periodEnd(result)
  await database
    .update(customShellSubscriptions)
    .set({
      status: result.status,
      cancelAtPeriodEnd: result.cancel_at_period_end,
      currentPeriodEnd: endsAt,
      updatedAt: now(),
    })
    .where(eq(customShellSubscriptions.id, subscription.id))

  // Written here rather than left to the webhook, because the webhook will find
  // the row already saying what it came to say and so will record nothing — and
  // because it was an admin who did this, which only this side of it knows.
  await recordSubscriptionEvent(database, {
    userId,
    kind: mode === "immediate" ? "canceled" : "cancel_scheduled",
    planName,
    detail: mode === "period_end" ? (endsAt?.toISOString() ?? null) : null,
    source: "admin",
  })

  return {
    mode,
    endsAt: mode === "period_end" ? (endsAt?.toISOString() ?? null) : null,
  }
}

/**
 * Ends the paid plans of accounts that are about to be deleted.
 *
 * Cancel first, delete second, and that order is the whole point. A crash
 * between the two leaves an account with no plan, which costs nobody anything;
 * the other way round leaves Stripe taking money every month for an account
 * that no longer exists.
 *
 * So a cancel Stripe refuses stops the delete outright rather than deleting
 * anyway. Ending it now, not at the end of the period: the account is
 * unreachable from the moment it is deleted, and Stripe still counts a
 * cancel-at-period-end subscription as live.
 *
 * A batch with nothing live in it — free accounts, lapsed plans — costs one
 * query and never reaches Stripe, and neither does a plan an admin granted by
 * hand, which is not billed anywhere.
 */
export async function cancelSubscriptionsForDeletion(
  userIds: string[],
  database: CustomShellDb = db,
  api: CancelApi = stripeCancelApi
) {
  const subscriptions = await database
    .select()
    .from(customShellSubscriptions)
    .where(inArray(customShellSubscriptions.userId, userIds))

  for (const subscription of subscriptions) {
    if (!subscriptionIsActive(subscription)) {
      continue
    }

    try {
      await cancelSubscriptionByAdmin(
        subscription.userId,
        "immediate",
        database,
        api
      )
    } catch (error) {
      // One code for every way this can fail, because the caller only needs to
      // say the same thing either way: nothing was deleted.
      throw new Error("SUBSCRIPTION_CANCEL_FAILED", { cause: error })
    }
  }
}

type SubscriptionLoader = (subscriptionId: string) => Promise<Stripe.Subscription>

const loadStripeSubscription: SubscriptionLoader = async (subscriptionId) =>
  (await stripe()).subscriptions.retrieve(subscriptionId)

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
  // transaction holds locks only for the writes below.
  const values = subscription
    ? await buildSubscriptionValues(database, subscription)
    : null

  const failedInvoice =
    event.type === "invoice.payment_failed"
      ? await buildPaymentFailure(database, event.data.object as Stripe.Invoice)
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

      // The history entry rides in the same transaction as the change it
      // describes, so the two can never disagree. Null when this event only
      // repeated what we already knew — a renewal, a mirrored admin cancel —
      // and the timeline stays a list of events rather than of deliveries.
      if (values.event) {
        await recordSubscriptionEvent(
          tx,
          {
            userId: values.insert.userId,
            ...values.event,
            source: "stripe",
            stripeEventId: event.id,
          },
          values.insert.updatedAt
        )
      }

      // The free trial is used up the moment one actually starts, which is
      // here — Stripe confirming it — and not when the checkout button was
      // clicked, so a checkout somebody walked away from costs them nothing.
      //
      // `isNull` is the whole rule: only the first trial is ever written down,
      // so the repeat events that arrive all the way through a trial cannot
      // keep moving the date, and re-running an old event cannot either.
      if (values.trialStartedAt) {
        await tx
          .update(customShellUsers)
          .set({ firstTrialAt: values.trialStartedAt })
          .where(
            and(
              eq(customShellUsers.id, values.insert.userId),
              isNull(customShellUsers.firstTrialAt)
            )
          )
      }
    }

    // Started inside the same transaction as the event claim on purpose. A
    // webhook that falls over half way through must not leave a flow running
    // for something that was rolled back — and the claim being in here is what
    // makes a delivery that arrives twice start the flow once.
    if (failedInvoice) {
      await fireAutomationTrigger(
        billingMomentNode.kind,
        isBillingMoment("paymentFailed"),
        failedInvoice,
        tx
      )
    }

    return true
  })
}

/**
 * A bill Stripe could not collect, turned into the moment a flow starts from —
 * or null when there is no flow to start.
 *
 * Null in three cases, and each of them is a real one: an invoice for a
 * customer this app never created, an account that has since been suspended or
 * deleted, and a bill with no invoice id, which is nothing to key a run to.
 *
 * The facts are the ones a recovery email actually needs. No card details: the
 * app does not store those, and an invoice does not carry them.
 */
async function buildPaymentFailure(
  database: CustomShellDb,
  invoice: Stripe.Invoice
): Promise<AutomationTriggerEvent | null> {
  const customerId = idOf(invoice.customer)
  if (!invoice.id || !customerId) {
    return null
  }

  const [match] = await database
    .select({ user: customShellUsers, planId: customShellSubscriptions.planId })
    .from(customShellSubscriptions)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellSubscriptions.userId)
    )
    .where(
      and(
        eq(customShellSubscriptions.stripeCustomerId, customerId),
        eq(customShellUsers.status, "active")
      )
    )
    .limit(1)
  if (!match) {
    return null
  }

  const plan = match.planId ? await getPlan(match.planId, database) : null

  return {
    subjectUserId: match.user.id,
    subjectLabel: automationSubjectLabel(match.user),
    // The invoice, not the event: Stripe retries a bill it could not collect
    // and every retry is another event about the same bill. Keying to the
    // invoice is what stops one empty card becoming four apologetic emails.
    key: `paymentFailed:${invoice.id}`,
    facts: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amountDue: formatMoney(invoice.amount_due, invoice.currency),
      amountDueCents: invoice.amount_due,
      currency: invoice.currency,
      attemptCount: invoice.attempt_count,
      nextAttemptAt: invoice.next_payment_attempt
        ? new Date(invoice.next_payment_attempt * 1_000).toISOString()
        : null,
      invoiceUrl: invoice.hosted_invoice_url ?? null,
      planName: plan?.name ?? null,
    },
  }
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
 *
 * Also works out the one line of history this event is worth, by comparing what
 * Stripe now says against the row we already had — which is why the old row is
 * read here, before the caller overwrites it.
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
  const before = await namedSubscription(database, userId)

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
    event: deriveSubscriptionEvent(
      before,
      snapshotOf(update, plan?.name ?? null)
    ),
    // Stripe's own record of when the trial began, rather than the moment this
    // event happened to be delivered — a webhook that arrives late still marks
    // the right day.
    trialStartedAt: subscription.trial_start
      ? new Date(subscription.trial_start * 1_000)
      : null,
  }
}

/**
 * The subscription an account has right now, with its plan's name filled in —
 * the shape the history compares against. Null when there is nothing there yet.
 */
async function namedSubscription(database: CustomShellDb, userId: string) {
  const existing = await findSubscription(userId, database)
  if (!existing) {
    return null
  }

  const plan = existing.planId ? await getPlan(existing.planId, database) : null
  return snapshotOf(existing, plan?.name ?? null)
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
