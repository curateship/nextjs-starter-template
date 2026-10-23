/**
 * The Events screen's list state, named once so the route's address reader,
 * the endpoint and the table headers agree on what may appear in the address.
 * The status filter is the listings one, because the two statuses are the same.
 */

export const EVENT_SORT_COLUMNS = [
  "title",
  "status",
  "date",
  "views",
  "updated",
] as const

export type EventSortColumn = (typeof EVENT_SORT_COLUMNS)[number]

/** The list opens on the latest event date first. */
export const DEFAULT_EVENT_SORT: EventSortColumn = "date"

/** Words read A to Z; dates and counts start with the biggest first. */
export function eventSortDirection(column: EventSortColumn): "asc" | "desc" {
  return column === "date" || column === "updated" || column === "views"
    ? "desc"
    : "asc"
}

/**
 * The two ranges the Views column offers. Traffic owns everything finer than
 * this, and an event only has a page for as long as it is published, so a
 * seven-day or one-year window would say little the other two do not.
 */
export const EVENT_VIEW_RANGES = ["all", 30] as const

export type EventViewRange = (typeof EVENT_VIEW_RANGES)[number]

export const EVENT_VIEW_RANGE_LABELS: Record<EventViewRange, string> = {
  all: "All time",
  30: "Last 30 days",
}

/** Anything else in the address reads as the default, which is all time. */
export function readEventViewRange(value: unknown): EventViewRange | undefined {
  const days = value === "all" ? "all" : Number(value)
  return (EVENT_VIEW_RANGES as readonly (string | number)[]).includes(days)
    ? (days as EventViewRange)
    : undefined
}
