import { createFileRoute } from "@tanstack/react-router"

import { GuidesDashboard } from "@/components/directory/guides-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getGuideErrorMessage,
  loadGuidesPage,
} from "@/lib/api/directory/guides"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import {
  GUIDE_SORT_COLUMNS,
  type GuideSortColumn,
  type GuideStatus,
} from "@/lib/directory/guides"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"

type GuidesSearch = {
  q?: string
  status?: GuideStatus
  sort?: GuideSortColumn
  direction?: "asc" | "desc"
  page?: number
  size?: number
  /** Which guide's window is open, so a guide can be linked to. */
  open?: string
}

/** The list's state lives in the address; anything unexpected falls back. */
function readGuidesSearch(search: Record<string, unknown>): GuidesSearch {
  return {
    q: readSearchText(search.q),
    status: readOneOf(search.status, ["draft", "published"] as const),
    sort: readOneOf(search.sort, GUIDE_SORT_COLUMNS),
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

/**
 * Admin → Listings → Guides: the guides this site's editor writes, each a
 * named, ordered list of listings with a page of its own at /guides/<address>.
 */
export const Route = createFileRoute("/_authenticated/admin/listing-guides")({
  validateSearch: readGuidesSearch,
  // Everything except `open`: opening a guide must not refetch the list.
  loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
  loader: ({ deps }) =>
    loadGuidesPage({
      search: deps.q,
      status: deps.status,
      sort: deps.sort,
      direction: deps.direction,
      page: deps.page,
      limit: deps.size,
    }),
  component: AdminGuidesRoute,
  errorComponent: routeErrorComponent(getGuideErrorMessage),
})

function AdminGuidesRoute() {
  const search = Route.useSearch()
  const page = Route.useLoaderData()
  return <GuidesDashboard data={page} search={search} />
}
