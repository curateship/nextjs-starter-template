import { createFileRoute } from "@tanstack/react-router"

import { AdminSessionsDashboard } from "@/components/pomodoro/admin-sessions-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getPomodoroAdminErrorMessage,
  loadPomodoroSessionsPage,
} from "@/lib/api/pomodoro/admin"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  SESSION_MODE_FILTERS,
  SESSION_SORT_COLUMNS,
  SESSION_STATUS_FILTERS,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"

type SessionsSearch = {
  q?: string
  mode?: (typeof SESSION_MODE_FILTERS)[number]
  status?: (typeof SESSION_STATUS_FILTERS)[number]
  user?: string
  sort?: (typeof SESSION_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/**
 * The list's own state. `?user=` is how the Focus data page hands a person
 * over, which is what makes "find this member's sessions" one click.
 */
function readSessionsSearch(search: Record<string, unknown>): SessionsSearch {
  return {
    q: readSearchText(search.q),
    mode: readOneOf(search.mode, SESSION_MODE_FILTERS),
    status: readOneOf(search.status, SESSION_STATUS_FILTERS),
    user: readUserFilter(search.user),
    sort: readOneOf(search.sort, SESSION_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-sessions")(
  {
    validateSearch: readSessionsSearch,
    loader: ({ location }) => {
      const search = readSessionsSearch(
        location.search as Record<string, unknown>
      )
      return loadPomodoroSessionsPage({
        search: search.q ?? "",
        mode: search.mode ?? "all",
        status: search.status ?? "all",
        userId: search.user ?? null,
        sort: search.sort ?? "started",
        direction: search.direction ?? "desc",
        page: search.page ?? 1,
      })
    },
    component: AdminPomodoroSessionsRoute,
    errorComponent: routeErrorComponent(getPomodoroAdminErrorMessage),
  }
)

function AdminPomodoroSessionsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminSessionsDashboard initial={list} initialPageSize={pageSize} />
}
