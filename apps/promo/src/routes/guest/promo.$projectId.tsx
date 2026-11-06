import { createFileRoute } from "@tanstack/react-router"

import { ProjectsWorkspace } from "@/components/social/projects/workspace"
import { GuestFrame, GuestProjectError } from "@/components/social/guest/guest-frame"
import { loadFailedWords } from "@/lib/api/social/comments"
import { loadGuestSession } from "@/lib/api/social/project-guests"
import { loadProject } from "@/lib/api/social/projects"
import { loadKeywords } from "@/lib/api/social/reddit/keywords"
import { readProjectSearch, type ProjectRouteSearch } from "@/lib/social/project-address"

/**
 * One Promo project's dashboard for a guest sent from Project
 * (`workspace/docs/project-guests.md`). It is the admin page's dashboard,
 * `/admin/projects/<id>`, in a frame of its own: no left menu and no way to
 * any other project, with every control a guest may not use hidden through
 * `GuestContext`. The server refuses those calls anyway.
 *
 * The address keeps the same keys as the admin page, so each network's
 * Posts and Commenting rows behave the same.
 */
export const Route = createFileRoute("/guest/promo/$projectId")({
  validateSearch: (search: Record<string, unknown>): ProjectRouteSearch => ({ ...readProjectSearch(search), window: undefined }),
  loaderDeps: ({ search }) => ({ retry: search.retry }),
  loader: async ({ params, deps }) => {
    const [guest, view, keywords, retry] = await Promise.all([
      loadGuestSession(params.projectId),
      loadProject(params.projectId),
      loadKeywords(params.projectId),
      deps.retry ? loadFailedWords(deps.retry) : null,
    ])
    return { guest, view, keywords, retry }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.view.project.name} · Promo` : "Promo" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GuestProjectRoute,
  errorComponent: GuestProjectError,
})

function GuestProjectRoute() {
  const { guest, view, keywords, retry } = Route.useLoaderData()
  const { post, newPost, retry: retryId, ...search } = Route.useSearch()
  return (
    <GuestFrame projectId={view.project.id} projectName={view.project.name} guestName={guest.name ?? ""}>
      <ProjectsWorkspace
        key={`${view.project.id}:${retryId ?? ""}:${newPost ?? ""}`}
        initialView={view}
        initialKeywords={keywords}
        search={search}
        openPostId={retry?.findId ?? post ?? null}
        retry={retry}
        newPostRetryId={newPost ?? null}
      />
    </GuestFrame>
  )
}
