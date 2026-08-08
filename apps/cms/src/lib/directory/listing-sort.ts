/**
 * The listings dashboard's list state, named once so the route's address
 * reader, the API and the table headers all agree on what may appear in the
 * URL.
 */

export const LISTING_SORT_COLUMNS = [
  "title",
  "status",
  "created",
  "updated",
] as const

export type ListingSortColumn = (typeof LISTING_SORT_COLUMNS)[number]

/** Words read as words; the date columns start newest-first. */
export function listingSortDirection(
  column: ListingSortColumn
): "asc" | "desc" {
  return column === "created" || column === "updated" ? "desc" : "asc"
}

/** The status filter's choices. "all" is the default and stays out of the URL. */
export const LISTING_STATUS_FILTERS = ["draft", "published"] as const

export type ListingStatusFilter = (typeof LISTING_STATUS_FILTERS)[number]

export const LISTING_STATUS_LABELS: Record<ListingStatusFilter, string> = {
  draft: "Draft",
  published: "Published",
}
