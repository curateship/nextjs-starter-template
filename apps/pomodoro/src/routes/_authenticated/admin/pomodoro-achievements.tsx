import { createFileRoute } from "@tanstack/react-router"

import { AdminAchievementsDashboard } from "@/components/pomodoro/admin-achievements-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAdminAchievementErrorMessage,
  loadPomodoroAchievementsPage,
} from "@/lib/api/pomodoro/admin-achievements"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import { ACHIEVEMENTS } from "@/lib/pomodoro/achievements"
import {
  ACHIEVEMENT_SORT_COLUMNS,
  readMemberSearch,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"

const BADGE_IDS = ACHIEVEMENTS.map((badge) => badge.id)

type AchievementsSearch = {
  member?: string
  user?: string
  badge?: string
  q?: string
  sort?: (typeof ACHIEVEMENT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readAchievementsSearch(search: Record<string, unknown>): AchievementsSearch {
  return {
    ...readMemberSearch(search),
    user: readUserFilter(search.user),
    badge: readOneOf(search.badge, BADGE_IDS),
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, ACHIEVEMENT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-achievements")({
  validateSearch: readAchievementsSearch,
  // No `loaderDeps`: the table refetches in place from here.
  loader: ({ location }) => {
    const search = readAchievementsSearch(location.search as Record<string, unknown>)
    return loadPomodoroAchievementsPage({
      search: search.q ?? "",
      badgeId: search.badge,
      userId: search.user,
      sort: search.sort ?? "earned",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroAchievementsRoute,
  errorComponent: routeErrorComponent(getAdminAchievementErrorMessage),
})

function AdminPomodoroAchievementsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminAchievementsDashboard initial={list} initialPageSize={pageSize} />
}
