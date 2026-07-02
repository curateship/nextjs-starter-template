import { createFileRoute } from "@tanstack/react-router"

import { WorkspacesDashboard } from "@/components/workspaces-dashboard"
import { loadWorkspaces } from "@/lib/api/workspaces"

export const Route = createFileRoute("/_authenticated/workspaces")({
  loader: () => loadWorkspaces(),
  component: WorkspacesRoute,
})

function WorkspacesRoute() {
  const { workspaces } = Route.useLoaderData()
  return <WorkspacesDashboard initialWorkspaces={workspaces} />
}
