import { loadAccountStorage } from "@/server/media/library"
import { billingEnabled, stripe } from "@/server/billing/stripe"
import { loadPlanStanding } from "@/server/pomodoro/entitlements"
import {
  creditsLeft,
  creditsReturnDay,
  generationMonth,
  monthlyLimitFor,
  packCreditsLeft,
} from "@/server/pomodoro/generation"
import type { GenerationKind } from "@/lib/pomodoro/generation"

/**
 * Settings → Plan in one read (payments task 04). See
 * `workspace/docs/plan-tab.md`.
 *
 * The plan comes from `loadPlanStanding`, the one place that reads plan rows.
 * The next payment is Stripe's own preview of the next bill, never the plan's
 * price, so a discount, a proration or tax is already in it.
 */

/** What Stripe will charge next, read from Stripe. Injectable for tests. */
export type NextPaymentPreview = (subscription: {
  stripeCustomerId: string
  stripeSubscriptionId: string
}) => Promise<{ amountCents: number; currency: string }>

const previewFromStripe: NextPaymentPreview = async (subscription) => {
  const preview = await (await stripe()).invoices.createPreview({
    customer: subscription.stripeCustomerId,
    subscription: subscription.stripeSubscriptionId,
  })
  return { amountCents: preview.amount_due, currency: preview.currency }
}

/** Statuses Stripe will charge again on the date we hold. */
const RENEWING = new Set(["active", "trialing"])

export type PlanTab = Awaited<ReturnType<typeof loadPlanTab>>

export async function loadPlanTab(
  userId: string,
  previewNextPayment: NextPaymentPreview = previewFromStripe
) {
  const { entitlements, subscription, admin, space, perks } =
    await loadPlanStanding(userId)

  const kind = entitlements.paused
    ? ("paused" as const)
    : entitlements.isPaid
      ? ("pro" as const)
      : admin
        ? ("admin" as const)
        : ("free" as const)
  const fromStripe = kind === "pro" && entitlements.source === "stripe"
  const billing = billingEnabled()

  // Stripe is asked only when there is a charge coming. A failed ask leaves
  // the rest of the tab standing and says so, rather than taking it down.
  let nextPayment: { amountCents: number; currency: string; on: string } | null =
    null
  let nextPaymentUnknown = false
  const renewsOn =
    entitlements.status === "trialing"
      ? entitlements.trialEndsAt
      : entitlements.currentPeriodEnd
  if (
    fromStripe &&
    billing &&
    RENEWING.has(entitlements.status) &&
    !entitlements.cancelAtPeriodEnd &&
    renewsOn &&
    subscription?.stripeCustomerId &&
    subscription.stripeSubscriptionId
  ) {
    try {
      nextPayment = {
        ...(await previewNextPayment({
          stripeCustomerId: subscription.stripeCustomerId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        })),
        on: renewsOn.toISOString(),
      }
    } catch (error) {
      console.error("[plan-tab] Stripe preview failed", error)
      nextPaymentUnknown = true
    }
  }

  const paidPerks = kind === "pro" || kind === "admin"
  const month = generationMonth()
  const allowance = async (generation: GenerationKind) => {
    const limit = monthlyLimitFor(perks, generation)
    const [left, packLeft] = await Promise.all([
      creditsLeft(userId, generation, limit, month),
      packCreditsLeft(userId, generation),
    ])
    return { limit, left, packLeft }
  }
  const [backgrounds, soundscapes, storage] = paidPerks
    ? await Promise.all([
        allowance("background"),
        allowance("soundscape"),
        loadAccountStorage(userId),
      ])
    : [null, null, null]

  return {
    kind,
    planName:
      kind === "paused"
        ? (entitlements.pausedPlanName ?? entitlements.planName)
        : entitlements.planName,
    interval: entitlements.interval,
    /** A plan an admin granted by hand: nothing is billed. */
    granted: kind === "pro" && entitlements.source === "manual",
    periodEnd: entitlements.currentPeriodEnd?.toISOString() ?? null,
    endsAt:
      fromStripe && entitlements.cancelAtPeriodEnd
        ? (entitlements.currentPeriodEnd?.toISOString() ?? null)
        : null,
    trialEndsAt:
      fromStripe && entitlements.status === "trialing"
        ? (entitlements.trialEndsAt?.toISOString() ?? null)
        : null,
    cardDeclined: fromStripe && entitlements.status === "past_due",
    nextPayment,
    nextPaymentUnknown,
    /** Stripe's billing page opens only with payments on and a customer. */
    canManageBilling: billing && Boolean(subscription?.stripeCustomerId),
    credits:
      backgrounds && soundscapes
        ? { backgrounds, soundscapes, returnDay: creditsReturnDay(month) }
        : null,
    space: storage
      ? {
          usedBytes: storage.bytes,
          limitBytes: perks.storageLimitBytes,
          boughtUntil: space.endsAt?.toISOString() ?? null,
        }
      : null,
  }
}
