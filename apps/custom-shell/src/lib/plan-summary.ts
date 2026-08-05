import { formatDate } from "@/lib/format-time"

/**
 * The fields the sentence below reads. Both the account window's full billing
 * overview and the member home page's smaller plan payload satisfy it.
 */
type PlanState = {
  isPaid: boolean
  source: "stripe" | "manual" | null
  status: string
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
}

/**
 * The one-line answer to "where does my plan stand?" — the free plan, a trial,
 * a renewal date, a plan that is running out, or a payment that failed.
 *
 * Two screens say it now: the account window's Billing tab and the member home
 * page's plan card. It lives here so they cannot drift into telling the same
 * person two different things.
 */
export function planSummary(plan: PlanState) {
  if (!plan.isPaid) {
    return "You are on the free plan. Upgrade any time."
  }
  if (plan.source === "manual") {
    return plan.currentPeriodEnd
      ? `An admin granted this plan until ${formatDate(plan.currentPeriodEnd)}.`
      : "An admin granted this plan. There is nothing to pay."
  }
  if (plan.status === "trialing" && plan.trialEndsAt) {
    return `Your trial runs until ${formatDate(plan.trialEndsAt)}.`
  }
  if (plan.cancelAtPeriodEnd && plan.currentPeriodEnd) {
    return `Your plan ends on ${formatDate(plan.currentPeriodEnd)}. You keep everything until then.`
  }
  if (plan.status === "past_due") {
    return "Your last payment failed. Update your card in Stripe to keep your plan."
  }
  if (plan.currentPeriodEnd) {
    return `Renews on ${formatDate(plan.currentPeriodEnd)}.`
  }

  return "Your plan is active."
}
