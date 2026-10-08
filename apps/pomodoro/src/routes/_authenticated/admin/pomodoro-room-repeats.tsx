import { createFileRoute } from "@tanstack/react-router"

import { AdminRoomRepeatsDashboard } from "@/components/pomodoro/admin-room-repeats-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getPomodoroAdminErrorMessage,
  loadPomodoroRoomRepeatsPage,
} from "@/lib/api/pomodoro/admin"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  ROOM_REPEAT_SORT_COLUMNS,
  ROOM_REPEAT_STATUS_FILTERS,
} from "@/lib/pomodoro/admin-lists"

type RoomRepeatsSearch = {
  q?: string
  status?: (typeof ROOM_REPEAT_STATUS_FILTERS)[number]
  sort?: (typeof ROOM_REPEAT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readRoomRepeatsSearch(
  search: Record<string, unknown>
): RoomRepeatsSearch {
  return {
    q: readSearchText(search.q),
    status: readOneOf(search.status, ROOM_REPEAT_STATUS_FILTERS),
    sort: readOneOf(search.sort, ROOM_REPEAT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute(
  "/_authenticated/admin/pomodoro-room-repeats"
)({
  validateSearch: readRoomRepeatsSearch,
  loader: ({ location }) => {
    const search = readRoomRepeatsSearch(
      location.search as Record<string, unknown>
    )
    return loadPomodoroRoomRepeatsPage({
      search: search.q ?? "",
      status: search.status ?? "all",
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroRoomRepeatsRoute,
  errorComponent: routeErrorComponent(getPomodoroAdminErrorMessage),
})

function AdminPomodoroRoomRepeatsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminRoomRepeatsDashboard initial={list} initialPageSize={pageSize} />
}
