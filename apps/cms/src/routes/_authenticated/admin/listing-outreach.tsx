import { createFileRoute } from "@tanstack/react-router"

import { OutreachDashboard } from "@/components/directory/outreach-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getOutreachErrorMessage, loadOutreach } from "@/lib/api/directory/outreach"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"

type OutreachSearch = {
  /** The search box, matched against listing title and contact address. */
  q?: string
  page?: number
  /** The send history's own page, so paging one table does not move the other. */
  historyPage?: number
  size?: number
}

function readOutreachSearch(search: Record<string, unknown>): OutreachSearch {
  return {
    q: readSearchText(search.q),
    page: readPage(search.page),
    historyPage: readPage(search.historyPage),
    size: readOneOf(
      String(search.size),
      DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String)
    )
      ? Number(search.size)
      : undefined,
  }
}

export const Route = createFileRoute("/_authenticated/admin/listing-outreach")({
  validateSearch: readOutreachSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    loadOutreach({
      search: deps.q,
      page: deps.page,
      historyPage: deps.historyPage,
      limit: deps.size,
    }),
  component: ListingOutreachRoute,
  errorComponent: routeErrorComponent(getOutreachErrorMessage),
})

function ListingOutreachRoute() {
  return (
    <OutreachDashboard
      data={Route.useLoaderData()}
      search={Route.useSearch()}
    />
  )
}
