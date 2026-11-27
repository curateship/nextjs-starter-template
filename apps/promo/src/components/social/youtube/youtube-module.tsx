import * as React from "react"
import { ArrowLeftIcon, LayoutTemplateIcon, ListChecksIcon, PlusIcon } from "lucide-react"

import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { AppCommentsTable } from "@/components/social/phone-apps/app-tables"
import { InboxAnswer } from "@/components/social/phone-apps/inbox-answer"
import { ProjectBackButton } from "@/components/social/projects/project-back"
import { ProjectColumns } from "@/components/social/projects/project-columns"
import { JobsWindow } from "@/components/social/reddit/jobs-window"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getProjectErrorMessage, putAccountInProject, takeAccountOutOfProject } from "@/lib/api/social/projects"
import { getYoutubeErrorMessage, loadYoutubeModule, type YoutubeModuleView } from "@/lib/api/social/youtube"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { showErrorToast } from "@/lib/toast/error-toast"

import { channelName } from "@/lib/social/youtube/options"

import { YoutubeChannelPicker } from "./youtube-channel-picker"
import { YoutubeComposer } from "./youtube-composer"
import { YoutubePostsTable } from "./youtube-posts-table"
import { YoutubeTemplatesWindow } from "./youtube-templates-window"

/** How often to ask what the queue is doing, while it is doing something. */
const POLL_MS = 2_000

/** What the module keeps in the address: its tab, an open comment, and the Jobs or Templates window. */
export type YoutubeSearch = {
  /** "comments" is the Comments tab, the comments under your videos; none is Posts. */
  view?: "comments"
  comment?: string
  window?: "jobs" | "templates"
}

/**
 * YouTube as a module on a project's dashboard (YouTube task), what fills the
 * middle and right columns when YouTube is picked in the project's left
 * column. It copies Instagram's module (`phone-apps/app-module.tsx`).
 *
 * The middle column is two tabs: Posts, every video and Short this project
 * uploaded with its numbers, and Comments, what people wrote under them. Its
 * header holds Templates (the project's description templates), Jobs and New
 * post. The right column is a new upload with the channel it goes up as, or,
 * with a comment open, that comment and the answer to it.
 *
 * YouTube has no Commenting row: finding other people's videos to comment on
 * was not picked (26 Nov 2026). Every upload and answer is a job a person
 * pressed for, run once in the channel's browser or on its phone.
 */
export function YoutubeModule({
  projectId,
  left,
  dialogs,
  search,
  onSearch,
}: {
  projectId: string
  /** The project's own column, drawn on the left. */
  left: React.ReactNode
  /** The page's own windows: New project and Delete. */
  dialogs: React.ReactNode
  search: YoutubeSearch
  onSearch: (patch: YoutubeSearch) => void
}) {
  const desktop = useWideScreen()
  // A guest sent from Project looks at the module and answers comments; uploads and templates are the owner's.
  const guest = usePromoGuest()
  const tab = search.view === "comments" ? "comments" : "posts"
  const openComment = tab === "comments" ? (search.comment ?? null) : null
  const [view, setView] = React.useState<YoutubeModuleView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  /** The channel picked above Post. Nothing is picked to begin with. */
  const [accountId, setAccountId] = React.useState<string | null>(null)
  /** Below 1280px the new upload takes the screen once asked for. */
  const [composing, setComposing] = React.useState(false)

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadYoutubeModule(projectId).then(
        (next) => {
          setView(next)
          setError(null)
        },
        (failure: unknown) => setError(getYoutubeErrorMessage(failure))
      ),
    [projectId]
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // An upload takes minutes and finishes without telling anybody, so the
  // module asks while the queue has something in it, and stops when it empties.
  const working = view ? view.jobs.queued + view.jobs.running > 0 : false
  React.useEffect(() => {
    if (!working) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh, working])

  const channel = view?.channels.find((row) => row.id === accountId) ?? null
  const comment = view?.comments.find((row) => row.id === openComment) ?? null
  const jobsWaiting = view ? view.jobs.queued + view.jobs.running : 0

  const tabs = (
    <>
      <ProjectBackButton />
      <DashboardTabs
        value={tab}
        onValueChange={(next) => onSearch({ view: next === "comments" ? "comments" : undefined, comment: undefined })}
        tabs={[
          { value: "posts", label: "Posts", count: view ? view.posts.length : undefined },
          { value: "comments", label: "Comments", count: view ? view.comments.filter((row) => row.status === "open").length : undefined },
        ]}
      />
    </>
  )

  const controls = guest ? null : (
    <>
      <DashboardToolbarButton type="button" variant="outline" onClick={() => onSearch({ window: "templates" })} aria-label="Description templates">
        <LayoutTemplateIcon className="size-4" />
        <span className="hidden sm:inline">Templates</span>
        {view?.templates.length ? <span className="text-muted-foreground tabular-nums">{view.templates.length}</span> : null}
      </DashboardToolbarButton>
      <DashboardToolbarButton
        type="button"
        variant="outline"
        onClick={() => onSearch({ window: "jobs" })}
        aria-label={jobsWaiting ? `Jobs, ${jobsWaiting} running or waiting` : "Jobs"}
      >
        <ListChecksIcon className="size-4" />
        <span className="hidden sm:inline">Jobs</span>
        {jobsWaiting ? <span className="text-muted-foreground tabular-nums">{jobsWaiting}</span> : null}
      </DashboardToolbarButton>
      <DashboardToolbarButton
        type="button"
        onClick={() => {
          onSearch({ comment: undefined })
          setComposing(true)
        }}
      >
        <PlusIcon className="size-4" />
        New post
      </DashboardToolbarButton>
    </>
  )

  const middle = !view ? (
    error ? (
      <ErrorRow message={error} onRetry={() => void refresh()} />
    ) : (
      <LoadingRow label="Reading this project's YouTube videos" />
    )
  ) : tab === "comments" ? (
    <AppCommentsTable
      network="youtube"
      tabs={tabs}
      controls={controls}
      rows={view.comments}
      selectedId={openComment}
      onOpen={(id) => onSearch({ comment: id })}
      onRefresh={refresh}
      emptyText="No comments yet. A channel on a phone reads them when YouTube's notification says one arrived; a channel in a browser reads them once a day with its numbers."
    />
  ) : (
    <YoutubePostsTable tabs={tabs} controls={controls} rows={view.posts} canManage={!guest} onRefresh={refresh} />
  )

  const channelPicker = view ? (
    <YoutubeChannelPicker
      channels={view.channels}
      freeAccounts={view.freeAccounts}
      selectedId={channel?.id ?? null}
      onSelect={setAccountId}
      onAdd={async (added) => {
        try {
          await putAccountInProject(projectId, added)
          await refresh()
        } catch (failure) {
          showErrorToast(getProjectErrorMessage(failure))
        }
      }}
      onRemove={async (removed) => {
        try {
          await takeAccountOutOfProject(removed)
          if (removed === accountId) setAccountId(null)
          await refresh()
        } catch (failure) {
          showErrorToast(getProjectErrorMessage(failure))
        }
      }}
    />
  ) : null

  const back = desktop ? null : (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label="Back to the list"
      onClick={() => {
        setComposing(false)
        onSearch({ comment: undefined })
      }}
    >
      <ArrowLeftIcon />
    </Button>
  )

  const right = comment ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardHeader>
        {back}
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {comment.author} under a video by {channelName(comment.account.handle)}
        </span>
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          <InboxAnswer
            key={comment.id}
            item={comment}
            onChanged={async (gone) => {
              if (gone) onSearch({ comment: undefined })
              await refresh()
            }}
          />
        </div>
      </ScrollArea>
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardHeader>
        {back}
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">New YouTube video</span>
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        {!view ? (
          <LoadingRow label="Reading the channels" />
        ) : guest ? (
          <p className="p-4 text-sm text-muted-foreground">Uploads to YouTube are made by the project&apos;s owner. Open a comment on the Comments tab to answer it.</p>
        ) : (
          <YoutubeComposer
            projectId={projectId}
            channel={channel}
            templates={view.templates}
            channelPicker={channelPicker}
            onPosted={async () => {
              setComposing(false)
              onSearch({ view: undefined, comment: undefined })
              await refresh()
            }}
          />
        )}
      </ScrollArea>
    </div>
  )

  return (
    <ProjectColumns
      left={left}
      middle={middle}
      right={right}
      rightOpen={Boolean(comment) || composing}
      onCloseRight={() => {
        setComposing(false)
        onSearch({ comment: undefined })
      }}
      rightLabel={comment ? "Show the comment and your answer" : "Show the new upload"}
    >
      {dialogs}
      <JobsWindow
        open={search.window === "jobs" && !guest}
        onClose={() => {
          onSearch({ window: undefined })
          void refresh()
        }}
      />
      {view && !guest ? (
        <YoutubeTemplatesWindow
          open={search.window === "templates"}
          projectId={projectId}
          templates={view.templates}
          onClose={() => onSearch({ window: undefined })}
          onChanged={refresh}
        />
      ) : null}
    </ProjectColumns>
  )
}
