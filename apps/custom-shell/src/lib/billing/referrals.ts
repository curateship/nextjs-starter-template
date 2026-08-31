export const REFERRAL_CODE_LENGTH = 32

export type ReferralStatus = "invited" | "joined" | "converted"
export type ReferralRewardStatus =
  "not_earned" | "pending" | "granted" | "revoked"

/** A referral code is the lowercase, dash-free UUID Postgres creates. */
export function readReferralCode(value: unknown) {
  if (typeof value !== "string") return undefined
  const code = value.trim().toLowerCase()
  return new RegExp(`^[a-f0-9]{${REFERRAL_CODE_LENGTH}}$`).test(code)
    ? code
    : undefined
}

export function referralStatus(value: string): ReferralStatus {
  if (value === "invited" || value === "joined" || value === "converted") {
    return value
  }
  throw new Error("INVALID_REFERRAL_STATUS")
}

export function referralRewardStatus(value: string): ReferralRewardStatus {
  if (
    value === "not_earned" ||
    value === "pending" ||
    value === "granted" ||
    value === "revoked"
  ) {
    return value
  }
  throw new Error("INVALID_REFERRAL_REWARD_STATUS")
}

/** One month of a monthly plan, or one twelfth of an annual plan. */
export function freeMonthCreditCents(plan: {
  interval: string
  priceMonthlyCents: number
  priceYearlyCents: number
}) {
  if (plan.interval !== "monthly" && plan.interval !== "yearly") return null
  const cents =
    plan.interval === "yearly"
      ? Math.round(plan.priceYearlyCents / 12)
      : plan.priceMonthlyCents
  return cents > 0 ? cents : null
}
