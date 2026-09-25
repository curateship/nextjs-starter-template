import { slugProblem } from "@/lib/directory/slugs"
import { readEventNear, type EventNearSearch } from "@/lib/events/events-page"
import { readOneOf, readPage } from "@/lib/nav/list-search"

/**
 * The Deals page's address, read the same way by the route and the endpoint:
 * the page number and the filters, so a filtered page survives a reload and
 * can be sent to somebody. A distance is read by the Events page's own rule,
 * so "near" means the same on both pages.
 */

/** How many deal cards one page of the Deals page holds. */
export const DEALS_PAGE_SIZE = 24

/**
 * How many days "Ending soon" covers: today and the next two, by the site's
 * calendar, which Tyler chose on 25 Sep 2026.
 */
export const ENDING_SOON_DAYS = 3

/** The "when" chips: running right now, or ending within three days. */
export const DEAL_ON_FILTERS = ["now", "ending"] as const

export type DealOnFilter = (typeof DEAL_ON_FILTERS)[number]

export const DEAL_ON_FILTER_LABELS: Record<DealOnFilter, string> = {
  now: "On now",
  ending: "Ending soon",
}

export type DealsPageSearch = EventNearSearch & {
  page?: number
  /** A category's address. One with no live deal here is ignored. */
  category?: string
  on?: DealOnFilter
}

/** Anything unexpected is dropped, so a mistyped address shows every deal. */
export function readDealsSearch(
  search: Record<string, unknown>
): DealsPageSearch {
  const category =
    typeof search.category === "string" &&
    search.category.length <= 160 &&
    !slugProblem(search.category)
      ? search.category
      : undefined
  const read: DealsPageSearch = {
    page: readPage(search.page),
    category,
    on: readOneOf(search.on, DEAL_ON_FILTERS),
    ...readEventNear(search),
  }
  // Left out rather than undefined, so the address never grows empty keys.
  return Object.fromEntries(
    Object.entries(read).filter(([, value]) => value !== undefined)
  ) as DealsPageSearch
}

/** "/deals?category=pizza&page=2", keys in one fixed order. */
export function dealsListHref(search: DealsPageSearch): string {
  const params = new URLSearchParams()
  for (const key of ["category", "on", "near", "radius", "area", "page"] as const) {
    const value = search[key]
    if (value === undefined || (key === "page" && value === 1)) continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `/deals?${query}` : "/deals"
}
