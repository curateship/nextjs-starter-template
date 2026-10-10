import { createFileRoute } from "@tanstack/react-router"

import { TeamDashboard } from "@/components/project/team-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadMyTeamInvites, loadTeamDashboardPage } from "@/lib/api/project/teams"
import { getProjectErrorMessage } from "@/lib/project/errors"

/** The Team dashboard: settings, members and pending invites. */
export const Route = createFileRoute("/_authenticated/team")({
  loader: async () => {
    const data = await loadTeamDashboardPage()
    return { data, invites: data ? [] : await loadMyTeamInvites() }
  },
  component: TeamRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function TeamRoute() {
  const { data, invites } = Route.useLoaderData()
  return <TeamDashboard data={data} invites={invites} />
}
