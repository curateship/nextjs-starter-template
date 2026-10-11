import { createFileRoute } from "@tanstack/react-router"

import { ProjectWorkspace } from "@/components/project/project-workspace"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadProject } from "@/lib/api/project/projects"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { readTaskFilters, type TaskFilters } from "@/lib/project/task-filters"

type ProjectSearch = TaskFilters & {
  /** The task open in the middle panel, so a bell notice can open it. */
  task?: string
}

function readProjectSearch(search: Record<string, unknown>): ProjectSearch {
  const result: ProjectSearch = readTaskFilters(search)
  if (typeof search.task === "string" && search.task.length <= 36) result.task = search.task
  return result
}

/** One project: details, tasks and members, side by side. */
export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  validateSearch: readProjectSearch,
  // Opening a task must not reload the project under it; the window loads its own.
  loaderDeps: () => ({}),
  loader: ({ params }) => loadProject(params.projectId),
  component: ProjectRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function ProjectRoute() {
  const page = Route.useLoaderData()
  const { task, ...filters } = Route.useSearch()
  return (
    <ProjectWorkspace key={page.project.id} page={page} openTaskId={task} filters={filters} />
  )
}
