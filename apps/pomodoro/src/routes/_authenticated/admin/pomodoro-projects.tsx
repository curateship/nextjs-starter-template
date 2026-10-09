import { createFileRoute } from "@tanstack/react-router"

import { AdminProjectsDashboard } from "@/components/pomodoro/admin-projects-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAdminProjectErrorMessage,
  loadPomodoroProjectsPage,
} from "@/lib/api/pomodoro/admin-projects"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  PROJECT_SORT_COLUMNS,
  PROJECT_STATE_FILTERS,
  PROJECT_TARGET_FILTERS,
  PROJECT_VISIBILITY_FILTERS,
  readMemberSearch,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"

type ProjectsSearch = {
  open?: string
  member?: string
  q?: string
  user?: string
  state?: (typeof PROJECT_STATE_FILTERS)[number]
  visibility?: (typeof PROJECT_VISIBILITY_FILTERS)[number]
  target?: (typeof PROJECT_TARGET_FILTERS)[number]
  sort?: (typeof PROJECT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readProjectsSearch(search: Record<string, unknown>): ProjectsSearch {
  return {
    ...readOpenSearch(search),
    ...readMemberSearch(search),
    q: readSearchText(search.q),
    user: readUserFilter(search.user),
    state: readOneOf(search.state, PROJECT_STATE_FILTERS),
    visibility: readOneOf(search.visibility, PROJECT_VISIBILITY_FILTERS),
    target: readOneOf(search.target, PROJECT_TARGET_FILTERS),
    sort: readOneOf(search.sort, PROJECT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-projects")({
  validateSearch: readProjectsSearch,
  // No `loaderDeps`: the address seeds the first render and the table
  // refetches in place, so opening a window never reads the list again.
  loader: ({ location }) => {
    const search = readProjectsSearch(location.search as Record<string, unknown>)
    return loadPomodoroProjectsPage({
      search: search.q ?? "",
      user: search.user,
      state: search.state ?? "all",
      visibility: search.visibility ?? "all",
      target: search.target ?? "all",
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroProjectsRoute,
  errorComponent: routeErrorComponent(getAdminProjectErrorMessage),
})

function AdminPomodoroProjectsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminProjectsDashboard initial={list} initialPageSize={pageSize} />
}
