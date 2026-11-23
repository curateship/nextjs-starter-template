import * as React from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"

import { NoLibraryDashboard } from "@/components/note-library/library-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { LoadingRow } from "@/components/ui/loading-row"
import { saveLinkToLibrary } from "@/lib/api/note/imports"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { loadLastLibraryId } from "@/lib/api/note/library-page"
import { LIBRARY_SAYS } from "@/lib/note/library/notes"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * `/library`, the left menu's Library link. Here rather than under `/admin`,
 * so every signed-in member gets it, as Notes did. It opens the Library
 * dashboard on the library opened last (Tyler, 15 Nov 2026: the list of
 * libraries lives in the dashboard's left panel now, and this table went).
 * Somebody with none sees the dashboard with only New library.
 *
 * `?save=` is the link the Save to Note button or the iPhone Shortcut sends:
 * it is imported into the library opened last, and that library opens on it.
 */
export const Route = createFileRoute("/_authenticated/library/")({
  validateSearch: (search: Record<string, unknown>) => ({
    // Only ever read as a link to import.
    save: typeof search.save === "string" && search.save.length <= 2048 ? search.save : undefined,
    // The button's own key, so only a button made for this person saves.
    key: typeof search.key === "string" && /^[0-9a-f]{32}$/.test(search.key) ? search.key : undefined,
  }),
  loaderDeps: ({ search }) => ({ saving: Boolean(search.save) }),
  loader: async ({ deps }) => {
    if (deps.saving) return null
    const last = await loadLastLibraryId()
    if (last) throw redirect({ to: "/library/$libraryId", params: { libraryId: last }, search: {}, replace: true })
    return null
  },
  component: LibraryRoute,
  errorComponent: routeErrorComponent(getLibraryErrorMessage),
})

function LibraryRoute() {
  const { save, key } = Route.useSearch()
  if (save) return <SavingLink link={save} saveKey={key} />
  return <NoLibraryDashboard />
}

/** The Save to Note button or the iPhone Shortcut landed here: import the link, then open it in its library. */
function SavingLink({ link, saveKey }: { link: string; saveKey: string | undefined }) {
  const navigate = useNavigate()
  const started = React.useRef(false)
  React.useEffect(() => {
    // Once, even when React runs effects twice while developing.
    if (started.current) return
    started.current = true
    if (!saveKey) {
      showErrorToast(LIBRARY_SAYS.saveKeyWrong)
      void navigate({ to: "/library", search: { save: undefined, key: undefined }, replace: true })
      return
    }
    saveLinkToLibrary(link, saveKey)
      .then((result) => {
        void navigate({
          to: "/library/$libraryId",
          params: { libraryId: result.note.libraryId },
          search: { open: result.note.id },
          replace: true,
        })
      })
      .catch((error) => {
        showErrorToast(getLibraryErrorMessage(error))
        void navigate({ to: "/library", search: { save: undefined, key: undefined }, replace: true })
      })
  }, [link, navigate, saveKey])
  return <LoadingRow label="Importing the link" />
}
