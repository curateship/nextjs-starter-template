import { createFileRoute } from "@tanstack/react-router"

import { AdminReferralsDashboard } from "@/components/admin/admin-referrals-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getReferralErrorMessage,
  loadAdminReferrals,
} from "@/lib/api/billing/referrals"

export const Route = createFileRoute("/_authenticated/admin/referrals")({
  loader: loadAdminReferrals,
  component: AdminReferralsRoute,
  errorComponent: routeErrorComponent(getReferralErrorMessage),
})

function AdminReferralsRoute() {
  return <AdminReferralsDashboard initialData={Route.useLoaderData()} />
}
