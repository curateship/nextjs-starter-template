import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import {
  grantReferralReward as grantReferralRewardQuery,
  loadAdminReferrals as loadAdminReferralsQuery,
  type AdminReferralSummary,
} from "@/server/billing/referrals"
import { adminGet, adminPost } from "@/server/guards"

export type {
  AdminReferralItem,
  AdminReferralSummary,
} from "@/server/billing/referrals"

export const getReferralErrorMessage = createErrorMessage(
  {
    REFERRAL_NOT_FOUND: "That referral no longer exists.",
    REWARD_NOT_PENDING: "That reward is not waiting to be added.",
    REFERRER_NOT_BILLABLE:
      "The free month is still waiting because the referrer does not have an active paid Stripe plan.",
    BILLING_NOT_CONFIGURED:
      "Stripe is not configured, so the free month was not added.",
  },
  "We could not update that referral reward. Please try again."
)

const loadAdminReferralsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<AdminReferralSummary> => loadAdminReferralsQuery())

const grantReferralRewardFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ referralId: z.string().min(1).max(36) }))
  .handler(async ({ data }) => grantReferralRewardQuery(data.referralId))

export function loadAdminReferrals() {
  return loadAdminReferralsFn()
}

export function grantReferralReward(referralId: string) {
  return grantReferralRewardFn({ data: { referralId } })
}
