import { createFileRoute } from "@tanstack/react-router"

import { ProjectsPage } from "@/components/video-editor/projects-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getProjectErrorMessage,
  listProjects,
} from "@/lib/api/video/projects"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"

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
}

/** The list's own state, so Back returns the exact list you left. */
function readProjectsSearch(search: Record<string, unknown>): ProjectsSearch {
  return {
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, PROJECT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/video-editor/")({
  validateSearch: readProjectsSearch,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => listProjects({ search: deps.q, pageSize: 100 }),
  component: AdminVideoProjectsRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function AdminVideoProjectsRoute() {
  return <ProjectsPage initial={Route.useLoaderData()} />
}
