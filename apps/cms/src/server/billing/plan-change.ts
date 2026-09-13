import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import Stripe from "stripe"
import { eq } from "drizzle-orm"
import { z } from "zod"

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
  return { plan, price, subscription, item }
}

async function previewInvoice(
  prepared: Awaited<ReturnType<typeof prepareChange>>,
  date: number,
  api: PlanChangeApi
) {
  const { subscription, item, price } = prepared
  const invoice = await api.preview({
    subscription: subscription.id,
    subscription_details: {
      items: [{ id: item.id, price: price.id, quantity: item.quantity ?? 1 }],
      proration_behavior: "create_prorations",
      proration_date: date,
    },
  })
  // A partial line list cannot support an honest proration amount.
  if (invoice.lines.has_more) throw new Error("PLAN_CHANGE_UNSUPPORTED")
  const prorationAmount = invoice.lines.data
    .filter((line) => line.parent?.subscription_item_details?.proration)
    .reduce((sum, line) => sum + line.amount, 0)
  return {
    prorationAmount,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
    fingerprint: hash({
      total: invoice.total,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      lines: invoice.lines.data.map((line) => line.amount),
    }),
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
    billsNow:
      subscription.status !== "trialing" &&
      (item.price.unit_amount === 0 ||
        item.price.recurring?.interval !== price.recurring?.interval ||
        item.price.recurring?.interval_count !==
          price.recurring?.interval_count),
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
    currentTime - quote.date > 300
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
    if (invoice.fingerprint !== quote.invoiceFingerprint)
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
          proration_behavior: "create_prorations",
          proration_date: quote.date,
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
