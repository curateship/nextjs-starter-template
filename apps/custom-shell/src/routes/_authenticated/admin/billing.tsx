import { createFileRoute } from "@tanstack/react-router"

import { AdminRevenueDashboard } from "@/components/admin/admin-revenue-dashboard"
import {
  getAdminUserErrorMessage,
  loadBillingAdmin,
} from "@/lib/api/admin-users"
import { routeErrorComponent } from "@/components/shell/route-error"

export const Route = createFileRoute("/_authenticated/admin/billing")({
  loader: async () => loadBillingAdmin(),
  component: AdminBillingRoute,
  errorComponent: routeErrorComponent(getAdminUserErrorMessage),
})

function AdminBillingRoute() {
  const { summary, disputes } = Route.useLoaderData()
  return <AdminRevenueDashboard summary={summary} disputes={disputes} />
}
