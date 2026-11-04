import { createFileRoute, redirect } from "@tanstack/react-router"

import { WorkspacesDashboard } from "@/components/admin/workspaces-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getWorkspaceErrorMessage, loadWorkspaces } from "@/lib/api/people/workspaces"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { whoMayHaveWorkspaces } from "@/lib/app-options"

/**
 * An app that is one site has no page for managing its sites.
 *
 * The sidebar draws no switcher there, so nothing links here — but a typed
 * address answered anyway, and the page it drew offered New and Delete buttons
 * whose endpoints refuse. Sending it home is the honest answer, and it is the
 * same shape as the `/admin` guard: the route says no first, the server
 * functions say no again through `requireMayHaveWorkspace`.
 *
 * Checked in `beforeLoad` so the loader never runs, rather than after it: the
 * list read would otherwise happen on the way to being thrown away.
 */
export const Route = createFileRoute("/_authenticated/workspaces")({
  validateSearch: readOpenSearch,
  beforeLoad: () => {
    if (whoMayHaveWorkspaces() === "off") {
      throw redirect({ to: "/home", replace: true })
    }
  },
  loader: () => loadWorkspaces(),
  component: WorkspacesRoute,
  errorComponent: routeErrorComponent(getWorkspaceErrorMessage),
})

function WorkspacesRoute() {
  const { workspaces, baseDomain, copyChoices } = Route.useLoaderData()
  return (
    <WorkspacesDashboard
      initialWorkspaces={workspaces}
      baseDomain={baseDomain}
      copyChoices={copyChoices}
    />
  )
}
