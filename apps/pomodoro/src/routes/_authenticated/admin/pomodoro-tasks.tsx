import { createFileRoute } from "@tanstack/react-router"

import { AdminTasksDashboard } from "@/components/pomodoro/admin-tasks-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getPomodoroAdminErrorMessage,
  loadPomodoroTasksPage,
} from "@/lib/api/pomodoro/admin"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  TASK_SORT_COLUMNS,
  TASK_STATUS_FILTERS,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"

type TasksSearch = {
  q?: string
  status?: (typeof TASK_STATUS_FILTERS)[number]
  user?: string
  sort?: (typeof TASK_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readTasksSearch(search: Record<string, unknown>): TasksSearch {
  return {
    q: readSearchText(search.q),
    status: readOneOf(search.status, TASK_STATUS_FILTERS),
    user: readUserFilter(search.user),
    sort: readOneOf(search.sort, TASK_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-tasks")({
  validateSearch: readTasksSearch,
  loader: ({ location }) => {
    const search = readTasksSearch(location.search as Record<string, unknown>)
    return loadPomodoroTasksPage({
      search: search.q ?? "",
      status: search.status ?? "all",
      userId: search.user ?? null,
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroTasksRoute,
  errorComponent: routeErrorComponent(getPomodoroAdminErrorMessage),
})

function AdminPomodoroTasksRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminTasksDashboard initial={list} initialPageSize={pageSize} />
}
