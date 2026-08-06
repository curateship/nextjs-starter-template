import { createFileRoute } from "@tanstack/react-router"

import { AdminAnnouncementsDashboard } from "@/components/admin/admin-announcements-dashboard"
import {
  getAnnouncementErrorMessage,
  loadAdminAnnouncements,
} from "@/lib/api/announcements"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { routeErrorComponent } from "@/components/shell/route-error"

export const ANNOUNCEMENT_SORT_COLUMNS = [
  "title",
  "where",
  "status",
  "shows",
] as const

type AnnouncementsSearch = {
  open?: string
  q?: string
  sort?: (typeof ANNOUNCEMENT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/**
 * `?open=<id>` is how the Overview links to one announcement; the rest
 * is the list state, so Back returns the exact list you left. Every value is
 * checked before use.
 */
function readAnnouncementsSearch(
  search: Record<string, unknown>
): AnnouncementsSearch {
  return {
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, ANNOUNCEMENT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/announcements")({
  validateSearch: readAnnouncementsSearch,
  loader: () => loadAdminAnnouncements(),
  component: AdminAnnouncementsRoute,
  errorComponent: routeErrorComponent(getAnnouncementErrorMessage),
})

function AdminAnnouncementsRoute() {
  const { announcements } = Route.useLoaderData()
  const { open } = Route.useSearch()

  return (
    <AdminAnnouncementsDashboard announcements={announcements} openId={open} />
  )
}
