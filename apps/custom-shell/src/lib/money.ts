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
