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

export function formatDate(value: string | Date | null) {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date)
}

/** Same date, plus the clock time — for logs where the order of events matters. */
export function formatDateTime(value: string | Date | null) {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}
