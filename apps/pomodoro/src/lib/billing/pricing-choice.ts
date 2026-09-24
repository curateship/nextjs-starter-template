import { readReferralCode } from "@/lib/billing/referrals"

export type BillingInterval = "monthly" | "yearly"

export type PricingChoice = {
  plan?: string
  interval?: BillingInterval
}

export type RegistrationChoice = PricingChoice & {
  ref?: string
  invalidReferral?: true
}

/** Keeps only plan choices the pricing and registration routes understand. */
export function readPricingChoice(
  search: Record<string, unknown>
): PricingChoice {
  const plan =
    typeof search.plan === "string" &&
    search.plan.length <= 50 &&
    /^[a-z0-9-]+$/.test(search.plan)
      ? search.plan
      : undefined
  const interval =
    search.interval === "monthly" || search.interval === "yearly"
      ? search.interval
      : undefined

  return { plan, interval }
}

/** Keeps plan choices plus the public code an invite link carries. */
export function readRegistrationChoice(
  search: Record<string, unknown>
): RegistrationChoice {
  const pricing = readPricingChoice(search)
  const ref = readReferralCode(search.ref) ?? undefined
  const hasReferral = Object.prototype.hasOwnProperty.call(search, "ref")
  return {
    ...pricing,
    ...(ref ? { ref } : {}),
    ...(hasReferral && !ref ? { invalidReferral: true as const } : {}),
  }
}
