import { createFileRoute } from "@tanstack/react-router"

import { ProjectsTable } from "@/components/social/projects/projects-table"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getProjectErrorMessage, loadProjectRows } from "@/lib/api/social/projects"

/**
 * Every project as a table, where Projects in the left menu leads. A row opens
 * the project's own dashboard at `/admin/projects/$projectId`.
 */
export const Route = createFileRoute("/_authenticated/admin/projects")({
  loader: () => loadProjectRows(),
  errorComponent: routeErrorComponent(getProjectErrorMessage),
  component: ProjectsRoute,
})

function ProjectsRoute() {
  return <ProjectsTable initial={Route.useLoaderData()} />
}
