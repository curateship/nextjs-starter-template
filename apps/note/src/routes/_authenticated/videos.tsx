import { createFileRoute } from "@tanstack/react-router"

import { VideosPage } from "@/components/note-videos/videos-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadFolders } from "@/lib/api/note/folders"
import { getNoteErrorMessage, loadVideos } from "@/lib/api/note/videos"
import { NO_FOLDER, type FolderScope } from "@/lib/note/videos"

const ID = /^[\w-]{1,36}$/

function readFolder(value: unknown): FolderScope {
  if (value === NO_FOLDER) return NO_FOLDER
  return typeof value === "string" && ID.test(value) ? value : undefined
}

/**
 * The videos dashboard. Here rather than under `/admin`, because the shell's
 * admin layout turns every non-admin away and Tyler wanted members in
 * (17 Oct 2026). `?folder=` and `?open=` keep the folder and the picked video
 * in the address, so a reload and a bell notice come back to the same place.
 */
export const Route = createFileRoute("/_authenticated/videos")({
  validateSearch: (search: Record<string, unknown>) => ({
    folder: readFolder(search.folder),
    open: typeof search.open === "string" && ID.test(search.open) ? search.open : undefined,
  }),
  // Picking a folder or a video never reloads the page under it; the screen
  // asks for what it needs itself.
  loaderDeps: () => ({}),
  loader: async ({ location }) => {
    const folder = readFolder((location.search as Record<string, unknown>).folder)
    const [folders, page] = await Promise.all([loadFolders(), loadVideos({ folder })])
    return { folders, page, folder }
  },
  component: VideosRoute,
  errorComponent: routeErrorComponent(getNoteErrorMessage),
})

function VideosRoute() {
  const search = Route.useSearch()
  return <VideosPage initial={Route.useLoaderData()} folder={search.folder} open={search.open} />
}
