import { createFileRoute } from "@tanstack/react-router"

import { ProjectWorkspace } from "@/components/project/project-workspace"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadProject } from "@/lib/api/project/projects"
import { getProjectErrorMessage } from "@/lib/project/errors"

type ProjectSearch = {
  /** The task whose window is open, so a bell notice can open it. */
  task?: string
}

function readProjectSearch(search: Record<string, unknown>): ProjectSearch {
  return typeof search.task === "string" && search.task.length <= 36
    ? { task: search.task }
    : {}
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
  const { task } = Route.useSearch()
  return <ProjectWorkspace key={page.project.id} page={page} openTaskId={task} />
}
