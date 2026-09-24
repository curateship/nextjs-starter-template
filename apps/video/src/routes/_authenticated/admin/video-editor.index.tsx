import { createFileRoute, redirect } from "@tanstack/react-router"

import { ProjectsPage } from "@/components/video-editor/projects-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getProjectErrorMessage,
  listProjects,
} from "@/lib/api/video/projects"
import { listProjectFolders } from "@/lib/api/video/project-folders"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import { NO_FOLDER } from "@/lib/video/project-folders"

export const PROJECT_SORT_COLUMNS = [
  "name",
  "clips",
  "length",
  "aspect",
  "updated",
] as const

type ProjectsSearch = {
  q?: string
  sort?: (typeof PROJECT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
  /** A folder's id, or `none` for the projects in no folder. */
  folder?: string
}

/** Only the shape of an id or `none`; whether it is theirs is the loader's job. */
function readFolder(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,36}$/.test(value)
    ? value
    : undefined
}

/** The list's own state, so Back returns the exact list you left. */
function readProjectsSearch(search: Record<string, unknown>): ProjectsSearch {
  return {
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, PROJECT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    folder: readFolder(search.folder),
  }
}

export const Route = createFileRoute("/_authenticated/admin/video-editor/")({
  validateSearch: readProjectsSearch,
  loaderDeps: ({ search }) => ({ q: search.q, folder: search.folder }),
  loader: async ({ deps }) => {
    const folderId = deps.folder === NO_FOLDER ? null : deps.folder
    const [list, folders] = await Promise.all([
      listProjects({ search: deps.q, pageSize: 100, folderId }),
      listProjectFolders(),
    ])
    // The folder in the address is gone: deleted here or in another tab, or
    // an old link. The list shows every project rather than an empty folder.
    if (folderId && !folders.some((folder) => folder.id === folderId)) {
      throw redirect({
        from: "/admin/video-editor/",
        to: "/admin/video-editor",
        search: (previous) => ({
          ...previous,
          folder: undefined,
          page: undefined,
        }),
        replace: true,
      })
    }
    return { list, folders }
  },
  component: AdminVideoProjectsRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function AdminVideoProjectsRoute() {
  const { list, folders } = Route.useLoaderData()
  return <ProjectsPage initial={list} folders={folders} />
}
