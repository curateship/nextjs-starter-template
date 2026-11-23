/**
 * Admin → Promotions' list state, named once so the route's address reader,
 * the endpoint and the table headers agree on what may appear in the address.
 * The status filter is the listings one, because the two statuses are the same.
 */

export const PROMOTION_SORT_COLUMNS = [
  "title",
  "listing",
  "status",
  "start",
  "updated",
  "views",
  "codeTaps",
] as const

export type PromotionSortColumn = (typeof PROMOTION_SORT_COLUMNS)[number]

/** The list opens on the latest start day first. */
export const DEFAULT_PROMOTION_SORT: PromotionSortColumn = "start"

/** Words read A to Z; days start newest first; counts start biggest first. */
export function promotionSortDirection(
  column: PromotionSortColumn
): "asc" | "desc" {
  return column === "title" || column === "listing" || column === "status"
    ? "asc"
    : "desc"
}
