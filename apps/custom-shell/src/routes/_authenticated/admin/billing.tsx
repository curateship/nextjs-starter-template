import { createFileRoute } from "@tanstack/react-router"

import { AdminRevenueDashboard } from "@/components/admin/admin-revenue-dashboard"
import { loadRevenue } from "@/lib/api/admin-users"

export const Route = createFileRoute("/_authenticated/admin/billing")({
  loader: async () => ({ summary: await loadRevenue() }),
  component: AdminBillingRoute,
})

function AdminBillingRoute() {
  const { summary } = Route.useLoaderData()
  return <AdminRevenueDashboard summary={summary} />
}
