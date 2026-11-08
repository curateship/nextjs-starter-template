import { z } from "zod"

/**
 * The one date range on the Admin dashboard's Overview (Today / 7 / 30 / 90 /
 * Year), which its figure blocks follow too. Traffic, AI usage and Metered
 * usage all count from the same moment, so two figures side by side always
 * cover the same days.
 *
 * Numbers, so the address reads `?range=7`. Only ever added to: an address
 * somebody saved has to keep working.
 */
export const ANALYTICS_RANGES = [1, 7, 30, 90, 365] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]

export const ANALYTICS_DEFAULT_RANGE: AnalyticsRange = 30

/** What each range is called wherever it is offered. One list, so they agree. */
export const ANALYTICS_RANGE_LABELS: Record<AnalyticsRange, string> = {
  1: "Today",
  7: "7 days",
  30: "30 days",
  90: "90 days",
  365: "Year",
}

/** A range from the address, as a number or its text, or undefined. */
export function readAnalyticsRange(value: unknown): AnalyticsRange | undefined {
  const days = typeof value === "number" ? value : Number(value)
  return (ANALYTICS_RANGES as readonly number[]).includes(days)
    ? (days as AnalyticsRange)
    : undefined
}

/** A range a server function was sent, checked against the list above. */
export const analyticsRangeSchema = z.custom<AnalyticsRange>(
  (value) => readAnalyticsRange(value) === value,
  "That is not one of the ranges."
)

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Midnight UTC on the range's first day. Whole days, today included: "7 days"
 * is today and the six before it, and "Today" is since midnight UTC. This is
 * the rule Traffic's daily counters always used, so every tab now uses it.
 */
export function analyticsRangeStart(days: AnalyticsRange, at: Date): Date {
  const first = new Date(at.getTime() - (days - 1) * DAY_MS)
  return new Date(`${first.toISOString().slice(0, 10)}T00:00:00Z`)
}

/** Midnight UTC after today: where every range ends, so nothing dated later counts. */
export function analyticsRangeEnd(at: Date): Date {
  return new Date(`${new Date(at.getTime() + DAY_MS).toISOString().slice(0, 10)}T00:00:00Z`)
}

/** The range as a card's muted note: "Last 30 days", "Today". */
export function rangeNote(days: AnalyticsRange) {
  if (days === 1) return "Today"
  if (days === 365) return "Last year"
  return `Last ${days} days`
}
