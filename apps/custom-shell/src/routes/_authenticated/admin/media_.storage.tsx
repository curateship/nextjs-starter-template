import { createFileRoute } from "@tanstack/react-router"

import { MediaStorageDashboard } from "@/components/media/media-storage-dashboard"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { loadStorage } from "@/lib/api/admin-media"

export const Route = createFileRoute("/_authenticated/admin/media_/storage")({
  loader: () => loadStorage(),
  component: AdminMediaStorageRoute,
})

function AdminMediaStorageRoute() {
  const runtime = useShellRuntime()

  return (
    <MediaStorageDashboard
      initialData={Route.useLoaderData()}
      defaultPageSize={runtime.config.dashboardRowsPerPage}
    />
  )
}
