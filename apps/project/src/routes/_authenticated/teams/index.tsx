import { createFileRoute, redirect } from "@tanstack/react-router"

import { TeamStart } from "@/components/project/team-start"
import { TeamsDashboard } from "@/components/project/teams-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadTeamDashboardPage, loadTeams } from "@/lib/api/project/teams"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"
import { readId } from "@/lib/project/team-route"

type TeamsSearch = { settings?: string }

/**
 * The site admin's Teams dashboard. `?settings=<id>` has that team's settings
 * window open, loaded here so a change made in it reloads what it shows. An
 * employee has one team, so they go to it.
 */
export const Route = createFileRoute("/_authenticated/teams/")({
  validateSearch: (search: Record<string, unknown>): TeamsSearch => {
    const settings = readId(search.settings)
    return settings ? { settings } : {}
  },
  loaderDeps: ({ search }) => ({ settings: readId(search.settings) }),
  loader: async ({ deps, parentMatchPromise }) => {
    const { user } = (await parentMatchPromise).loaderData ?? {}
    if (user?.role !== "admin") throw redirect({ to: "/team", replace: true })
    const [teams, settings] = await Promise.all([
      loadTeams(),
      deps.settings ? loadTeamDashboardPage(deps.settings) : null,
    ])
    return { teams, settings }
  },
  head: ({ matches }) => pageTitleHead("Teams", matches),
  component: TeamsRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function TeamsRoute() {
  const { teams, settings } = Route.useLoaderData()
  return teams.length ? <TeamsDashboard teams={teams} settings={settings} /> : <TeamStart />
}
