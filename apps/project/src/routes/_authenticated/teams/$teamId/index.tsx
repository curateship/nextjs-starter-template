import { createFileRoute } from "@tanstack/react-router"

import { TeamDashboardScreen } from "@/components/project/team-dashboard"
import { TeamRouteError } from "@/components/project/project-route-error"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"
import { loadTeamScreen, readTeamSearch, teamLoaderDeps } from "@/lib/project/team-route"
import { TeamScope } from "@/lib/project/team-scope"

/** One team's dashboard for the site admin, opened from Teams. The address names the team. */
export const Route = createFileRoute("/_authenticated/teams/$teamId/")({
  validateSearch: readTeamSearch,
  loaderDeps: ({ search }) => teamLoaderDeps(search),
  loader: async ({ deps, params }) => {
    const screen = await loadTeamScreen(deps, params.teamId)
    // A deleted team, or an old link to one, says so rather than offering to start a team.
    if (!screen.data) throw new Error(PROJECT_ERRORS.teamNotFound)
    return screen
  },
  head: ({ matches }) => pageTitleHead("Team", matches),
  component: TeamRoute,
  errorComponent: TeamRouteError,
})

function TeamRoute() {
  const { teamId } = Route.useParams()
  const { data, checkins, meetings, figures } = Route.useLoaderData()
  return (
    <TeamScope teamId={teamId}>
      <TeamDashboardScreen
        data={data}
        checkins={checkins}
        meetings={meetings}
        figures={figures}
        search={Route.useSearch()}
      />
    </TeamScope>
  )
}
