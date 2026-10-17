import { createFileRoute, redirect } from "@tanstack/react-router"

import { ProjectsPage } from "@/components/video-editor/projects-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getProjectErrorMessage,
  listProjects,
} from "@/lib/api/video/projects"
import { listActors } from "@/lib/api/video/actors"
import { listProjectFolders } from "@/lib/api/video/project-folders"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import { ARCHIVED_PROJECTS, NO_FOLDER } from "@/lib/video/project-folders"

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
  /** A folder's id, `none` for the projects in no folder, or `archived`. */
  folder?: string
  /** Only projects with a first frame of this actor. */
  actor?: string
}

/** Only the shape of an id or a word; whether it is theirs is the loader's job. */
function readId(value: unknown) {
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
    folder: readId(search.folder),
    actor: readId(search.actor),
  }
}

export const Route = createFileRoute("/_authenticated/admin/video-editor/")({
  validateSearch: readProjectsSearch,
  loaderDeps: ({ search }) => ({
    q: search.q,
    folder: search.folder,
    actor: search.actor,
  }),
  loader: async ({ deps }) => {
    const archived = deps.folder === ARCHIVED_PROJECTS
    const folderId = archived
      ? undefined
      : deps.folder === NO_FOLDER
        ? null
        : deps.folder
    const [list, folders, actors] = await Promise.all([
      listProjects({
        search: deps.q,
        pageSize: 100,
        folderId,
        archived,
        actorId: deps.actor,
      }),
      listProjectFolders(),
      listActors(),
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
    return { list, folders, actors: actors.actors }
  },
  component: AdminVideoProjectsRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function AdminVideoProjectsRoute() {
  const { list, folders, actors } = Route.useLoaderData()
  return <ProjectsPage initial={list} folders={folders} actors={actors} />
}
