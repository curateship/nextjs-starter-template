import { createFileRoute } from "@tanstack/react-router"

import { CapacityDashboard } from "@/components/capacity-dashboard"
import { requireAdminRoute } from "@/lib/admin-route"
import { loadCapacitySummary } from "@/lib/api/capacity"

export const Route = createFileRoute("/_authenticated/admin/capacity")({
  loader: async () => {
    await requireAdminRoute()
    return loadCapacitySummary()
  },
  component: CapacityRoute,
})

function CapacityRoute() {
  return <CapacityDashboard initialSummary={Route.useLoaderData()} />
}
