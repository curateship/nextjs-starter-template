import { createFileRoute } from "@tanstack/react-router"

import { ProjectsDashboard } from "@/components/project/projects-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadProjectsDashboard } from "@/lib/api/project/projects"
import { getProjectErrorMessage } from "@/lib/project/errors"

/** The Projects dashboard: the projects I can see, and any invites for me. */
export const Route = createFileRoute("/_authenticated/projects/")({
  loader: () => loadProjectsDashboard(),
  component: ProjectsRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function ProjectsRoute() {
  return <ProjectsDashboard page={Route.useLoaderData()} />
}
