import { createFileRoute } from "@tanstack/react-router"

import { ReportsDashboard } from "@/components/directory/reports-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getListingReportErrorMessage,
  loadListingReportsPage,
} from "@/lib/api/directory/reports"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import {
  LISTING_REPORT_STATUSES,
  type ListingReportStatus,
} from "@/lib/directory/report-reasons"
import { readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"

type ReportsSearch = {
  /** Absent means the ones still waiting, which is what the screen is for. */
  status?: ListingReportStatus | "all"
  /** The search box, matched against the listing's title and the note. */
  q?: string
  page?: number
  size?: number
  /** Which report's window is open. */
  open?: string
}

const STATUS_FILTERS = [...LISTING_REPORT_STATUSES, "all"] as const

/**
 * The list's state lives in the address, so a reload keeps it and a filtered
 * link can be handed to somebody else. Every value is checked against a fixed
 * list; a hand-edited address only ever falls back to the default.
 */
function readReportsSearch(search: Record<string, unknown>): ReportsSearch {
  const openId =
    typeof search.open === "string" && search.open.length <= 36
      ? search.open
      : undefined

  return {
    status: readOneOf(search.status, STATUS_FILTERS),
    q: readSearchText(search.q),
    page: readPage(search.page),
    size: readOneOf(
      String(search.size),
      DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String)
    )
      ? Number(search.size)
      : undefined,
    open: openId,
  }
}

export const Route = createFileRoute("/_authenticated/admin/listing-reports")({
  validateSearch: readReportsSearch,
  // The window does not refetch the screen underneath it.
  loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
  loader: ({ deps }) =>
    loadListingReportsPage({
      // No status in the address means the waiting ones. "all" is the only way
      // to ask for every report, so the default stays out of the address.
      status: deps.status === "all" ? undefined : (deps.status ?? "open"),
      search: deps.q,
      page: deps.page,
      limit: deps.size,
    }),
  component: AdminListingReportsRoute,
  errorComponent: routeErrorComponent(getListingReportErrorMessage),
})

function AdminListingReportsRoute() {
  const search = Route.useSearch()
  const data = Route.useLoaderData()
  return <ReportsDashboard data={data} search={search} />
}
