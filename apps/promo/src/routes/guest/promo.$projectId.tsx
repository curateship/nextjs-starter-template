import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { ProjectsWorkspace, type ProjectSearch } from "@/components/social/projects/workspace"
import { GuestContext, type PromoGuest } from "@/components/social/guest/guest-mode"
import { GuestNotice } from "@/components/social/guest/guest-notice"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"
import { loadFailedWords } from "@/lib/api/social/comments"
import { loadGuestSession } from "@/lib/api/social/project-guests"
import { loadProject } from "@/lib/api/social/projects"
import { loadKeywords } from "@/lib/api/social/reddit/keywords"
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
 * One Promo project's dashboard for a guest sent from Project
 * (`workspace/docs/project-guests.md`). It is the admin page's dashboard,
 * `/admin/projects/<id>`, in a frame of its own: no left menu and no way to
 * any other project, with every control a guest may not use hidden through
 * `GuestContext`. The server refuses those calls anyway.
 *
 * The address keeps the same `?network=`, `?view=` and the rest as the
 * admin page, so the dashboard behaves the same.
 */
export const Route = createFileRoute("/guest/promo/$projectId")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    network: isNetwork(search.network) ? search.network : undefined,
    view: oneOf(search.view, ["commented", "skipped", "today", "comments"] as const),
    list: oneOf(search.list, ["failed", "posts"] as const),
    replies: id(search.replies),
    comment: id(search.comment),
    window: undefined,
    post: id(search.post),
    retry: id(search.retry),
    newPost: id(search.newPost),
  }),
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
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus | null>(null)
  const value = React.useMemo<PromoGuest>(
    () => ({ name: guest.name ?? "", projectId: view.project.id, reportSaveStatus: setSaveStatus }),
    [guest.name, view.project.id]
  )

  const dashboard = (
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

  return (
    <div className="flex h-dvh flex-col bg-muted/60">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-sidebar px-4">
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{view.project.name}</span>
          {guest.name ? <span className="text-muted-foreground"> · Working as {guest.name} via Project</span> : null}
        </p>
        {saveStatus === "saving" ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
            Saving…
          </span>
        ) : saveStatus === "saved" ? (
          <span className="text-xs text-muted-foreground">Saved</span>
        ) : null}
      </header>
      <main className="flex min-h-0 flex-1 flex-col p-2 md:p-3">
        {/* An admin opening this address sees the dashboard as an admin, with nothing hidden. */}
        {guest.name ? <GuestContext.Provider value={value}>{dashboard}</GuestContext.Provider> : dashboard}
      </main>
    </div>
  )
}

function GuestProjectError() {
  return (
    <GuestNotice
      title="You are not signed in to this project"
      text="Your sign-in from Project lasts 12 hours, or it was for another project. Open the task in Project again and press Open in Promo."
    />
  )
}
