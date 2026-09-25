import { createFileRoute } from "@tanstack/react-router"

import { AdminUsageDashboard } from "@/components/admin/admin-usage-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getUsageErrorMessage, loadAdminUsage } from "@/lib/api/billing/usage"

export const Route = createFileRoute("/_authenticated/admin/ai-usage")({
  loader: loadAdminUsage,
  component: AdminUsageRoute,
  errorComponent: routeErrorComponent(getUsageErrorMessage),
})

function AdminUsageRoute() {
  return <AdminUsageDashboard data={Route.useLoaderData()} />
}
