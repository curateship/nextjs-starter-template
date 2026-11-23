import { createFileRoute } from "@tanstack/react-router"

import { ProjectsDashboard } from "@/components/project/projects-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { ssrUnlessBare } from "@/lib/layout/dashboard-place"
import { loadProject, loadProjectsDashboard } from "@/lib/api/project/projects"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"
import { readProjectsFilter, restoreProjectsFilter, type ProjectsFilter } from "@/lib/project/projects-filter"
import { readId } from "@/lib/project/team-route"

type ProjectsSearch = ProjectsFilter & {
  /** The project whose settings window is open, from the row's cog. */
  settings?: string
}

function readSearch(search: Record<string, unknown>): ProjectsSearch {
  const settings = readId(search.settings)
  return { ...readProjectsFilter(search), ...(settings ? { settings } : {}) }
}

/** The Projects dashboard: the projects I can see. */
export const Route = createFileRoute("/_authenticated/projects/")({
  validateSearch: readSearch,
  // A bare address is drawn in the browser, which knows the remembered filter.
  ssr: ssrUnlessBare,
  beforeLoad: ({ search, location, matches, cause }): void =>
    restoreProjectsFilter({ search, location, matches, cause }),
  // Only the team is filtered on the server; client, category and group sort
  // the rows already loaded, so changing them never reloads the page.
  loaderDeps: ({ search }) => ({ team: search.team, settings: search.settings }),
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
  const search = Route.useSearch()
  return (
    <ProjectsDashboard
      page={page}
      settings={settings}
      filter={readProjectsFilter(search)}
      onFilter={(patch) =>
        void navigate({ search: (previous) => readSearch({ ...previous, ...patch }), replace: true })
      }
      onSettings={(projectId) =>
        navigate({ search: (previous) => ({ ...previous, settings: projectId ?? undefined }), replace: true })
      }
    />
  )
}
