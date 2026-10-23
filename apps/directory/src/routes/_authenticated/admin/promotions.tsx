import { createFileRoute } from "@tanstack/react-router"

import { PromotionsDashboard } from "@/components/promotions/promotions-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getPromotionErrorMessage,
  loadPromotionsPage,
} from "@/lib/api/promotions/promotions"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import {
  LISTING_STATUS_FILTERS,
  type ListingStatusFilter,
} from "@/lib/directory/listing-sort"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  PROMOTION_SORT_COLUMNS,
  type PromotionSortColumn,
} from "@/lib/promotions/promotion-sort"

type PromotionsSearch = {
  q?: string
  status?: ListingStatusFilter
  sort?: PromotionSortColumn
  direction?: "asc" | "desc"
  page?: number
  size?: number
  /** Which deal's window is open, so a deal can be linked to. */
  open?: string
}

/** The list's state lives in the address; anything unexpected falls back. */
function readPromotionsSearch(
  search: Record<string, unknown>
): PromotionsSearch {
  return {
    q: readSearchText(search.q),
    status: readOneOf(search.status, LISTING_STATUS_FILTERS),
    sort: readOneOf(search.sort, PROMOTION_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    size: readOneOf(
      String(search.size),
      DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String)
    )
      ? Number(search.size)
      : undefined,
    ...readOpenSearch(search),
  }
}

export const Route = createFileRoute("/_authenticated/admin/promotions")({
  validateSearch: readPromotionsSearch,
  // Everything except `open`: opening a deal must not refetch the list.
  loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
  loader: ({ deps }) =>
    loadPromotionsPage({
      search: deps.q,
      status: deps.status,
      sort: deps.sort,
      direction: deps.direction,
      page: deps.page,
      limit: deps.size,
    }),
  component: AdminPromotionsRoute,
  errorComponent: routeErrorComponent(getPromotionErrorMessage),
})

function AdminPromotionsRoute() {
  const search = Route.useSearch()
  const data = Route.useLoaderData()
  return <PromotionsDashboard data={data} search={search} />
}
