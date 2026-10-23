/**
 * The one set of rules for a deal's type and headline, used by the admin
 * window, the server and the public pages alike.
 *
 * The headline is the few words a card shows in big type. For money off and
 * percent off it is built from the number the admin types, so every "$5 off"
 * on the site reads the same way. For the other types the admin types it.
 * The site never works out what a visitor saves.
 */

/**
 * Every type a deal can have. Stored as these words, so one can be added but
 * never removed or renamed: old deals would stop reading.
 */
export const DEAL_TYPES = [
  "money_off",
  "percent_off",
  "two_for_one",
  "free_item",
  "other",
] as const

export type DealType = (typeof DEAL_TYPES)[number]

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  money_off: "Money off",
  percent_off: "Percent off",
  two_for_one: "2 for 1",
  free_item: "Free item",
  other: "Other",
}

/** Longest headline, matching the column. */
export const MAX_DEAL_HEADLINE = 24

/** What a deal made before types existed shows until somebody edits it. */
export const HEADLINE_FOR_OLD_DEALS = "Deal"

/** The largest money off, so the built headline always fits. */
const MAX_MONEY_OFF = 99_999.99

export function isDealType(value: unknown): value is DealType {
  return (DEAL_TYPES as readonly unknown[]).includes(value)
}

/** Whether the headline is built from a number rather than typed. */
export function headlineIsBuilt(type: DealType): boolean {
  return type === "money_off" || type === "percent_off"
}

/**
 * The number as the admin typed it, checked for its type, or a refusal the
 * admin can act on. Money off takes dollars and cents, like 5 or 5.50.
 * Percent off takes a whole number from 1 to 100.
 */
export function readDealAmount(
  type: "money_off" | "percent_off",
  typed: string
): number {
  const text = typed.trim().replace(/^\$/, "").replace(/%$/, "").trim()
  if (type === "percent_off") {
    const percent = Number(text)
    if (!/^\d+$/.test(text) || percent < 1 || percent > 100) {
      throw new Error("Type the percent off as a whole number from 1 to 100.")
    }
    return percent
  }
  const dollars = Number(text)
  if (
    !/^\d+(\.\d{1,2})?$/.test(text) ||
    dollars <= 0 ||
    dollars > MAX_MONEY_OFF
  ) {
    throw new Error("Type the money off in dollars, like 5 or 5.50.")
  }
  return dollars
}

const WHOLE_DOLLARS = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})
const DOLLARS_AND_CENTS = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "$5 off", "$5.50 off", "$1,000 off" or "20% off". */
export function builtHeadline(
  type: "money_off" | "percent_off",
  amount: number
): string {
  if (type === "percent_off") return `${amount}% off`
  const format = Number.isInteger(amount) ? WHOLE_DOLLARS : DOLLARS_AND_CENTS
  return `$${format.format(amount)} off`
}

/** What a card and a deal page show: the headline, or "Deal" for an old deal. */
export function shownHeadline(headline: string): string {
  return headline || HEADLINE_FOR_OLD_DEALS
}
