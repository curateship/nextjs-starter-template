import { createFileRoute } from "@tanstack/react-router"

import { ProjectsWorkspace } from "@/components/social/projects/workspace"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getProjectErrorMessage, loadProject, loadProjects } from "@/lib/api/social/projects"
import { loadKeywords } from "@/lib/api/social/reddit/keywords"

/**
 * One project on the Projects dashboard: its description and accounts, its
 * keywords and their posts, and the comment box.
 *
 * The loader reads what the dashboard cannot draw without: the projects for
 * the picker, this project with its accounts and the queue, and its keywords.
 * The posts are fetched by the middle column, because a search takes tens of
 * seconds and a loader that waited for one would leave the page blank.
 */
export const Route = createFileRoute("/_authenticated/admin/projects_/$projectId")({
  loader: async ({ params }) => {
    const [projects, view, keywords] = await Promise.all([
      loadProjects(),
      loadProject(params.projectId),
      loadKeywords(params.projectId),
    ])
    return { projects, view, keywords }
  },
  errorComponent: routeErrorComponent(getProjectErrorMessage),
  component: ProjectRoute,
})

function ProjectRoute() {
  const { projects, view, keywords } = Route.useLoaderData()
  // Keyed by the project, so moving to another one starts every column
  // afresh rather than showing the last project's posts and clicked account.
  return (
    <ProjectsWorkspace
      key={view.project.id}
      projects={projects}
      initialView={view}
      initialKeywords={keywords}
    />
  )
}
