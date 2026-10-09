import { createFileRoute } from "@tanstack/react-router"

import { AdminProfilesDashboard } from "@/components/pomodoro/admin-profiles-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAdminProfileErrorMessage,
  loadPomodoroProfilesPage,
} from "@/lib/api/pomodoro/admin-profiles"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  PROFILE_SORT_COLUMNS,
  PROFILE_VISIBILITY_FILTERS,
  readMemberSearch,
} from "@/lib/pomodoro/admin-lists"

type ProfilesSearch = {
  open?: string
  member?: string
  q?: string
  visibility?: (typeof PROFILE_VISIBILITY_FILTERS)[number]
  sort?: (typeof PROFILE_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readProfilesSearch(search: Record<string, unknown>): ProfilesSearch {
  return {
    ...readOpenSearch(search),
    ...readMemberSearch(search),
    q: readSearchText(search.q),
    visibility: readOneOf(search.visibility, PROFILE_VISIBILITY_FILTERS),
    sort: readOneOf(search.sort, PROFILE_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-profiles")({
  validateSearch: readProfilesSearch,
  // No `loaderDeps`: the address seeds the first render and the table
  // refetches in place, so opening a window never reads the list again.
  loader: ({ location }) => {
    const search = readProfilesSearch(location.search as Record<string, unknown>)
    return loadPomodoroProfilesPage({
      search: search.q ?? "",
      visibility: search.visibility ?? "all",
      sort: search.sort ?? "updated",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroProfilesRoute,
  errorComponent: routeErrorComponent(getAdminProfileErrorMessage),
})

function AdminPomodoroProfilesRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminProfilesDashboard initial={list} initialPageSize={pageSize} />
}
