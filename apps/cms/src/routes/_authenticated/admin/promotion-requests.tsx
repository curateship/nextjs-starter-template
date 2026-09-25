import { createFileRoute } from "@tanstack/react-router"

import { PromotionRequestsDashboard } from "@/components/promotions/promotion-requests-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getPromotionRequestErrorMessage,
  loadPromotionRequestsPage,
} from "@/lib/api/promotions/requests"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"

const TABS = ["approved", "rejected"] as const

type PromotionRequestsSearch = {
  /** Absent is the Pending tab, which is what the queue opens on. */
  status?: (typeof TABS)[number]
  /** Matched against the deal, the listing and the owner's email. */
  q?: string
  page?: number
  size?: number
  /** Which request is open, so one can be linked to. */
  open?: string
}

function readPromotionRequestsSearch(
  search: Record<string, unknown>
): PromotionRequestsSearch {
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
 * The queue of deals and changes that listing owners sent from My listings.
 * It reads the site the admin is in, so a request sent to alpha is only ever
 * reviewed by somebody looking at alpha.
 */
export const Route = createFileRoute("/_authenticated/admin/promotion-requests")(
  {
    validateSearch: readPromotionRequestsSearch,
    // Everything except `open`: the review window reads from the page already
    // loaded, so opening and closing it must not fetch the list again.
    loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
    loader: ({ deps }) =>
      loadPromotionRequestsPage({
        status: deps.status ?? "pending",
        search: deps.q,
        page: deps.page,
        limit: deps.size,
      }),
    component: AdminPromotionRequestsRoute,
    errorComponent: routeErrorComponent(getPromotionRequestErrorMessage),
  }
)

function AdminPromotionRequestsRoute() {
  const search = Route.useSearch()
  const data = Route.useLoaderData()
  return <PromotionRequestsDashboard data={data} search={search} />
}
