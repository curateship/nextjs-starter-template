import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { LibrariesPage } from "@/components/note-library/libraries-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { LoadingRow } from "@/components/ui/loading-row"
import { saveXPostLink } from "@/lib/api/note/imports"
import { getLibraryErrorMessage, loadLibraries } from "@/lib/api/note/library"
import { LIBRARY_SAYS } from "@/lib/note/library/notes"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Library screen: every library this person has. Here rather than under
 * `/admin`, so every signed-in member gets it, as Notes did. `?save=` is the
 * Save from x.com button's link: the post is imported into the library opened
 * last, and that library opens on it.
 */
export const Route = createFileRoute("/_authenticated/library/")({
  validateSearch: (search: Record<string, unknown>) => ({
    // Only ever read as a post's address.
    save: typeof search.save === "string" && search.save.length <= 2048 ? search.save : undefined,
    // The button's own key, so only a button made for this person saves.
    key: typeof search.key === "string" && /^[0-9a-f]{32}$/.test(search.key) ? search.key : undefined,
  }),
  loader: async () => ({ libraries: await loadLibraries() }),
  component: LibraryRoute,
  errorComponent: routeErrorComponent(getLibraryErrorMessage),
})

function LibraryRoute() {
  const { libraries } = Route.useLoaderData()
  const { save, key } = Route.useSearch()
  if (save) return <SavingFromX link={save} saveKey={key} />
  return <LibrariesPage libraries={libraries} />
}

/** The Save from x.com button landed here: import the post, then open it in its library. */
function SavingFromX({ link, saveKey }: { link: string; saveKey: string | undefined }) {
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
    saveXPostLink(link, saveKey)
      .then((result) => {
        toast.success(result.alreadyThere ? "That post is already in this library." : "Importing the post.")
        void navigate({
          to: "/library/$libraryId",
          params: { libraryId: result.note.libraryId },
          search: { folder: result.note.folderId ?? "loose", open: result.note.id },
          replace: true,
        })
      })
      .catch((error) => {
        showErrorToast(getLibraryErrorMessage(error))
        void navigate({ to: "/library", search: { save: undefined, key: undefined }, replace: true })
      })
  }, [link, navigate, saveKey])
  return <LoadingRow label="Importing the post" />
}
