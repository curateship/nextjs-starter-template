import { createFileRoute } from "@tanstack/react-router"

import { AdminBlocksDashboard } from "@/components/pomodoro/admin-blocks-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAdminSocialErrorMessage,
  loadPomodoroBlocksPage,
} from "@/lib/api/pomodoro/admin-social"
import { readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import {
  BLOCK_TABS,
  readMemberSearch,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"

type BlocksSearch = {
  member?: string
  tab?: (typeof BLOCK_TABS)[number]
  q?: string
  user?: string
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readBlocksSearch(search: Record<string, unknown>): BlocksSearch {
  return {
    ...readMemberSearch(search),
    tab: readOneOf(search.tab, BLOCK_TABS),
    q: readSearchText(search.q),
    user: readUserFilter(search.user),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-blocks")({
  validateSearch: readBlocksSearch,
  // Only a tab change is a new list; see pomodoro-follows.tsx.
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: ({ location }) => {
    const search = readBlocksSearch(location.search as Record<string, unknown>)
    return loadPomodoroBlocksPage({
      tab: search.tab ?? "blocks",
      search: search.q ?? "",
      user: search.user,
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroBlocksRoute,
  errorComponent: routeErrorComponent(getAdminSocialErrorMessage),
})

function AdminPomodoroBlocksRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminBlocksDashboard initial={list} initialPageSize={pageSize} />
}
