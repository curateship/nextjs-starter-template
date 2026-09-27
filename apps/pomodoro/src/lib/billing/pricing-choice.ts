import { readReferralCode } from "@/lib/billing/referrals"

export type BillingInterval = "monthly" | "yearly"

export type PricingChoice = {
  plan?: string
  interval?: BillingInterval
}

export type RegistrationChoice = PricingChoice & {
  ref?: string
  invalidReferral?: true
  /** An address typed on a public page, carried over to save retyping it. */
  email?: string
}

export const MAX_CARRIED_EMAIL_LENGTH = 254

/**
 * The address as it will be dropped into the register form's email box. It is
 * checked for shape only, the way a browser checks an email input, because the
 * register form and the server both check it again before anything is made.
 */
export function readCarriedEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim() : ""
  return email.length > 0 &&
    email.length <= MAX_CARRIED_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : undefined
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
  const email = readCarriedEmail(search.email)
  return {
    ...pricing,
    ...(ref ? { ref } : {}),
    ...(email ? { email } : {}),
    ...(hasReferral && !ref ? { invalidReferral: true as const } : {}),
  }
}
