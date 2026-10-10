import { createFileRoute } from "@tanstack/react-router"

import { AdminUploadsDashboard } from "@/components/pomodoro/admin-uploads-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getMemberFilesErrorMessage, loadPomodoroUploadsPage } from "@/lib/api/pomodoro/admin-uploads-tags"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import {
  UPLOAD_PURPOSE_FILTERS,
  UPLOAD_SORT_COLUMNS,
  readMemberSearch,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"
import {
  UPLOAD_SHARING_FILTERS,
  type UploadSharingFilter,
} from "@/lib/pomodoro/shared-media-reports"

type UploadsSearch = {
  q?: string
  purpose?: (typeof UPLOAD_PURPOSE_FILTERS)[number]
  user?: string
  /** All, shared, waiting for a first check, or taken off (task 05). */
  sharing?: UploadSharingFilter
  member?: string
  sort?: (typeof UPLOAD_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, plus `?user=` for one owner and `?member=` for the member window. */
function readUploadsSearch(search: Record<string, unknown>): UploadsSearch {
  return {
    ...readMemberSearch(search),
    q: readSearchText(search.q),
    purpose: readOneOf(search.purpose, UPLOAD_PURPOSE_FILTERS),
    user: readUserFilter(search.user),
    sharing: readOneOf(search.sharing, UPLOAD_SHARING_FILTERS),
    sort: readOneOf(search.sort, UPLOAD_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/pomodoro-uploads")({
  validateSearch: readUploadsSearch,
  // No `loaderDeps`: the table refetches in place as the address changes.
  loader: ({ location }) => {
    const search = readUploadsSearch(location.search as Record<string, unknown>)
    return loadPomodoroUploadsPage({
      search: search.q ?? "",
      purpose: search.purpose ?? "all",
      user: search.user,
      sharing: search.sharing ?? "all",
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminPomodoroUploadsRoute,
  errorComponent: routeErrorComponent(getMemberFilesErrorMessage),
})

function AdminPomodoroUploadsRoute() {
  const { list, pageSize } = Route.useLoaderData()
  return <AdminUploadsDashboard initial={list} initialPageSize={pageSize} />
}
