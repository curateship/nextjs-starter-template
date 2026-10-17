import { createFileRoute } from "@tanstack/react-router"

import { AdminOverviewDashboard } from "@/components/admin/admin-overview-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAdminOverviewErrorMessage,
  loadAdminOverviewPage,
} from "@/lib/api/admin-overview"

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  loader: async () => ({ overview: await loadAdminOverviewPage() }),
  component: AdminOverviewRoute,
  errorComponent: routeErrorComponent(getAdminOverviewErrorMessage),
})

function AdminOverviewRoute() {
  const { overview } = Route.useLoaderData()

  return <AdminOverviewDashboard overview={overview} />
}
