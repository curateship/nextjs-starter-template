import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  billingEnabled,
  createCheckoutSession,
  createPortalSession,
  findExpiringCard,
  listCustomerInvoices,
  type BillingInvoice,
  type CardExpiryWarning,
} from "@/server/billing/stripe"
import { loadEntitlements } from "@/server/billing/entitlements"
import { getPlanBySlug, listPurchasablePlans } from "@/server/billing/plans"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import type { CustomShellUser } from "@/server/schema"
import type { PlanFeatures } from "@/lib/billing/plan-features"
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
  /**
   * True once this account has had its one free trial. The plan cards read it
   * so a returning subscriber is told "billing starts today" on our own page,
   * rather than being promised a trial here and losing it on Stripe's.
   */
  trialUsed: boolean
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

/**
 * The overview, plus the subscription row it was built from — the billing page
 * needs that row to ask Stripe about the saved card, and reading it a second
 * time would be another round trip to the database for something already here.
 */
async function buildBillingOverview(
  user: Pick<CustomShellUser, "id" | "firstTrialAt">
) {
  const [{ subscription, entitlements }, plans] = await Promise.all([
    loadEntitlements(user.id),
    listPurchasablePlans(),
  ])

  const overview: BillingOverview = {
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
    trialUsed: Boolean(user.firstTrialAt),
    features: entitlements.features,
    plans: plans.map(toPlanOption),
  }

  return { overview, subscription }
}

const loadBillingOverviewFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<BillingOverview> => {
    return (await buildBillingOverview(context.user)).overview
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

/**
 * Billing page data in one request: the overview, any Stripe invoices, and a
 * warning when the saved card runs out before the next renewal.
 */
const loadBillingPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(
    async ({
      context,
    }): Promise<{
      overview: BillingOverview
      invoices: BillingInvoice[]
      cardWarning: CardExpiryWarning | null
    }> => {
      const { overview, subscription } = await buildBillingOverview(context.user)

      // Both of these are calls out to Stripe, so make them at the same time
      // rather than leaving the reader waiting through one and then the other.
      const [invoices, cardWarning] = await Promise.all([
        // Invoices live in Stripe, so only ask when there is a customer.
        overview.hasStripeCustomer
          ? listCustomerInvoices(context.user.id)
          : [],
        // With payments switched off there is no card to update and no portal
        // to send anyone to, so there is nothing useful to warn about.
        subscription && overview.billingEnabled
          ? findExpiringCard(subscription)
          : null,
      ])

      return { overview, invoices, cardWarning }
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

// Types only — a runtime value re-exported from @/server/* would drag the
// database driver into the browser bundle and kill hydration app-wide.
export type { BillingInvoice, CardExpiryWarning }

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
