import { createFileRoute } from "@tanstack/react-router"

import { AdminGenerationsDashboard } from "@/components/pomodoro/admin-generations-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getMemberFilesErrorMessage, loadPomodoroGenerationsPage } from "@/lib/api/pomodoro/admin-uploads-tags"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import {
  GENERATION_KIND_FILTERS,
  GENERATION_SORT_COLUMNS,
  GENERATION_STATUS_FILTERS,
  readMemberSearch,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"

type GenerationsSearch = {
  q?: string
  kind?: (typeof GENERATION_KIND_FILTERS)[number]
  status?: (typeof GENERATION_STATUS_FILTERS)[number]
  user?: string
  member?: string
  sort?: (typeof GENERATION_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

function readGenerationsSearch(search: Record<string, unknown>): GenerationsSearch {
  return {
    ...readMemberSearch(search),
    q: readSearchText(search.q),
    kind: readOneOf(search.kind, GENERATION_KIND_FILTERS),
    status: readOneOf(search.status, GENERATION_STATUS_FILTERS),
    user: readUserFilter(search.user),
    sort: readOneOf(search.sort, GENERATION_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-generations")({
  validateSearch: readGenerationsSearch,
  loader: ({ location }) => {
    const search = readGenerationsSearch(location.search as Record<string, unknown>)
    return loadPomodoroGenerationsPage({
      search: search.q ?? "",
      kind: search.kind ?? "all",
      status: search.status ?? "all",
      user: search.user,
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroGenerationsRoute,
  errorComponent: routeErrorComponent(getMemberFilesErrorMessage),
})

function AdminPomodoroGenerationsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminGenerationsDashboard initial={list} initialPageSize={pageSize} />
}
