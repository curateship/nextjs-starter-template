import { createFileRoute } from "@tanstack/react-router"

import { AdminLeaderboardDashboard } from "@/components/pomodoro/admin-leaderboard-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAdminLeaderboardErrorMessage,
  loadPomodoroLeaderboardPage,
} from "@/lib/api/pomodoro/admin-leaderboard"
import { readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import { LEADERBOARD_TABS, readMemberSearch } from "@/lib/pomodoro/admin-lists"
import { LEADERBOARD_WINDOWS } from "@/lib/pomodoro/leaderboard-windows"

type LeaderboardSearch = {
  member?: string
  tab?: (typeof LEADERBOARD_TABS)[number]
  window?: (typeof LEADERBOARD_WINDOWS)[number]
  q?: string
  page?: number
}

function readLeaderboardSearch(search: Record<string, unknown>): LeaderboardSearch {
  return {
    ...readMemberSearch(search),
    tab: readOneOf(search.tab, LEADERBOARD_TABS),
    window: readOneOf(search.window, LEADERBOARD_WINDOWS),
    q: readSearchText(search.q),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-leaderboard")({
  validateSearch: readLeaderboardSearch,
  // Only a new tab is a new list. The window, search and page refetch in
  // place, and opening a member's window reads nothing again.
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: ({ location }) => {
    const search = readLeaderboardSearch(location.search as Record<string, unknown>)
    return loadPomodoroLeaderboardPage({
      tab: search.tab ?? "board",
      window: search.window ?? "week",
      search: search.q ?? "",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroLeaderboardRoute,
  errorComponent: routeErrorComponent(getAdminLeaderboardErrorMessage),
})

function AdminPomodoroLeaderboardRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminLeaderboardDashboard initial={list} initialPageSize={pageSize} />
}
