/**
 * The listings dashboard's list state, named once so the route's address
 * reader, the API and the table headers all agree on what may appear in the
 * URL.
 */

export const LISTING_SORT_COLUMNS = [
  "title",
  "status",
  "views",
  "created",
  "updated",
] as const

export type ListingSortColumn = (typeof LISTING_SORT_COLUMNS)[number]

/** Words read as words; the date columns start newest-first. */
export function listingSortDirection(
  column: ListingSortColumn
): "asc" | "desc" {
  return column === "views" || column === "created" || column === "updated"
    ? "desc"
    : "asc"
}

/** The ranges useful beside a listing list. Traffic owns detailed trends. */
export const LISTING_VIEW_RANGES = ["all", 7, 30, 365] as const

export type ListingViewRange = (typeof LISTING_VIEW_RANGES)[number]

export const LISTING_VIEW_RANGE_LABELS: Record<ListingViewRange, string> = {
  all: "All",
  7: "7 days",
  30: "30 days",
  365: "Year",
}

export function readListingViewRange(
  value: unknown
): ListingViewRange | undefined {
  const days = value === "all" ? "all" : Number(value)
  return (LISTING_VIEW_RANGES as readonly (string | number)[]).includes(days)
    ? (days as ListingViewRange)
    : undefined
}

/** The status filter's choices. "all" is the default and stays out of the URL. */
export const LISTING_STATUS_FILTERS = ["draft", "published"] as const

export type ListingStatusFilter = (typeof LISTING_STATUS_FILTERS)[number]

export const LISTING_STATUS_LABELS: Record<ListingStatusFilter, string> = {
  draft: "Draft",
  published: "Published",
}
