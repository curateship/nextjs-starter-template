import { createFileRoute } from "@tanstack/react-router"

import { AdminFollowsDashboard } from "@/components/pomodoro/admin-follows-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAdminSocialErrorMessage,
  loadPomodoroFollowsPage,
} from "@/lib/api/pomodoro/admin-social"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  FOLLOW_SORT_COLUMNS,
  FOLLOW_TABS,
  readMemberSearch,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"

type FollowsSearch = {
  member?: string
  tab?: (typeof FOLLOW_TABS)[number]
  q?: string
  user?: string
  sort?: (typeof FOLLOW_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readFollowsSearch(search: Record<string, unknown>): FollowsSearch {
  return {
    ...readMemberSearch(search),
    tab: readOneOf(search.tab, FOLLOW_TABS),
    q: readSearchText(search.q),
    user: readUserFilter(search.user),
    sort: readOneOf(search.sort, FOLLOW_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-follows")({
  validateSearch: readFollowsSearch,
  // Only a tab change is a new list. Everything else refetches in place, and
  // the member window opening over the page is not a list change at all.
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: ({ location }) => {
    const search = readFollowsSearch(location.search as Record<string, unknown>)
    return loadPomodoroFollowsPage({
      tab: search.tab ?? "follows",
      search: search.q ?? "",
      user: search.user,
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroFollowsRoute,
  errorComponent: routeErrorComponent(getAdminSocialErrorMessage),
})

function AdminPomodoroFollowsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminFollowsDashboard initial={list} initialPageSize={pageSize} />
}
