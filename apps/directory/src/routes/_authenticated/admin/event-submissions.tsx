import { createFileRoute } from "@tanstack/react-router"

import { EventSubmissionsDashboard } from "@/components/events/event-submissions-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getAdminSubmissionErrorMessage } from "@/lib/api/directory/submissions"
import { loadEventSubmissionsPage } from "@/lib/api/events/submissions"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"

const TABS = ["approved", "rejected"] as const

type EventSubmissionsSearch = {
  /** Absent is the Pending tab, which is what the queue opens on. */
  status?: (typeof TABS)[number]
  /** Matched against the title, the email and the name. */
  q?: string
  page?: number
  size?: number
  /** Which suggestion is open, so one can be linked to. */
  open?: string
}

function readEventSubmissionsSearch(
  search: Record<string, unknown>
): EventSubmissionsSearch {
  return {
    status: readOneOf(search.status, TABS),
    q: readSearchText(search.q),
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
 * The queue for events the public suggested on the Suggest an event page,
 * beside Listing submissions. It reads the site the admin is in, so a
 * suggestion sent to alpha is only ever reviewed by somebody looking at alpha.
 */
export const Route = createFileRoute("/_authenticated/admin/event-submissions")(
  {
    validateSearch: readEventSubmissionsSearch,
    // Everything except `open`: the review window reads from the page already
    // loaded, so opening and closing it must not fetch the list again.
    loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
    loader: ({ deps }) =>
      loadEventSubmissionsPage({
        status: deps.status ?? "pending",
        search: deps.q,
        page: deps.page,
        limit: deps.size,
      }),
    component: AdminEventSubmissionsRoute,
    errorComponent: routeErrorComponent(getAdminSubmissionErrorMessage),
  }
)

function AdminEventSubmissionsRoute() {
  const search = Route.useSearch()
  const data = Route.useLoaderData()
  return <EventSubmissionsDashboard data={data} search={search} />
}
