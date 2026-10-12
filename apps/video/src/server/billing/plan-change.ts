import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import Stripe from "stripe"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { PLAN_PREVIEW_SECONDS } from "@/lib/billing/plan-change-window"
import { db, type CustomShellDb } from "@/server/db"
import { customShellSubscriptions } from "@/server/schema"
import { findSubscription } from "@/server/billing/entitlements"
import { getPlanBySlug, stripePriceIdFor } from "@/server/billing/plans"
import { getActiveStripeConfig } from "@/server/billing/settings"
import { requireBilling } from "@/server/billing/stripe"

type Choice = { planSlug: string; interval: "monthly" | "yearly" }

export type PlanChangePreview = Choice & {
  token: string
  planName: string
  currency: string
  recurringAmount: number
  prorationAmount: number
  amountDue: number
  billsNow: boolean
  trialEndsAt: string | null
}

type PlanChangeApi = {
  key: string
  retrieve: (id: string) => Promise<Stripe.Subscription>
  price: (id: string) => Promise<Stripe.Price>
  preview: (
    params: Stripe.InvoiceCreatePreviewParams
  ) => Promise<Stripe.Invoice>
  update: (
    id: string,
    params: Stripe.SubscriptionUpdateParams,
    options: Stripe.RequestOptions
  ) => Promise<Stripe.Subscription>
}

async function stripeApi(): Promise<PlanChangeApi> {
  const { secretKey } = await getActiveStripeConfig()
  if (!secretKey) throw new Error("BILLING_NOT_CONFIGURED")
  const client = new Stripe(secretKey)
  return {
    key: secretKey,
    retrieve: (id) =>
      client.subscriptions.retrieve(id, { expand: ["latest_invoice"] }),
    price: (id) => client.prices.retrieve(id),
    preview: (params) => client.invoices.createPreview(params),
    update: (id, params, options) =>
      client.subscriptions.update(id, params, options),
  }
}

const quoteSchema = z.object({
  userId: z.string(),
  planSlug: z.string(),
  interval: z.enum(["monthly", "yearly"]),
  subscriptionId: z.string(),
  priceId: z.string(),
  fingerprint: z.string(),
  invoiceFingerprint: z.string(),
  amountDue: z.number().int(),
  date: z.number().int(),
})

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function sign(payload: string, key: string) {
  return createHmac("sha256", key).update(`plan-change:${payload}`).digest()
}

function readQuote(token: string, key: string) {
  try {
    const parts = token.split(".")
    if (parts.length !== 2) throw new Error("Invalid signature")
    const [payload, signature] = parts
    const expected = sign(payload, key)
    const received = Buffer.from(signature, "base64url")
    if (
      signature !== received.toString("base64url") ||
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new Error("Invalid signature")
    }
    return quoteSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString())
    )
  } catch {
    throw new Error("PLAN_PREVIEW_EXPIRED")
  }
}

async function prepareChange(
  userId: string,
  choice: Choice,
  database: CustomShellDb,
  api: PlanChangeApi
) {
  const local = await findSubscription(userId, database)
  if (
    local?.source !== "stripe" ||
    !local.stripeSubscriptionId ||
    !local.stripeCustomerId
  ) {
    throw new Error("SUBSCRIPTION_NOT_FOUND")
  }
  const plan = await getPlanBySlug(choice.planSlug, database)
  if (!plan?.active || !plan.isPublic || plan.isDefault)
    throw new Error("PLAN_NOT_PURCHASABLE")
  const priceId = stripePriceIdFor(plan, choice.interval)
  if (!priceId) throw new Error("PLAN_PRICE_MISSING")
  const [subscription, price] = await Promise.all([
    api.retrieve(local.stripeSubscriptionId),
    api.price(priceId),
  ])
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id
  if (
    subscription.id !== local.stripeSubscriptionId ||
    customerId !== local.stripeCustomerId
  ) {
    throw new Error("SUBSCRIPTION_NOT_FOUND")
  }
  if (
    !["active", "trialing"].includes(subscription.status) ||
    subscription.pause_collection ||
    subscription.cancel_at_period_end ||
    subscription.cancel_at ||
    subscription.schedule ||
    subscription.pending_update
  ) {
    throw new Error("PLAN_CHANGE_UNAVAILABLE")
  }
  const invoice = subscription.latest_invoice
  if (typeof invoice === "string" || (invoice && invoice.status !== "paid")) {
    throw new Error("PLAN_CHANGE_UNPAID")
  }
  const item = subscription.items.data[0]
  if (
    subscription.items.has_more ||
    subscription.items.data.length !== 1 ||
    !item ||
    plan.usageMeter ||
    subscription.collection_method === "send_invoice" ||
    item.price.recurring?.usage_type !== "licensed" ||
    price.recurring?.usage_type !== "licensed" ||
    price.billing_scheme !== "per_unit" ||
    !price.active ||
    price.currency !== item.price.currency ||
    price.unit_amount == null ||
    price.unit_amount <= 0 ||
    price.recurring.interval_count !== 1 ||
    price.recurring.interval !==
      (choice.interval === "monthly" ? "month" : "year")
  ) {
    throw new Error("PLAN_CHANGE_UNSUPPORTED")
  }
  if (item.price.id === priceId) throw new Error("PLAN_ALREADY_CURRENT")
  return {
    plan,
    price,
    subscription,
    item,
    billsNow: billsNowFor(subscription, item, price),
  }
}

/**
 * Whether the switch is paid for today rather than folded into the next bill.
 *
 * Moving between periods, or off a free price, starts a new paid period from
 * today: Stripe resets the renewal date and invoices the new price less the
 * unused time at once. Keeping the renewal date instead would park that sum
 * as pending items and add it to the next renewal, which for a monthly to
 * yearly move is a year away, while the card had said "today". A trial keeps
 * its date and is not billed yet, so it is never "today".
 */
function billsNowFor(
  subscription: Stripe.Subscription,
  item: Stripe.SubscriptionItem,
  price: Stripe.Price
) {
  return (
    subscription.status !== "trialing" &&
    (item.price.unit_amount === 0 ||
      item.price.recurring?.interval !== price.recurring?.interval ||
      item.price.recurring?.interval_count !== price.recurring?.interval_count)
  )
}

/**
 * The same Stripe terms for the preview and the real change, written once.
 *
 * Stripe refuses a `proration_date` beside `billing_cycle_anchor: "now"`, so
 * a change billed today is worked out at the moment of each call instead of
 * being pinned to the preview's second. The drift that allows between the
 * preview and the confirm is handled by `driftAllowance`.
 */
function changeTerms(billsNow: boolean, date: number) {
  return billsNow
    ? {
        billing_cycle_anchor: "now" as const,
        proration_behavior: "always_invoice" as const,
      }
    : { proration_behavior: "create_prorations" as const, proration_date: date }
}

/**
 * How many cents the unused-time credit can move between the preview and the
 * confirm: the whole of each proration line is spread over the current period,
 * and the quote lives `PLAN_PREVIEW_SECONDS`. Zero when the preview was pinned
 * to a date, because then the two invoices are the same to the cent.
 */
function driftAllowance(
  billsNow: boolean,
  item: Stripe.SubscriptionItem,
  prorationLines: number[]
) {
  if (!billsNow) return 0
  const period = item.current_period_end - item.current_period_start
  // A period that is not a positive span is not something to divide by. The
  // quote then has to match to the cent, which at worst means one retry.
  if (!(period > 0)) return 0
  const moving = prorationLines.reduce(
    (sum, amount) => sum + Math.abs(amount),
    0
  )
  return Math.ceil((moving * PLAN_PREVIEW_SECONDS) / period) + 1
}

async function previewInvoice(
  prepared: Awaited<ReturnType<typeof prepareChange>>,
  date: number,
  api: PlanChangeApi
) {
  const { subscription, item, price, billsNow } = prepared
  const invoice = await api.preview({
    subscription: subscription.id,
    subscription_details: {
      items: [{ id: item.id, price: price.id, quantity: item.quantity ?? 1 }],
      ...changeTerms(billsNow, date),
    },
  })
  // A partial line list cannot support an honest proration amount.
  if (invoice.lines.has_more) throw new Error("PLAN_CHANGE_UNSUPPORTED")
  const isProration = (line: Stripe.InvoiceLineItem) =>
    Boolean(line.parent?.subscription_item_details?.proration)
  const prorationLines = invoice.lines.data
    .filter(isProration)
    .map((line) => line.amount)
  const prorationAmount = prorationLines.reduce((sum, amount) => sum + amount, 0)
  return {
    prorationAmount,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
    // What has to be the same at confirm time. A change pinned to a date
    // must match to the cent; one billed today may only move by the unused
    // time that passed, so its moving lines stay out of the hash and are
    // checked against `driftAllowance` instead.
    fingerprint: hash({
      currency: invoice.currency,
      lineCount: invoice.lines.data.length,
      lines: invoice.lines.data
        .filter((line) => !billsNow || !isProration(line))
        .map((line) => line.amount),
      ...(billsNow
        ? {}
        : { total: invoice.total, amountDue: invoice.amount_due }),
    }),
    driftAllowance: driftAllowance(billsNow, item, prorationLines),
  }
}

export async function previewPlanChange(
  userId: string,
  choice: Choice,
  database: CustomShellDb = db,
  providedApi?: PlanChangeApi
): Promise<PlanChangePreview> {
  requireBilling()
  const api = providedApi ?? (await stripeApi())
  const prepared = await prepareChange(userId, choice, database, api)
  const date = Math.floor(Date.now() / 1000)
  const invoice = await previewInvoice(prepared, date, api)
  const { subscription, item, plan, price } = prepared
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      ...choice,
      subscriptionId: subscription.id,
      priceId: price.id,
      fingerprint: hash(subscription),
      invoiceFingerprint: invoice.fingerprint,
      amountDue: invoice.amountDue,
      date,
    })
  ).toString("base64url")
  return {
    ...choice,
    token: `${payload}.${sign(payload, api.key).toString("base64url")}`,
    planName: plan.name,
    currency: invoice.currency,
    recurringAmount: price.unit_amount! * (item.quantity ?? 1),
    prorationAmount: invoice.prorationAmount,
    amountDue: invoice.amountDue,
    billsNow: prepared.billsNow,
    trialEndsAt: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
  }
}

export async function changePlan(
  userId: string,
  token: string,
  database: CustomShellDb = db,
  providedApi?: PlanChangeApi
) {
  requireBilling()
  const api = providedApi ?? (await stripeApi())
  const quote = readQuote(token, api.key)
  const currentTime = Math.floor(Date.now() / 1000)
  if (
    quote.userId !== userId ||
    quote.date > currentTime ||
    currentTime - quote.date > PLAN_PREVIEW_SECONDS
  ) {
    throw new Error("PLAN_PREVIEW_EXPIRED")
  }
  // Serialize in-app confirmations across tabs and server instances. Stripe's
  // idempotency key also covers a retry after a lost response.
  return database.transaction(async (tx) => {
    await tx
      .select({ id: customShellSubscriptions.id })
      .from(customShellSubscriptions)
      .where(eq(customShellSubscriptions.userId, userId))
      .for("update")
    const prepared = await prepareChange(userId, quote, tx, api)
    if (
      prepared.subscription.id !== quote.subscriptionId ||
      prepared.price.id !== quote.priceId ||
      hash(prepared.subscription) !== quote.fingerprint
    )
      throw new Error("PLAN_PREVIEW_EXPIRED")
    const invoice = await previewInvoice(prepared, quote.date, api)
    if (
      invoice.fingerprint !== quote.invoiceFingerprint ||
      Math.abs(invoice.amountDue - quote.amountDue) > invoice.driftAllowance
    )
      throw new Error("PLAN_PREVIEW_EXPIRED")
    try {
      await api.update(
        quote.subscriptionId,
        {
          items: [
            {
              id: prepared.item.id,
              price: quote.priceId,
              quantity: prepared.item.quantity ?? 1,
            },
          ],
          ...changeTerms(prepared.billsNow, quote.date),
          payment_behavior: "error_if_incomplete",
        },
        { idempotencyKey: `plan-change:${hash(quote)}` }
      )
    } catch (error) {
      if (error instanceof Stripe.errors.StripeCardError)
        throw new Error("PLAN_CHANGE_PAYMENT_FAILED")
      throw new Error("PLAN_CHANGE_FAILED")
    }
    // Only the existing Stripe webhook writes the plan and entitlements.
    return { planSlug: quote.planSlug, interval: quote.interval }
  })
}
