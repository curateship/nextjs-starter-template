import { CRM_MAX_VALUE_CENTS } from "@/lib/crm/crm"

/**
 * Dollars typed in a box, as whole cents.
 *
 * Null means "that is not a number", which is not the same as zero. A
 * half-typed "1." must not save as $0 the moment the box loses focus, so the
 * caller puts the saved value back instead.
 */
export function dollarsToCents(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "")
  if (!cleaned) return 0
  const amount = Number(cleaned)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.min(CRM_MAX_VALUE_CENTS, Math.round(amount * 100))
}

/** Cents as the dollars to show in the box. Nothing for zero, not "0". */
export function centsToDollars(cents: number): string {
  return cents === 0 ? "" : (cents / 100).toString()
}
