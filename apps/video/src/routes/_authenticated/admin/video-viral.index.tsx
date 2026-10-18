import { createFileRoute, redirect } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { ViralProjectsPage } from "@/components/video-viral/viral-projects-page"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import { loadViralProjects } from "@/lib/api/video/viral-projects"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import { ARCHIVED_PROJECTS, NO_FOLDER } from "@/lib/video/project-folders"

export const VIRAL_PROJECT_SORT_COLUMNS = [
  "name",
  "videos",
  "units",
  "updated",
] as const

type ViralListSearch = {
  q?: string
  sort?: (typeof VIRAL_PROJECT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
  /** A folder's id, `none` for the projects in no folder, or `archived`. */
  folder?: string
}

/** Only the shape of an id or a word; whether it is theirs is the loader's job. */
function readId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,36}$/.test(value)
    ? value
    : undefined
}

/**
 * Viral: the list of projects, one niche each. The list's own state lives in
 * the address, so Back returns the exact list you left.
 */
export const Route = createFileRoute("/_authenticated/admin/video-viral/")({
  validateSearch: (search: Record<string, unknown>): ViralListSearch => ({
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, VIRAL_PROJECT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    folder: readId(search.folder),
  }),
  loaderDeps: ({ search }) => ({ q: search.q, folder: search.folder }),
  loader: async ({ deps }) => {
    const archived = deps.folder === ARCHIVED_PROJECTS
    const folderId = archived
      ? undefined
      : deps.folder === NO_FOLDER
        ? null
        : deps.folder
    const data = await loadViralProjects({ search: deps.q, folderId, archived })
    // The folder in the address is gone: the list shows every project
    // rather than an empty folder.
    if (folderId && !data.folders.some((folder) => folder.id === folderId)) {
      throw redirect({
        from: "/admin/video-viral/",
        to: "/admin/video-viral",
        search: (previous) => ({ ...previous, folder: undefined, page: undefined }),
        replace: true,
      })
    }
    return data
  },
  component: AdminViralProjectsRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function AdminViralProjectsRoute() {
  const { projects, folders } = Route.useLoaderData()
  return <ViralProjectsPage projects={projects} folders={folders} />
}
