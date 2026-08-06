import { createFileRoute } from "@tanstack/react-router"

import { SegmentsPage } from "@/components/broadcasts/segments-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getSegmentLoadErrorMessage,
  loadSegmentsPage,
} from "@/lib/api/contact-segments"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/list-search"
import { readOpenSearch } from "@/lib/use-open-from-link"

export const SEGMENT_SORT_COLUMNS = [
  "name",
  "kind",
  "people",
  "updated",
] as const

type SegmentsSearch = {
  open?: string
  q?: string
  sort?: (typeof SEGMENT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/**
 * `?open=<id>` names one segment to open; the rest is the list state, so Back
 * returns the exact list you left. Every value is checked before use.
 */
function readSegmentsSearch(
  search: Record<string, unknown>
): SegmentsSearch {
  return {
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, SEGMENT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/segments")({
  validateSearch: readSegmentsSearch,
  loader: () => loadSegmentsPage(),
  component: AdminSegmentsRoute,
  errorComponent: routeErrorComponent(getSegmentLoadErrorMessage),
})

function AdminSegmentsRoute() {
  const { open } = Route.useSearch()

  return <SegmentsPage initial={Route.useLoaderData()} openId={open} />
}
