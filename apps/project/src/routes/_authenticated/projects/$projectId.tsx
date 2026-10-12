import { createFileRoute } from "@tanstack/react-router"

import { ProjectRouteError } from "@/components/project/project-route-error"
import { ProjectWorkspace } from "@/components/project/project-workspace"
import { loadProject } from "@/lib/api/project/projects"
import { readTaskFilters, type TaskFilters } from "@/lib/project/task-filters"
import { pageTitleHead } from "@/lib/project/page-title"

type ProjectSearch = TaskFilters & {
  /** The task open in the middle panel, so a bell notice can open it. */
  task?: string
  /** Opens the Chat tab, for a project chat's bell notice. */
  chat?: 1
}

function readProjectSearch(search: Record<string, unknown>): ProjectSearch {
  const result: ProjectSearch = readTaskFilters(search)
  if (typeof search.task === "string" && search.task.length <= 36) result.task = search.task
  if (search.chat === 1 || search.chat === "1") result.chat = 1
  return result
}

/** One project: details, tasks and members, side by side. */
export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  validateSearch: readProjectSearch,
  // Opening a task must not reload the project under it; the window loads its own.
  loaderDeps: () => ({}),
  loader: ({ params }) => loadProject(params.projectId),
  head: ({ loaderData, matches }) => pageTitleHead(loaderData?.project.name ?? "Project", matches),
  component: ProjectRoute,
  errorComponent: ProjectRouteError,
})

function ProjectRoute() {
  const page = Route.useLoaderData()
  const { task, chat, ...filters } = Route.useSearch()
  return (
    <ProjectWorkspace
      key={page.project.id}
      page={page}
      openTaskId={task}
      filters={filters}
      openChat={chat === 1}
    />
  )
}
