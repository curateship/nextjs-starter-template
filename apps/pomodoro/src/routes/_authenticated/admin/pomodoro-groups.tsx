import { createFileRoute } from "@tanstack/react-router"

import { AdminGroupsDashboard } from "@/components/pomodoro/admin-groups-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAdminSocialErrorMessage,
  loadPomodoroGroupsPage,
} from "@/lib/api/pomodoro/admin-social"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  GROUP_SORT_COLUMNS,
  readMemberSearch,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"

type GroupsSearch = {
  open?: string
  member?: string
  q?: string
  user?: string
  sort?: (typeof GROUP_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readGroupsSearch(search: Record<string, unknown>): GroupsSearch {
  return {
    ...readOpenSearch(search),
    ...readMemberSearch(search),
    q: readSearchText(search.q),
    user: readUserFilter(search.user),
    sort: readOneOf(search.sort, GROUP_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-groups")({
  validateSearch: readGroupsSearch,
  // No `loaderDeps`: the address seeds the first render and the table
  // refetches in place from there; see pomodoro-focus.tsx.
  loader: ({ location }) => {
    const search = readGroupsSearch(location.search as Record<string, unknown>)
    return loadPomodoroGroupsPage({
      search: search.q ?? "",
      user: search.user,
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroGroupsRoute,
  errorComponent: routeErrorComponent(getAdminSocialErrorMessage),
})

function AdminPomodoroGroupsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminGroupsDashboard initial={list} initialPageSize={pageSize} />
}
