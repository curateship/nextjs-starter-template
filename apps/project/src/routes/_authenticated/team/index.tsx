import { createFileRoute, redirect } from "@tanstack/react-router"

import { TeamDashboardScreen } from "@/components/project/team-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"
import { loadTeamScreen, readTeamSearch, teamLoaderDeps } from "@/lib/project/team-route"

/**
 * An employee's Team dashboard: their own team, its calendar of check-ins and
 * meetings, and one day's check-ins. The site admin is on no team, so they go
 * to Teams and open a team from there (Tyler, 19 Oct 2026).
 */
export const Route = createFileRoute("/_authenticated/team/")({
  validateSearch: readTeamSearch,
  // The address is read again here because the signed-in route above passes
  // every value through, so a value this route refused would otherwise still arrive.
  loaderDeps: ({ search }) => teamLoaderDeps(search),
  loader: async ({ deps, parentMatchPromise }) => {
    const { user } = (await parentMatchPromise).loaderData ?? {}
    if (user?.role === "admin") throw redirect({ to: "/teams", replace: true })
    return loadTeamScreen(deps)
  },
  head: ({ matches }) => pageTitleHead("Team", matches),
  component: TeamRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function TeamRoute() {
  const { data, checkins, meetings, figures } = Route.useLoaderData()
  return (
    <TeamDashboardScreen
      data={data}
      checkins={checkins}
      meetings={meetings}
      figures={figures}
      search={Route.useSearch()}
    />
  )
}
