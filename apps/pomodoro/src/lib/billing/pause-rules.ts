/**
 * Why a plan cannot be put on hold, or null when it can.
 *
 * The answer is the server's own error code rather than a sentence, so each
 * screen runs it through the error messages it already has — the member's page
 * says "you", the back office says "they", and neither invents wording that
 * could drift from what the server says when the same request really is
 * refused.
 *
 * It exists so a Pause button is never simply missing. A button that vanishes
 * for a plan somebody is looking at leaves them with no way to find out why;
 * one that answers the click with the reason explains itself. The rules and
 * their order are the same as `setSubscriptionPaused`, which is what makes the
 * two agree.
 */
/**
 * What a paused plan's badge says: the plan that is waiting, and that it is
 * waiting. Four screens show this badge and every one of them phrased it
 * itself, which is three chances for "Pro paused" to become "Paused (Pro)"
 * somewhere and read as a different state.
 */
export function pausedPlanLabel(pausedPlanName: string | null) {
  return pausedPlanName ? `${pausedPlanName} paused` : "Paused"
}

export function pauseRefusalCode(plan: {
  isPaid: boolean
  source: "stripe" | "manual" | null
  status: string
  cancelAtPeriodEnd: boolean
  /**
   * Only the member's own page asks this. The back office is dealing with a
   * subscription Stripe really has, whether or not the storefront is open.
   */
  billingEnabled?: boolean
}) {
  if (plan.billingEnabled === false) {
    return "BILLING_DISABLED"
  }
  if (!plan.isPaid) {
    return "SUBSCRIPTION_NOT_FOUND"
  }
  if (plan.source === "manual") {
    return "CANNOT_PAUSE_GRANT"
  }
  if (plan.status === "trialing") {
    return "CANNOT_PAUSE_TRIAL"
  }
  if (plan.cancelAtPeriodEnd) {
    return "ALREADY_ENDING"
  }

  return null
}
