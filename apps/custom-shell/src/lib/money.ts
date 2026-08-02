/** Formats Stripe's integer cents as money, dropping ".00" for whole amounts. */
export function formatMoney(cents: number, currency = "usd") {
  const amount = cents / 100
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * A plan price cell. Zero means two different things: a plan with no price at
 * all is genuinely free (the default plan is required to be — see
 * `validatePlanInput`), while a zero beside a real price means that billing
 * period simply is not sold, which the editor's own help text spells out.
 * Printing "$0" for the second case reads as "free if you pay yearly".
 */
export function formatPlanPrice(
  cents: number,
  otherCents: number,
  currency = "usd"
) {
  if (cents > 0) return formatMoney(cents, currency)
  return otherCents > 0 ? "—" : "Free"
}
