export type BillingInterval = "monthly" | "yearly"

export type PricingChoice = {
  plan?: string
  interval?: BillingInterval
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
