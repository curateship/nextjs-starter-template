import { createFileRoute } from "@tanstack/react-router"

import { LibraryDashboard } from "@/components/note-library/library-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getLibraryErrorMessage, loadLibraries, loadLibrary } from "@/lib/api/note/library"
import { loadNotes } from "@/lib/api/note/notes"
import { filtersOf, readLibrarySearch, scopeOf, sortOf } from "@/lib/note/library/address"

/**
 * The Library dashboard on one library: the person's page with every library
 * on the left, this library's notes in the middle, the open note on the
 * right. The tab, Show choice, folder, author, search, filters, saved view,
 * sort and open note live in the address, so a reload and a bell notice come
 * back to the same place.
 */
export const Route = createFileRoute("/_authenticated/library/$libraryId")({
  validateSearch: readLibrarySearch,
  // Picking a folder, a filter or a note never reloads the page under it; the
  // dashboard asks for what it needs itself.
  loaderDeps: () => ({}),
  loader: async ({ params, location }) => {
    const search = readLibrarySearch(location.search as Record<string, unknown>)
    const [libraries, page, list] = await Promise.all([
      loadLibraries(),
      loadLibrary(params.libraryId),
      loadNotes({
        libraryId: params.libraryId,
        scope: scopeOf(search),
        search: search.q,
        filters: filtersOf(search),
        sort: sortOf(search),
      }),
    ])
    return { libraries, page, list }
  },
  component: LibraryRoute,
  errorComponent: routeErrorComponent(getLibraryErrorMessage),
})

function LibraryRoute() {
  const { libraryId } = Route.useParams()
  const initial = Route.useLoaderData()
  // Not keyed by the library: one frame for every library, so the left page
  // stays while another is picked (the Admin 3 panel design).
  return <LibraryDashboard libraryId={libraryId} initial={initial} />
}
