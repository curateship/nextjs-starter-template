import { createFileRoute } from "@tanstack/react-router"

import { AdminMembershipDashboard } from "@/components/admin/admin-membership-dashboard"
import { getMembershipErrorMessage, loadMembership } from "@/lib/api/membership"
import { routeErrorComponent } from "@/components/shell/route-error"

export const Route = createFileRoute("/_authenticated/admin/membership")({
  loader: async () => ({ summary: await loadMembership() }),
  component: AdminMembershipRoute,
  errorComponent: routeErrorComponent(getMembershipErrorMessage),
})

function AdminMembershipRoute() {
  const { summary } = Route.useLoaderData()

  return <AdminMembershipDashboard summary={summary} />
}
