import { createFileRoute } from "@tanstack/react-router"

import { LibraryDashboard } from "@/components/note-library/library-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getLibraryErrorMessage, loadLibrary } from "@/lib/api/note/library"
import { loadNotes } from "@/lib/api/note/notes"
import { filtersOf, readLibrarySearch, scopeOf, sortOf } from "@/lib/note/library/address"

/**
 * One library's dashboard: folders and authors on the left, its notes in the
 * middle, the open note on the right. The folder, author, search, filters,
 * saved view, sort and open note live in the address, so a reload and a bell notice
 * come back to the same place.
 */
export const Route = createFileRoute("/_authenticated/library/$libraryId")({
  validateSearch: readLibrarySearch,
  // Picking a folder, a filter or a note never reloads the page under it; the
  // dashboard asks for what it needs itself.
  loaderDeps: () => ({}),
  loader: async ({ params, location }) => {
    const search = readLibrarySearch(location.search as Record<string, unknown>)
    const [page, list] = await Promise.all([
      loadLibrary(params.libraryId),
      loadNotes({
        libraryId: params.libraryId,
        scope: scopeOf(search),
        search: search.q,
        filters: filtersOf(search),
        sort: sortOf(search),
      }),
    ])
    return { page, list }
  },
  component: LibraryRoute,
  errorComponent: routeErrorComponent(getLibraryErrorMessage),
})

function LibraryRoute() {
  const { libraryId } = Route.useParams()
  const initial = Route.useLoaderData()
  // A new library is a new dashboard, so nothing of the last one carries over.
  return <LibraryDashboard key={libraryId} libraryId={libraryId} initial={initial} />
}
