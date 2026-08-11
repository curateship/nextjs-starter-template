import { createFileRoute } from "@tanstack/react-router"

import { ClaimsDashboard } from "@/components/directory/claims-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getClaimErrorMessage,
  loadClaimsScreen,
} from "@/lib/api/directory/claims"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { REVIEW_STATUSES, type ReviewStatus } from "@/lib/directory/review-status"
import { readOneOf, readPage } from "@/lib/nav/list-search"

type ClaimsSearch = {
  status?: ReviewStatus
  page?: number
  size?: number
  /** Which claim's window is open. */
  open?: string
  /** Which owner's proposed change is open. Its own key, so both can be linked to. */
  request?: string
}

/**
 * Claims and owners' changes for the site the admin is in.
 *
 * Two windows can be opened from this screen, so they take two separate keys in
 * the address rather than sharing `open` and having to say which kind of thing
 * the id belongs to.
 */
function readClaimsSearch(search: Record<string, unknown>): ClaimsSearch {
  const openId =
    typeof search.open === "string" && search.open.length <= 36
      ? search.open
      : undefined
  const requestId =
    typeof search.request === "string" && search.request.length <= 36
      ? search.request
      : undefined

  return {
    status: readOneOf(search.status, REVIEW_STATUSES),
    page: readPage(search.page),
    size: readOneOf(
      String(search.size),
      DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String)
    )
      ? Number(search.size)
      : undefined,
    open: openId,
    request: requestId,
  }
}

export const Route = createFileRoute("/_authenticated/admin/listing-claims")({
  validateSearch: readClaimsSearch,
  // Neither window refetches the screen underneath it.
  loaderDeps: ({ search: { open: _open, request: _request, ...rest } }) => rest,
  loader: ({ deps }) =>
    loadClaimsScreen({
      status: deps.status,
      page: deps.page,
      limit: deps.size,
    }),
  component: AdminClaimsRoute,
  errorComponent: routeErrorComponent(getClaimErrorMessage),
})

function AdminClaimsRoute() {
  const search = Route.useSearch()
  const data = Route.useLoaderData()
  return <ClaimsDashboard data={data} search={search} />
}
