import { createFileRoute, redirect } from "@tanstack/react-router"

import { CarouselProjectsPage } from "@/components/carousel-studio/carousel-projects-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getCarouselProjectErrorMessage,
  listCarouselProjectFolders,
  listCarouselProjects,
} from "@/lib/api/video/carousel-projects"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import { ARCHIVED_PROJECTS, NO_FOLDER } from "@/lib/video/project-folders"

const SORT_COLUMNS = ["name", "carousels", "slides", "format", "updated"] as const

/** Only the shape of an id or a word; whether it is theirs is the loader's job. */
function readId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,36}$/.test(value) ? value : undefined
}

/** The list's own state, so Back returns the exact list you left. */
function readSearch(search: Record<string, unknown>) {
  return {
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    /** A folder's id, `none` for the projects in no folder, or `archived`. */
    folder: readId(search.folder),
  }
}

/** The carousel projects table (workspace/docs/carousel-project-carousels.md). */
export const Route = createFileRoute("/_authenticated/admin/video-carousels/")({
  validateSearch: readSearch,
  loaderDeps: ({ search }) => ({ q: search.q, folder: search.folder }),
  loader: async ({ deps }) => {
    const archived = deps.folder === ARCHIVED_PROJECTS
    const folderId = archived ? undefined : deps.folder === NO_FOLDER ? null : deps.folder
    const [list, folders] = await Promise.all([
      listCarouselProjects({ search: deps.q, pageSize: 100, folderId, archived }),
      listCarouselProjectFolders(),
    ])
    // The folder in the address is gone; show every project instead.
    if (folderId && !folders.some((folder) => folder.id === folderId)) {
      throw redirect({
        from: "/admin/video-carousels/",
        to: "/admin/video-carousels",
        search: (previous) => ({ ...previous, folder: undefined, page: undefined }),
        replace: true,
      })
    }
    return { list, folders }
  },
  component: VideoCarouselsRoute,
  errorComponent: routeErrorComponent(getCarouselProjectErrorMessage),
})

// TanStack route files export Route beside their page component.
// eslint-disable-next-line react-refresh/only-export-components
function VideoCarouselsRoute() {
  const { list, folders } = Route.useLoaderData()
  return <CarouselProjectsPage initial={list} folders={folders} />
}
