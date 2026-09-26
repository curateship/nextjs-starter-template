import { createFileRoute } from "@tanstack/react-router"

import { EventsDashboard } from "@/components/events/events-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadCategories } from "@/lib/api/directory/categories"
import { getEventErrorMessage, loadEventsPage } from "@/lib/api/events/events"
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
  EVENT_SORT_COLUMNS,
  readEventViewRange,
  type EventSortColumn,
  type EventViewRange,
} from "@/lib/events/event-sort"

type EventsSearch = {
  q?: string
  status?: ListingStatusFilter
  sort?: EventSortColumn
  direction?: "asc" | "desc"
  days?: EventViewRange
  page?: number
  size?: number
  /** Which event's window is open, so an event can be linked to. */
  open?: string
}

/** The list's state lives in the address; anything unexpected falls back. */
function readEventsSearch(search: Record<string, unknown>): EventsSearch {
  return {
    q: readSearchText(search.q),
    status: readOneOf(search.status, LISTING_STATUS_FILTERS),
    sort: readOneOf(search.sort, EVENT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    days: readEventViewRange(search.days),
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

export const Route = createFileRoute("/_authenticated/admin/events")({
  validateSearch: readEventsSearch,
  // Everything except `open`: opening an event must not refetch the list.
  loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
  // The category tree comes with the list, because a new event has no record
  // to bring it and the window needs it the moment it opens.
  loader: async ({ deps }) => {
    const [page, categories] = await Promise.all([
      loadEventsPage({
        search: deps.q,
        status: deps.status,
        sort: deps.sort,
        direction: deps.direction,
        days: deps.days,
        page: deps.page,
        limit: deps.size,
      }),
      loadCategories(),
    ])
    return { page, categories }
  },
  component: AdminEventsRoute,
  errorComponent: routeErrorComponent(getEventErrorMessage),
})

function AdminEventsRoute() {
  const search = Route.useSearch()
  const { page, categories } = Route.useLoaderData()
  return <EventsDashboard data={page} categories={categories} search={search} />
}
