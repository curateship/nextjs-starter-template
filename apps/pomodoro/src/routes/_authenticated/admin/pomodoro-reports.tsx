import { createFileRoute } from "@tanstack/react-router"

import { AdminReportsDashboard } from "@/components/pomodoro/admin-reports-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getPomodoroAdminErrorMessage,
  loadPomodoroReportsPage,
} from "@/lib/api/pomodoro/admin"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  REPORT_SORT_COLUMNS,
  REPORT_STATUS_FILTERS,
  readMemberSearch,
} from "@/lib/pomodoro/admin-lists"

type ReportsSearch = {
  /** The member window open over the list (admin task 06). */
  member?: string
  q?: string
  status?: (typeof REPORT_STATUS_FILTERS)[number]
  sort?: (typeof REPORT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
  /** Reports by or about one person, from a count on a report row. */
  person?: string
}

/** The list's own state, so Back returns the exact list you left. */
function readReportsSearch(search: Record<string, unknown>): ReportsSearch {
  return {
    ...readMemberSearch(search),
    q: readSearchText(search.q),
    status: readOneOf(search.status, REPORT_STATUS_FILTERS),
    sort: readOneOf(search.sort, REPORT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    person: readSearchText(search.person),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-reports")({
  validateSearch: readReportsSearch,
  loader: ({ location }) => {
    const search = readReportsSearch(location.search as Record<string, unknown>)
    return loadPomodoroReportsPage({
      search: search.q ?? "",
      status: search.status ?? "all",
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
      person: search.person,
    })
  },
  component: AdminPomodoroReportsRoute,
  errorComponent: routeErrorComponent(getPomodoroAdminErrorMessage),
})

function AdminPomodoroReportsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminReportsDashboard initial={list} initialPageSize={pageSize} />
}
