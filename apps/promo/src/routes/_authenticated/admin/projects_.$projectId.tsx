import { createFileRoute } from "@tanstack/react-router"

import { ProjectsWorkspace } from "@/components/social/projects/workspace"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadFailedWords } from "@/lib/api/social/comments"
import { getProjectErrorMessage, loadProject } from "@/lib/api/social/projects"
import { loadKeywords } from "@/lib/api/social/reddit/keywords"
import { readProjectSearch, type ProjectRouteSearch } from "@/lib/social/project-address"

/**
 * One project's dashboard: its description and its networks, each a card
 * with two rows, Posts and Commenting, and the picked row's panels beside
 * them (`workspace/tasks/Projects/commenting-dashboard.md`).
 *
 * The loader reads what the dashboard cannot draw without: the project with
 * its accounts and the queue, and its Reddit keywords. The posts are fetched
 * by the middle column, because a search takes tens of seconds and a loader
 * that waited for one would leave the page blank.
 *
 * The address is read by `readProjectSearch`, and `sideOf` says whether it
 * opens Posts or Commenting. `?post=<id>` opens that Reddit post on
 * Commenting, which is how the bell leads there; `?retry=<job id>` also puts a
 * failed comment's words back in the box, and `?newPost=<job id>` opens New
 * post with a failed post's words. Nothing is sent until Post is pressed.
 */
export const Route = createFileRoute("/_authenticated/admin/projects_/$projectId")({
  validateSearch: (search: Record<string, unknown>): ProjectRouteSearch => readProjectSearch(search),
  loaderDeps: ({ search }) => ({ retry: search.retry }),
  loader: async ({ params, deps }) => {
    const [view, keywords, retry] = await Promise.all([
      loadProject(params.projectId),
      loadKeywords(params.projectId),
      deps.retry ? loadFailedWords(deps.retry) : null,
    ])
    return { view, keywords, retry }
  },
  errorComponent: routeErrorComponent(getProjectErrorMessage),
  component: ProjectRoute,
})

function ProjectRoute() {
  const { view, keywords, retry } = Route.useLoaderData()
  const { post, newPost, retry: retryId, ...search } = Route.useSearch()
  // Keyed by the project, so moving to another one starts every column
  // afresh rather than showing the last project's posts and picked account.
  // Try again lands with words to put back, so it is keyed by that too.
  return (
    <ProjectsWorkspace
      key={`${view.project.id}:${retryId ?? ""}:${newPost ?? ""}`}
      initialView={view}
      initialKeywords={keywords}
      search={search}
      openPostId={retry?.findId ?? post ?? null}
      retry={retry}
      newPostRetryId={newPost ?? null}
    />
  )
}
