import { createFileRoute } from "@tanstack/react-router"

import { SubmissionsDashboard } from "@/components/directory/submissions-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAdminSubmissionErrorMessage,
  loadSubmissionsPage,
} from "@/lib/api/directory/submissions"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { REVIEW_STATUSES, type ReviewStatus } from "@/lib/directory/review-status"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"

type SubmissionsSearch = {
  status?: ReviewStatus
  /** What was typed in the search box, matched against name and contact email. */
  q?: string
  page?: number
  size?: number
  /** Which submission is open, so one can be linked to. */
  open?: string
}

/**
 * The queue for listings the public asked for.
 *
 * Reads the site the admin is in, the same way Listings and Categories do — a
 * submission made on alpha is only ever reviewed by somebody looking at alpha.
 */
function readSubmissionsSearch(
  search: Record<string, unknown>
): SubmissionsSearch {
  return {
    status: readOneOf(search.status, REVIEW_STATUSES),
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

export const Route = createFileRoute("/_authenticated/admin/listing-submissions")(
  {
    validateSearch: readSubmissionsSearch,
    // Everything except `open`: the review window reads from the page already
    // loaded, so opening and closing it must not refetch the list underneath.
    loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
    loader: ({ deps }) =>
      loadSubmissionsPage({
        status: deps.status,
        search: deps.q,
        page: deps.page,
        limit: deps.size,
      }),
    component: AdminSubmissionsRoute,
    errorComponent: routeErrorComponent(getAdminSubmissionErrorMessage),
  }
)

function AdminSubmissionsRoute() {
  const search = Route.useSearch()
  const data = Route.useLoaderData()
  return <SubmissionsDashboard data={data} search={search} />
}
