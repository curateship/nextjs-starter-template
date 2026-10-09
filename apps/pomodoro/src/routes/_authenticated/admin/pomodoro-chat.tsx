import { createFileRoute } from "@tanstack/react-router"

import { AdminChatDashboard } from "@/components/pomodoro/admin-chat-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getSafetyErrorMessage,
  loadPomodoroChatPage,
} from "@/lib/api/pomodoro/admin-safety"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import {
  CHAT_ROOM_SORT_COLUMNS,
  CHAT_STATUS_FILTERS,
  CHAT_TABS,
  readMemberSearch,
} from "@/lib/pomodoro/admin-lists"

type ChatSearch = {
  /** The member window open over the list (admin task 06). */
  member?: string
  tab?: (typeof CHAT_TABS)[number]
  q?: string
  status?: (typeof CHAT_STATUS_FILTERS)[number]
  sort?: (typeof CHAT_ROOM_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
  /** The room whose chat is open in the window. */
  open?: string
  /** A line in that room to scroll to, from a search result. */
  message?: string
}

function readChatSearch(search: Record<string, unknown>): ChatSearch {
  return {
    ...readMemberSearch(search),
    tab: readOneOf(search.tab, CHAT_TABS),
    q: readSearchText(search.q),
    status: readOneOf(search.status, CHAT_STATUS_FILTERS),
    sort: readOneOf(search.sort, CHAT_ROOM_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    ...readOpenSearch(search),
    message: readSearchText(search.message),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-chat")({
  validateSearch: readChatSearch,
  // Opening a room's window is not a new list.
  loaderDeps: ({ search: { open: _open, message: _message, member: _member, ...list } }) => list,
  loader: ({ deps }) =>
    loadPomodoroChatPage({
      tab: deps.tab ?? "rooms",
      search: deps.q ?? "",
      status: deps.status ?? "all",
      sort: deps.sort ?? "last",
      direction: deps.direction ?? "desc",
      page: deps.page ?? 1,
    }),
  component: AdminPomodoroChatRoute,
  errorComponent: routeErrorComponent(getSafetyErrorMessage),
})

function AdminPomodoroChatRoute() {
  const { list, pageSize, liveRooms, held } = Route.useLoaderData()
  return (
    <AdminChatDashboard
      initial={list}
      initialPageSize={pageSize}
      liveRooms={liveRooms}
      held={held}
    />
  )
}
