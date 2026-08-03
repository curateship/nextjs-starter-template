import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  billingEnabled,
  createCheckoutSession,
  createPortalSession,
  listCustomerInvoices,
  type BillingInvoice,
} from "@/server/billing"
import { loadEntitlements } from "@/server/entitlements"
import { getPlanBySlug, listPurchasablePlans } from "@/server/plans"
import { enforceRateLimit } from "@/server/rate-limit"
import type { PlanFeatures } from "@/lib/plan-features"
import { userGet, userPost } from "@/server/guards"

export type PlanOption = {
  id: string
  slug: string
  name: string
  description: string
  priceMonthlyCents: number
  priceYearlyCents: number
  currency: string
  trialDays: number
  features: PlanFeatures
  isDefault: boolean
  canCheckoutMonthly: boolean
  canCheckoutYearly: boolean
}

export type BillingOverview = {
  billingEnabled: boolean
  planSlug: string
  planName: string
  isPaid: boolean
  status: string
  interval: "monthly" | "yearly" | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  trialEndsAt: string | null
  source: "stripe" | "manual" | null
  hasStripeCustomer: boolean
  features: PlanFeatures
  plans: PlanOption[]
}

const billingErrorMessages: Record<string, string> = {
  BILLING_DISABLED: "Payments are turned off right now.",
  BILLING_NOT_CONFIGURED: "Payments are not configured yet.",
  PLAN_NOT_FOUND: "That plan is no longer available.",
  PLAN_NOT_PURCHASABLE: "That plan cannot be bought right now.",
  PLAN_PRICE_MISSING: "That billing period is not available for this plan.",
  CHECKOUT_FAILED: "Stripe could not start the checkout. Please try again.",
  SUBSCRIPTION_NOT_FOUND: "There is no subscription to manage yet.",
  AUTH_REQUIRED: "Please sign in again.",
  RATE_LIMITED:
    "Too many checkout attempts. Please wait a few minutes and try again.",
}

export function getBillingErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(billingErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? billingErrorMessages[matched]
    : "We could not complete that request. Please try again."
}

async function buildBillingOverview(userId: string): Promise<BillingOverview> {
  const [{ subscription, entitlements }, plans] = await Promise.all([
    loadEntitlements(userId),
    listPurchasablePlans(),
  ])

  return {
    billingEnabled: billingEnabled(),
    planSlug: entitlements.planSlug,
    planName: entitlements.planName,
    isPaid: entitlements.isPaid,
    status: entitlements.status,
    interval: entitlements.interval,
    currentPeriodEnd: entitlements.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: entitlements.cancelAtPeriodEnd,
    trialEndsAt: entitlements.trialEndsAt?.toISOString() ?? null,
    source: entitlements.source,
    hasStripeCustomer: Boolean(subscription?.stripeCustomerId),
    features: entitlements.features,
    plans: plans.map(toPlanOption),
  }
}

const loadBillingOverviewFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<BillingOverview> => {
    return buildBillingOverview(context.user.id)
  })

/** The plan badge the shell chrome shows; filled in by the shell bootstrap. */
export type PlanSummary = {
  planSlug: string
  planName: string
  isPaid: boolean
}

/**
 * What the public pricing page can be told without a session.
 *
 * Whether payments are on comes with the plans rather than being guessed:
 * a signed-out visitor has no billing overview to read it from, and assuming
 * "on" is how they ended up looking at a grid of buttons that do nothing.
 */
type PublicPricing = {
  billingEnabled: boolean
  plans: PlanOption[]
}

const loadPublicPricingFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicPricing> => {
    const plans = await listPurchasablePlans()
    return { billingEnabled: billingEnabled(), plans: plans.map(toPlanOption) }
  }
)

const startCheckoutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      planSlug: z.string().trim().min(1).max(50),
      interval: z.enum(["monthly", "yearly"]),
    })
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`checkout-start:${context.user.id}`, {
      maxAttempts: 10,
      windowSeconds: 15 * 60,
    })

    // The browser picks a plan by slug; the price always comes from the row.
    const plan = await getPlanBySlug(data.planSlug)
    if (!plan) {
      throw new Error("PLAN_NOT_FOUND")
    }

    return createCheckoutSession(context.user, plan, data.interval)
  })

const openBillingPortalFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => {
    return createPortalSession(context.user.id)
  })

/** Billing page data in one request: the overview plus any Stripe invoices. */
const loadBillingPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(
    async ({
      context,
    }): Promise<{
      overview: BillingOverview
      invoices: BillingInvoice[]
    }> => {
      const overview = await buildBillingOverview(context.user.id)

      return {
        overview,
        // Invoices live in Stripe, so only ask when there is a customer.
        invoices: overview.hasStripeCustomer
          ? await listCustomerInvoices(context.user.id)
          : [],
      }
    }
  )

export function loadBillingOverview() {
  return loadBillingOverviewFn()
}

export function loadPublicPricing() {
  return loadPublicPricingFn()
}

export function openBillingPortal() {
  return openBillingPortalFn()
}

/**
 * Where clicking a plan card sends someone, and the one place that rule lives.
 *
 * Checkout starts a subscription. Someone who already has one must never be put
 * through it again — that leaves them paying for two at once. Stripe's own
 * portal is what moves an existing subscription to another plan or billing
 * period, so that is where they go until the in-app switch with proration
 * (`workspace/tasks/features/billing/in-app-plan-switch-proration.md`) exists.
 *
 * Both plan surfaces call this, so the label they show and the place the click
 * lands cannot drift apart.
 */
export function openPlanChange(
  hasSubscription: boolean,
  planSlug: string,
  interval: "monthly" | "yearly"
) {
  return hasSubscription
    ? openBillingPortalFn()
    : startCheckoutFn({ data: { planSlug, interval } })
}

export function loadBillingPage() {
  return loadBillingPageFn()
}

export type { BillingInvoice }

function toPlanOption(plan: {
  id: string
  slug: string
  name: string
  description: string
  priceMonthlyCents: number
  priceYearlyCents: number
  currency: string
  trialDays: number
  features: PlanFeatures
  isDefault: boolean
  stripePriceIdMonthly: string | null
  stripePriceIdYearly: string | null
}): PlanOption {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    priceMonthlyCents: plan.priceMonthlyCents,
    priceYearlyCents: plan.priceYearlyCents,
    currency: plan.currency,
    trialDays: plan.trialDays,
    features: plan.features ?? {},
    isDefault: plan.isDefault,
    canCheckoutMonthly:
      plan.priceMonthlyCents > 0 && Boolean(plan.stripePriceIdMonthly),
    canCheckoutYearly:
      plan.priceYearlyCents > 0 && Boolean(plan.stripePriceIdYearly),
  }
}
