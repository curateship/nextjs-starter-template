import { createFileRoute } from "@tanstack/react-router"

import { ProjectsWorkspace, type ProjectSearch } from "@/components/social/projects/workspace"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadFailedWords } from "@/lib/api/social/comments"
import { getProjectErrorMessage, loadProject } from "@/lib/api/social/projects"
import { loadKeywords } from "@/lib/api/social/reddit/keywords"
import { MEDIUM_VIEWS } from "@/lib/social/medium/options"
import { isNetwork } from "@/lib/social/networks"

type Search = ProjectSearch & { post?: string; retry?: string; newPost?: string }

/** Ids are ours, so anything that is not a short plain id is dropped. */
function id(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : undefined
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

/**
 * One project's dashboard: its description and networks, and the picked
 * network's panels.
 *
 * The loader reads what the dashboard cannot draw without: this project with
 * its accounts and the queue, and its keywords. The posts are fetched by the
 * middle column, because a search takes tens of seconds and a loader that
 * waited for one would leave the page blank.
 *
 * In the address: `?network=` is the network shown, `?view=` the middle
 * column's tab (`today`, `comments`, `commented` or `skipped`; none is To
 * look at), `?list=` Comments' own list, `?replies=<id>` a comment's Replies
 * window, `?comment=<id>` one comment, and `?window=jobs` the Jobs window.
 * `?post=<id>` opens that post, which is how the bell leads here. `?retry=<job id>` also puts a failed comment's words
 * back in the box; nothing is sent until Post is pressed. `?newPost=<job id>`
 * opens New post with a failed post's words. Medium's module keeps its own
 * tab as `?tab=` and the record open beside it as `?open=<id>`.
 */
export const Route = createFileRoute("/_authenticated/admin/projects_/$projectId")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    network: isNetwork(search.network) ? search.network : undefined,
    view: oneOf(search.view, ["commented", "skipped", "today", "comments"] as const),
    list: oneOf(search.list, ["failed", "posts"] as const),
    replies: id(search.replies),
    comment: id(search.comment),
    window: oneOf(search.window, ["jobs"] as const),
    post: id(search.post),
    retry: id(search.retry),
    newPost: id(search.newPost),
    tab: oneOf(search.tab, MEDIUM_VIEWS.filter((view) => view !== "new")),
    open: id(search.open),
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
  const { post, newPost, retry: retryId, ...search } = Route.useSearch()
  // Keyed by the project, so moving to another one starts every column
  // afresh rather than showing the last project's posts and picked account.
  // Try again lands on the same project with words to put back, so it is
  // keyed by that too and starts afresh with them.
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
