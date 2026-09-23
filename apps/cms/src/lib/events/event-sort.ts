/**
 * The Events screen's list state, named once so the route's address reader,
 * the endpoint and the table headers agree on what may appear in the address.
 * The status filter is the listings one, because the two statuses are the same.
 */

export const EVENT_SORT_COLUMNS = [
  "title",
  "status",
  "date",
  "updated",
] as const

export type EventSortColumn = (typeof EVENT_SORT_COLUMNS)[number]

/** The list opens on the latest event date first. */
export const DEFAULT_EVENT_SORT: EventSortColumn = "date"

/** Words read A to Z; dates start newest first. */
export function eventSortDirection(column: EventSortColumn): "asc" | "desc" {
  return column === "date" || column === "updated" ? "desc" : "asc"
}
