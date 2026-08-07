import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"

import {
  billingEnabled,
  createCheckoutSession,
  createPortalSession,
  findExpiringCard,
  listCustomerInvoices,
  requireBilling,
  setSubscriptionPaused,
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
  /** True while billing is on hold and the account is back on the free plan. */
  paused: boolean
  /** The plan waiting behind that pause, so the page can name it. */
  pausedPlanName: string | null
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

const billingErrorMessages = {
  BILLING_DISABLED: "Payments are turned off right now.",
  BILLING_NOT_CONFIGURED: "Payments are not configured yet.",
  PLAN_NOT_FOUND: "That plan is no longer available.",
  PLAN_NOT_PURCHASABLE: "That plan cannot be bought right now.",
  PLAN_PRICE_MISSING: "That billing period is not available for this plan.",
  CHECKOUT_FAILED: "Stripe could not start the checkout. Please try again.",
  SUBSCRIPTION_NOT_FOUND: "There is no subscription to manage yet.",
  ALREADY_PAUSED: "Your plan is already paused.",
  NOT_PAUSED: "Your plan is not paused.",
  CANNOT_PAUSE_GRANT:
    "This plan was granted by an admin and is not billed, so there is nothing to pause.",
  CANNOT_PAUSE_TRIAL:
    "You are on a free trial, so nothing is being billed yet. There is nothing to pause.",
  ALREADY_ENDING:
    "Your plan is already set to end when the period you paid for runs out.",
  AUTH_REQUIRED: "Please sign in again.",
  RATE_LIMITED:
    "Too many checkout attempts. Please wait a few minutes and try again.",
}

/**
 * Built with the shared helper rather than by hand, so it takes a bare code as
 * readily as a thrown error — which is what lets a screen work out a refusal
 * itself and still say it in exactly the words the server would have used.
 */
export const getBillingErrorMessage = createErrorMessage(
  billingErrorMessages,
  "We could not complete that request. Please try again."
)

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
    paused: entitlements.paused,
    pausedPlanName: entitlements.pausedPlanName,
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
 * Putting your own plan on hold, and taking it off hold again.
 *
 * One door for both directions, and the caller says which — so there is no way
 * to reach one of them without the other's rules having been checked. The
 * account is always the signed-in one; nothing about whose plan it is comes
 * from the browser.
 */
const setOwnPauseFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ paused: z.boolean() }))
  .handler(async ({ data, context }) => {
    requireBilling()
    return setSubscriptionPaused(context.user.id, data.paused, "member")
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

export function setOwnPlanPaused(paused: boolean) {
  return setOwnPauseFn({ data: { paused } })
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
