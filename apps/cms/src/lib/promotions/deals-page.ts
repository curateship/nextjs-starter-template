import { readPage } from "@/lib/nav/list-search"

/**
 * The Deals page's address, read the same way by the route and the endpoint.
 * Only the page number lives in it.
 */

/** How many deal cards one page of the Deals page holds. */
export const DEALS_PAGE_SIZE = 24

export type DealsPageSearch = { page?: number }

/** Anything that is not a page number from 2 up is page 1. */
export function readDealsSearch(
  search: Record<string, unknown>
): DealsPageSearch {
  const page = readPage(search.page)
  return page ? { page } : {}
}

/** "/deals", or "/deals?page=3". */
export function dealsListHref(page: number): string {
  return page > 1 ? `/deals?page=${page}` : "/deals"
}
