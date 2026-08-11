import { createFileRoute } from "@tanstack/react-router"

import { NotificationsPage } from "@/components/admin/notifications-page"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  getNotificationErrorMessage,
  loadAdminNotificationsPage,
} from "@/lib/api/notification"
import { NOTIFICATION_TYPES } from "@/lib/notification-types"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import { routeErrorComponent } from "@/components/shell/route-error"

export const NOTIFICATION_READ_FILTERS = ["all", "unread", "read"] as const
export const NOTIFICATION_TYPE_FILTERS = [
  "all",
  ...NOTIFICATION_TYPES,
] as const
export const NOTIFICATION_SORT_COLUMNS = [
  "activity",
  "feedback",
  "recipient",
  "type",
  "status",
  "created",
] as const

type NotificationsSearch = {
  q?: string
  read?: (typeof NOTIFICATION_READ_FILTERS)[number]
  type?: (typeof NOTIFICATION_TYPE_FILTERS)[number]
  sort?: (typeof NOTIFICATION_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list state the address carries, every value checked before use. */
export function readNotificationsSearch(
  search: Record<string, unknown>
): NotificationsSearch {
  return {
    q: readSearchText(search.q),
    read: readOneOf(search.read, NOTIFICATION_READ_FILTERS),
    type: readOneOf(search.type, NOTIFICATION_TYPE_FILTERS),
    sort: readOneOf(search.sort, NOTIFICATION_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

// Admin access is enforced once by the /admin layout route.
export const Route = createFileRoute("/_authenticated/admin/notifications")({
  validateSearch: readNotificationsSearch,
  // Deliberately no `loaderDeps`: the address seeds the first render and the
  // table refetches in place from there, so watching it would fetch twice.
  //
  // No page size either: the server reads the configured rows-per-page and
  // sends it back, so the first page holds exactly what the table will show.
  loader: ({ location }) => {
    const search = readNotificationsSearch(
      location.search as Record<string, unknown>
    )
    return loadAdminNotificationsPage({
      search: search.q ?? "",
      read: search.read ?? "all",
      type: search.type ?? "all",
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: NotificationsRoute,
  errorComponent: routeErrorComponent(getNotificationErrorMessage),
})

function NotificationsRoute() {
  const { notifications, total, pageSize } = Route.useLoaderData()
  const runtime = useShellRuntime()

  return (
    <NotificationsPage
      initialNotifications={notifications}
      initialTotal={total}
      defaultPageSize={pageSize}
      onOpenFeedbackThread={runtime.onOpenFeedbackThread}
    />
  )
}
