import { createFileRoute } from "@tanstack/react-router"

import { AdminTaskRepeatsDashboard } from "@/components/pomodoro/admin-task-repeats-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getPomodoroAdminErrorMessage,
  loadPomodoroTaskRepeatsPage,
} from "@/lib/api/pomodoro/admin"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  TASK_REPEAT_SORT_COLUMNS,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"

type TaskRepeatsSearch = {
  q?: string
  user?: string
  sort?: (typeof TASK_REPEAT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readTaskRepeatsSearch(
  search: Record<string, unknown>
): TaskRepeatsSearch {
  return {
    q: readSearchText(search.q),
    user: readUserFilter(search.user),
    sort: readOneOf(search.sort, TASK_REPEAT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute(
  "/_authenticated/admin/pomodoro-task-repeats"
)({
  validateSearch: readTaskRepeatsSearch,
  loader: ({ location }) => {
    const search = readTaskRepeatsSearch(
      location.search as Record<string, unknown>
    )
    return loadPomodoroTaskRepeatsPage({
      search: search.q ?? "",
      userId: search.user ?? null,
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroTaskRepeatsRoute,
  errorComponent: routeErrorComponent(getPomodoroAdminErrorMessage),
})

function AdminPomodoroTaskRepeatsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminTaskRepeatsDashboard initial={list} initialPageSize={pageSize} />
}
