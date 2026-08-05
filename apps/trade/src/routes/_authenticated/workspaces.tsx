import { createFileRoute } from "@tanstack/react-router"

import { WorkspacesDashboard } from "@/components/admin/workspaces-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getWorkspaceErrorMessage, loadWorkspaces } from "@/lib/api/workspaces"
import { readOpenSearch } from "@/lib/use-open-from-link"

export const Route = createFileRoute("/_authenticated/workspaces")({
  validateSearch: readOpenSearch,
  loader: () => loadWorkspaces(),
  component: WorkspacesRoute,
  errorComponent: routeErrorComponent(getWorkspaceErrorMessage),
})

function WorkspacesRoute() {
  const { workspaces } = Route.useLoaderData()
  return <WorkspacesDashboard initialWorkspaces={workspaces} />
}
