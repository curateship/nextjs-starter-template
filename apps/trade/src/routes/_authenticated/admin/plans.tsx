import { createFileRoute } from "@tanstack/react-router"

import { AdminPlansDashboard } from "@/components/admin-plans-dashboard"
import { loadAdminPlans } from "@/lib/api/admin-plans"

export const Route = createFileRoute("/_authenticated/admin/plans")({
  loader: async () => ({ plans: await loadAdminPlans() }),
  component: AdminPlansRoute,
})

function AdminPlansRoute() {
  const { plans } = Route.useLoaderData()
  return <AdminPlansDashboard initialPlans={plans} />
}
