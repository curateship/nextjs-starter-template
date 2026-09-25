import { createFileRoute } from "@tanstack/react-router"

import { AdminFocusDashboard } from "@/components/pomodoro/admin-focus-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getPomodoroAdminErrorMessage,
  loadPomodoroFocusPage,
} from "@/lib/api/pomodoro/admin"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import { FOCUS_SORT_COLUMNS } from "@/lib/pomodoro/admin-lists"

type FocusSearch = {
  q?: string
  sort?: (typeof FOCUS_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readFocusSearch(search: Record<string, unknown>): FocusSearch {
  return {
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, FOCUS_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-focus")({
  validateSearch: readFocusSearch,
  // No `loaderDeps`: the address seeds the first render and the table refetches
  // in place from there, so watching it would fetch twice per keystroke. The
  // router types a loader's `location.search` as empty whatever the schema
  // says, so it is read back through the same checks.
  loader: ({ location }) => {
    const search = readFocusSearch(location.search as Record<string, unknown>)
    return loadPomodoroFocusPage({
      search: search.q ?? "",
      sort: search.sort ?? "focus",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroFocusRoute,
  errorComponent: routeErrorComponent(getPomodoroAdminErrorMessage),
})

function AdminPomodoroFocusRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminFocusDashboard initial={list} initialPageSize={pageSize} />
}
