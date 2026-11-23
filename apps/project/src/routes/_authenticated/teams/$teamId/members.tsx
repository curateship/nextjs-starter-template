import { createFileRoute } from "@tanstack/react-router"

import { TeamMembersPage } from "@/components/project/team-members"
import { TeamRouteError } from "@/components/project/project-route-error"
import { loadTeamDashboardPage } from "@/lib/api/project/teams"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"
import { TeamScope } from "@/lib/project/team-scope"

/** Everyone on one team, for the site admin: opened from Manage on its dashboard, or from Teams. */
export const Route = createFileRoute("/_authenticated/teams/$teamId/members")({
  loader: async ({ params }) => {
    const data = await loadTeamDashboardPage(params.teamId)
    if (!data) throw new Error(PROJECT_ERRORS.teamNotFound)
    return { data }
  },
  head: ({ matches }) => pageTitleHead("Members", matches),
  component: MembersRoute,
  errorComponent: TeamRouteError,
})

function MembersRoute() {
  const { teamId } = Route.useParams()
  const { data } = Route.useLoaderData()
  return (
    <TeamScope teamId={teamId}>
      <TeamMembersPage data={data} />
    </TeamScope>
  )
}
