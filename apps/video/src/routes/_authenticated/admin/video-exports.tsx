import { createFileRoute } from "@tanstack/react-router"

import { ExportsPage } from "@/components/video-editor/exports-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getExportErrorMessage, listExports } from "@/lib/api/video/exports"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"

export const EXPORT_SORT_COLUMNS = [
  "title",
  "project",
  "size",
  "length",
  "made",
] as const

type ExportsSearch = {
  q?: string
  sort?: (typeof EXPORT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list's own state, so Back returns the exact list you left. */
function readExportsSearch(search: Record<string, unknown>): ExportsSearch {
  return {
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, EXPORT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/video-exports")({
  validateSearch: readExportsSearch,
  // The search is answered by the server; sorting and paging happen here on
  // what it sends back.
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => listExports({ search: deps.q, pageSize: 100 }),
  component: AdminVideoExportsRoute,
  errorComponent: routeErrorComponent(getExportErrorMessage),
})

function AdminVideoExportsRoute() {
  return <ExportsPage initial={Route.useLoaderData()} />
}
