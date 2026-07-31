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

const RELATIVE_TIME = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })

const RELATIVE_UNITS: [unit: Intl.RelativeTimeFormatUnit, ms: number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
]

/**
 * "3 minutes ago", "yesterday" — for a time whose whole meaning is how long ago
 * it was, such as when a signed-in device was last used. Pair it with the exact
 * date in a `title` where the precise moment still matters.
 */
export function formatTimeAgo(value: string | Date | null) {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  const elapsed = Date.now() - date.getTime()

  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (elapsed >= unitMs) {
      return RELATIVE_TIME.format(-Math.floor(elapsed / unitMs), unit)
    }
  }

  // Under a minute, and anything dated slightly ahead of this clock.
  return "Just now"
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
