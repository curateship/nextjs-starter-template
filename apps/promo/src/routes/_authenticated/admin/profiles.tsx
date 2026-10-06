import { createFileRoute } from "@tanstack/react-router"

import { ProfilesDashboard } from "@/components/browser/profiles-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getProfileErrorMessage, loadProfilesPage } from "@/lib/api/browser/profiles"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * Every browser profile: its proxy, whether its browser is open, who is signed
 * in inside it. `?open=<id>` opens one in its window, which is where the
 * Reddit dashboard's "Open Main" link leads.
 */
export const Route = createFileRoute("/_authenticated/admin/profiles")({
  validateSearch: readOpenSearch,
  loader: () => loadProfilesPage(),
  component: ProfilesRoute,
  errorComponent: routeErrorComponent(getProfileErrorMessage),
})

function ProfilesRoute() {
  const { open } = Route.useSearch()
  return <ProfilesDashboard initial={Route.useLoaderData()} openId={open} />
}
