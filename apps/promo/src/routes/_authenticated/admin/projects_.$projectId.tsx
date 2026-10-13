import { createFileRoute } from "@tanstack/react-router"

import { ProjectsWorkspace } from "@/components/social/projects/workspace"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadFailedWords } from "@/lib/api/social/comments"
import { getProjectErrorMessage, loadProject } from "@/lib/api/social/projects"
import { loadKeywords } from "@/lib/api/social/reddit/keywords"

type ProjectSearch = { post?: string; retry?: string; newPost?: string }

/** Ids are ours, so anything that is not a short plain id is dropped. */
function id(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : undefined
}

/**
 * One project on the Projects dashboard: its description and accounts, its
 * keywords and their posts, and the comment box.
 *
 * The loader reads what the dashboard cannot draw without: this project with
 * its accounts and the queue, and its keywords.
 * The posts are fetched by the middle column, because a search takes tens of
 * seconds and a loader that waited for one would leave the page blank.
 *
 * `?post=<id>` opens that post, which is how the Today list and the bell
 * lead here. `?retry=<job id>` also puts a failed comment's words back in the
 * box, from the Comments screen's Failed tab; nothing is sent until Post is
 * pressed. `?newPost=<job id>` opens New post with a failed post's words.
 */
export const Route = createFileRoute("/_authenticated/admin/projects_/$projectId")({
  validateSearch: (search: Record<string, unknown>): ProjectSearch => ({
    post: id(search.post),
    retry: id(search.retry),
    newPost: id(search.newPost),
  }),
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
  const { post, newPost } = Route.useSearch()
  // Keyed by the project, so moving to another one starts every column
  // afresh rather than showing the last project's posts and clicked account.
  return (
    <ProjectsWorkspace
      key={view.project.id}
      initialView={view}
      initialKeywords={keywords}
      openPostId={retry?.findId ?? post ?? null}
      retry={retry}
      newPostRetryId={newPost ?? null}
    />
  )
}
