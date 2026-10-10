import { createFileRoute } from "@tanstack/react-router"

import { TeamMembersPage } from "@/components/project/team-members"
import { TeamStart } from "@/components/project/team-start"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadMyTeamInvites, loadTeamDashboardPage } from "@/lib/api/project/teams"
import { getProjectErrorMessage } from "@/lib/project/errors"

/** Everyone on the team and the pending invites, opened from Manage on the Team dashboard. */
export const Route = createFileRoute("/_authenticated/team/members")({
  loader: async () => {
    const data = await loadTeamDashboardPage()
    return { data, invites: data ? [] : await loadMyTeamInvites() }
  },
  component: MembersRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function MembersRoute() {
  const { data, invites } = Route.useLoaderData()
  return data ? <TeamMembersPage data={data} /> : <TeamStart invites={invites} />
}
