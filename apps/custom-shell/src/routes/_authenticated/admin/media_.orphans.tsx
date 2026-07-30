import { createFileRoute } from "@tanstack/react-router"

import { MediaOrphansDashboard } from "@/components/media/media-orphans-dashboard"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { loadOrphans } from "@/lib/api/admin-media"

export const Route = createFileRoute("/_authenticated/admin/media_/orphans")({
  loader: () => loadOrphans(),
  component: AdminMediaOrphansRoute,
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
