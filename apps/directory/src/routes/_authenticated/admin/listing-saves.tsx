import { createFileRoute } from "@tanstack/react-router"

import { SavesDashboard } from "@/components/directory/saves-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getSaveErrorMessage,
  loadSavesAdmin,
  SAVED_COLLECTION_SORT_COLUMNS,
  type SavedListsSearch,
} from "@/lib/api/directory/saves"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"

function readSavedListsSearch(
  search: Record<string, unknown>
): SavedListsSearch {
  return {
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, SAVED_COLLECTION_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    size: readOneOf(
      String(search.size),
      DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String)
    )
      ? Number(search.size)
      : undefined,
    ...readOpenSearch(search),
  }
}

export const Route = createFileRoute("/_authenticated/admin/listing-saves")({
  validateSearch: readSavedListsSearch,
  loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
  loader: ({ deps }) =>
    loadSavesAdmin({
      search: deps.q,
      sort: deps.sort,
      direction: deps.direction,
      page: deps.page,
      limit: deps.size,
    }),
  component: ListingSavesRoute,
  errorComponent: routeErrorComponent(getSaveErrorMessage),
})

function ListingSavesRoute() {
  return (
    <SavesDashboard data={Route.useLoaderData()} search={Route.useSearch()} />
  )
}
