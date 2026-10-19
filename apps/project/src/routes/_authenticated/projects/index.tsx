import { createFileRoute } from "@tanstack/react-router"

import { ProjectsDashboard } from "@/components/project/projects-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadProjectsDashboard } from "@/lib/api/project/projects"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"
import { readId } from "@/lib/project/team-route"

type ProjectsSearch = {
  /** The site admin's team filter: one team's projects instead of every team's. */
  team?: string
}


function readSearch(search: Record<string, unknown>): ProjectsSearch {
  const team = readId(search.team)
  return team ? { team } : {}
}

/** The Projects dashboard: the projects I can see. */
export const Route = createFileRoute("/_authenticated/projects/")({
  validateSearch: readSearch,
  loaderDeps: ({ search }) => readSearch(search),
  loader: ({ deps }) => loadProjectsDashboard(deps.team),
  head: ({ matches }) => pageTitleHead("Projects", matches),
  component: ProjectsRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function ProjectsRoute() {
  const navigate = Route.useNavigate()
  return (
    <ProjectsDashboard
      page={Route.useLoaderData()}
      onTeamFilter={(team) => void navigate({ search: team ? { team } : {}, replace: true })}
    />
  )
}
