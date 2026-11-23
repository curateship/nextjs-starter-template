import { createFileRoute, redirect } from "@tanstack/react-router"

import { TeamMembersPage } from "@/components/project/team-members"
import { TeamStart } from "@/components/project/team-start"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadTeamDashboardPage } from "@/lib/api/project/teams"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"

/** Everyone on the team, opened from Manage on the Team dashboard. */
export const Route = createFileRoute("/_authenticated/team/members")({
  loader: async ({ parentMatchPromise }) => {
    const { user } = (await parentMatchPromise).loaderData ?? {}
    if (user?.role === "admin") throw redirect({ to: "/teams", replace: true })
    const data = await loadTeamDashboardPage()
    return { data }
  },
  head: ({ matches }) => pageTitleHead("Members", matches),
  component: MembersRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function MembersRoute() {
  const { data } = Route.useLoaderData()
  return data ? <TeamMembersPage data={data} /> : <TeamStart />
}
