import { createFileRoute } from "@tanstack/react-router"

import { MediaOrphansDashboard } from "@/components/media/media-orphans-dashboard"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  getAdminMediaErrorMessage,
  loadOrphans,
} from "@/lib/api/admin-media"
import { routeErrorComponent } from "@/components/shell/route-error"

export const Route = createFileRoute("/_authenticated/admin/media_/orphans")({
  loader: () => loadOrphans(),
  component: AdminMediaOrphansRoute,
  errorComponent: routeErrorComponent(getAdminMediaErrorMessage),
})

function AdminMediaOrphansRoute() {
  const runtime = useShellRuntime()

  return (
    <MediaOrphansDashboard
      initialData={Route.useLoaderData()}
      defaultPageSize={runtime.config.dashboardRowsPerPage}
    />
  )
}
