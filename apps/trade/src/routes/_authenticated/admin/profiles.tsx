import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle, useTradePageTitle } from "@/app/page-title"
import { routeErrorComponent } from "@/components/shell/route-error"
import { AdminProfilesPage } from "@/components/social/admin-profiles"
import {
  getPublicProfileErrorMessage,
  loadAdminProfiles,
} from "@/lib/api/trade/public-profiles"

/**
 * Every saved public trader profile, with its reports, for an admin to hide
 * or show again. The link to it goes in the admin sidebar by hand, like every
 * other admin page here.
 */
export const Route = createFileRoute("/_authenticated/admin/profiles")({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Profiles") }],
  }),
  gcTime: 0,
  loader: () => loadAdminProfiles(),
  component: AdminProfilesRoute,
  errorComponent: routeErrorComponent(getPublicProfileErrorMessage),
})

function AdminProfilesRoute() {
  useTradePageTitle("Profiles")
  return <AdminProfilesPage initial={Route.useLoaderData()} />
}
