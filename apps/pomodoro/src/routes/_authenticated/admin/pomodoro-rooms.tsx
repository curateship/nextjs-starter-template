import { createFileRoute } from "@tanstack/react-router"

import { AdminRoomsDashboard } from "@/components/pomodoro/admin-rooms-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getPomodoroAdminErrorMessage,
  loadPomodoroRoomsPage,
} from "@/lib/api/pomodoro/admin"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  ROOM_PHASE_FILTERS,
  ROOM_SORT_COLUMNS,
  ROOM_VISIBILITY_FILTERS,
} from "@/lib/pomodoro/admin-lists"

type RoomsSearch = {
  q?: string
  phase?: (typeof ROOM_PHASE_FILTERS)[number]
  visibility?: (typeof ROOM_VISIBILITY_FILTERS)[number]
  sort?: (typeof ROOM_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readRoomsSearch(search: Record<string, unknown>): RoomsSearch {
  return {
    q: readSearchText(search.q),
    phase: readOneOf(search.phase, ROOM_PHASE_FILTERS),
    visibility: readOneOf(search.visibility, ROOM_VISIBILITY_FILTERS),
    sort: readOneOf(search.sort, ROOM_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-rooms")({
  validateSearch: readRoomsSearch,
  loader: ({ location }) => {
    const search = readRoomsSearch(location.search as Record<string, unknown>)
    return loadPomodoroRoomsPage({
      search: search.q ?? "",
      phase: search.phase ?? "all",
      visibility: search.visibility ?? "all",
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroRoomsRoute,
  errorComponent: routeErrorComponent(getPomodoroAdminErrorMessage),
})

function AdminPomodoroRoomsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminRoomsDashboard initial={list} initialPageSize={pageSize} />
}
