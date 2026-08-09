import { createFileRoute } from "@tanstack/react-router"

import { ListingsDashboard } from "@/components/directory/listings-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadCategories } from "@/lib/api/directory/categories"
import {
  getListingErrorMessage,
  loadListingsPage,
} from "@/lib/api/directory/listings"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import {
  LISTING_SORT_COLUMNS,
  LISTING_STATUS_FILTERS,
  type ListingSortColumn,
  type ListingStatusFilter,
} from "@/lib/directory/listing-sort"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"

type ListingsSearch = {
  q?: string
  status?: ListingStatusFilter
  sort?: ListingSortColumn
  direction?: "asc" | "desc"
  page?: number
  size?: number
  /** Which listing's edit window is open, so a listing can be linked to. */
  open?: string
}

/**
 * The list's state lives in the address, so a reload keeps it and a filtered
 * link can be handed to somebody else. Every value is checked against a fixed
 * list or a range; a hand-edited address only ever falls back to the default.
 */
function readListingsSearch(search: Record<string, unknown>): ListingsSearch {
  return {
    q: readSearchText(search.q),
    status: readOneOf(search.status, LISTING_STATUS_FILTERS),
    sort: readOneOf(search.sort, LISTING_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    size: readOneOf(String(search.size), DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String))
      ? Number(search.size)
      : undefined,
    ...readOpenSearch(search),
  }
}

export const Route = createFileRoute("/_authenticated/admin/listings")({
  validateSearch: readListingsSearch,
  // Everything except `open`: the edit window loads its own record, so
  // opening and closing it must not refetch the list underneath.
  loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
  // The list and the category tree together: the edit window needs the tree
  // the moment it opens, and fetching it then is what made opening feel slow.
  loader: async ({ deps }) => {
    const [page, categories] = await Promise.all([
      loadListingsPage({
        search: deps.q,
        status: deps.status,
        sort: deps.sort,
        direction: deps.direction,
        page: deps.page,
        limit: deps.size,
      }),
      loadCategories(),
    ])
    return { page, categories }
  },
  component: AdminListingsRoute,
  errorComponent: routeErrorComponent(getListingErrorMessage),
})

function AdminListingsRoute() {
  const search = Route.useSearch()
  const { page, categories } = Route.useLoaderData()
  return <ListingsDashboard data={page} categories={categories} search={search} />
}
