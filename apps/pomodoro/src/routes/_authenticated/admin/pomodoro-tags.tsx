import { createFileRoute } from "@tanstack/react-router"

import { AdminTagsDashboard } from "@/components/pomodoro/admin-tags-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getMemberFilesErrorMessage, loadPomodoroTagsPage } from "@/lib/api/pomodoro/admin-uploads-tags"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import { TAG_SORT_COLUMNS, readMemberSearch, readUserFilter } from "@/lib/pomodoro/admin-lists"

type TagsSearch = {
  q?: string
  user?: string
  member?: string
  sort?: (typeof TAG_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

function readTagsSearch(search: Record<string, unknown>): TagsSearch {
  return {
    ...readMemberSearch(search),
    q: readSearchText(search.q),
    user: readUserFilter(search.user),
    sort: readOneOf(search.sort, TAG_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-tags")({
  validateSearch: readTagsSearch,
  loader: ({ location }) => {
    const search = readTagsSearch(location.search as Record<string, unknown>)
    return loadPomodoroTagsPage({
      search: search.q ?? "",
      user: search.user,
      sort: search.sort ?? "tasks",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroTagsRoute,
  errorComponent: routeErrorComponent(getMemberFilesErrorMessage),
})

function AdminPomodoroTagsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminTagsDashboard initial={list} initialPageSize={pageSize} />
}
