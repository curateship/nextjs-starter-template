import { createFileRoute } from "@tanstack/react-router"

import { ProjectsDashboard } from "@/components/project/projects-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadProject, loadProjectsDashboard } from "@/lib/api/project/projects"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"
import { readId } from "@/lib/project/team-route"

type ProjectsSearch = {
  /** The site admin's team filter: one team's projects instead of every team's. */
  team?: string
  /** The project whose settings window is open, from the row's cog. */
  settings?: string
}


function readSearch(search: Record<string, unknown>): ProjectsSearch {
  const team = readId(search.team)
  const settings = readId(search.settings)
  return { ...(team ? { team } : {}), ...(settings ? { settings } : {}) }
}

/** The Projects dashboard: the projects I can see. */
export const Route = createFileRoute("/_authenticated/projects/")({
  validateSearch: readSearch,
  loaderDeps: ({ search }) => readSearch(search),
  loader: async ({ deps }) => {
    const [page, settings] = await Promise.all([
      loadProjectsDashboard(deps.team),
      deps.settings ? loadProject(deps.settings) : null,
    ])
    return { page, settings }
  },
  head: ({ matches }) => pageTitleHead("Projects", matches),
  component: ProjectsRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function ProjectsRoute() {
  const navigate = Route.useNavigate()
  const { page, settings } = Route.useLoaderData()
  return (
    <ProjectsDashboard
      page={page}
      settings={settings}
      onTeamFilter={(team) => void navigate({ search: team ? { team } : {}, replace: true })}
      onSettings={(projectId) =>
        navigate({ search: (previous) => ({ ...previous, settings: projectId ?? undefined }), replace: true })
      }
    />
  )
}
