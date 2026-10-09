import { createFileRoute } from "@tanstack/react-router"

import { AdminInvitesDashboard } from "@/components/pomodoro/admin-invites-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getRoomsAdminErrorMessage,
  loadPomodoroInvitesPage,
} from "@/lib/api/pomodoro/admin-rooms"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  INVITE_SORT_COLUMNS,
  INVITE_STATUS_FILTERS,
  readMemberSearch,
} from "@/lib/pomodoro/admin-lists"

type InvitesSearch = {
  /** The member window open over the list (admin task 06). */
  member?: string
  q?: string
  status?: (typeof INVITE_STATUS_FILTERS)[number]
  sort?: (typeof INVITE_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

function readInvitesSearch(search: Record<string, unknown>): InvitesSearch {
  return {
    ...readMemberSearch(search),
    q: readSearchText(search.q),
    status: readOneOf(search.status, INVITE_STATUS_FILTERS),
    sort: readOneOf(search.sort, INVITE_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-invites")({
  validateSearch: readInvitesSearch,
  // The member window is not the list, so opening it never reloads the page.
  loaderDeps: ({ search: { member: _member, ...list } }) => list,
  loader: ({ deps }) =>
    loadPomodoroInvitesPage({
      search: deps.q ?? "",
      status: deps.status ?? "all",
      sort: deps.sort ?? "created",
      direction: deps.direction ?? "desc",
      page: deps.page ?? 1,
    }),
  component: AdminPomodoroInvitesRoute,
  errorComponent: routeErrorComponent(getRoomsAdminErrorMessage),
})

function AdminPomodoroInvitesRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminInvitesDashboard initial={list} initialPageSize={pageSize} />
}
