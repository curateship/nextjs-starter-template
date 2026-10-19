import { createFileRoute } from "@tanstack/react-router"

import { NotesPage } from "@/components/note-notes/notes-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getNotesErrorMessage, loadNotes, loadRecentNotes } from "@/lib/api/note/notes"
import { loadNoteFolders } from "@/lib/api/note/notes-folders"
import { isFixedScope, type NoteScope } from "@/lib/note/notes/notes"

const ID = /^[\w-]{1,36}$/

function readScope(value: unknown): NoteScope {
  return typeof value === "string" && (isFixedScope(value) || ID.test(value)) ? value : "all"
}

function readId(value: unknown) {
  return typeof value === "string" && ID.test(value) ? value : undefined
}

/**
 * The notes dashboard. Here rather than under `/admin`, like Videos, because
 * the shell's admin layout turns every non-admin away and every member gets
 * Notes (Tyler, 18 Oct 2026). `?folder=`, `?view=` and `?open=` keep the
 * folder, the saved view and the open note in the address, so a reload and a
 * reminder in the bell come back to the same place.
 */
export const Route = createFileRoute("/_authenticated/notes")({
  validateSearch: (search: Record<string, unknown>) => {
    const scope = readScope(search.folder)
    return {
      folder: scope === "all" ? undefined : scope,
      view: readId(search.view),
      open: readId(search.open),
    }
  },
  // Picking a folder, a view or a note never reloads the page under it; the
  // screen asks for what it needs itself.
  loaderDeps: () => ({}),
  loader: async ({ location }) => {
    const scope = readScope((location.search as Record<string, unknown>).folder)
    const [tree, list, recent] = await Promise.all([
      loadNoteFolders(),
      loadNotes({ scope }),
      loadRecentNotes(),
    ])
    return { tree, list, recent, scope }
  },
  component: NotesRoute,
  errorComponent: routeErrorComponent(getNotesErrorMessage),
})

function NotesRoute() {
  const search = Route.useSearch()
  return (
    <NotesPage
      initial={Route.useLoaderData()}
      scope={search.folder ?? "all"}
      viewId={search.view}
      open={search.open}
    />
  )
}
