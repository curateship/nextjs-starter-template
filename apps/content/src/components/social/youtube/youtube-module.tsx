import * as React from "react"
import { ListHeader } from "@/components/content-app/list-header"
import { ProjectMenuButton } from "@/components/content-app/project-top"
import { ArrowLeftIcon, LayoutTemplateIcon, MessageSquareIcon, PlusIcon } from "lucide-react"

import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { AppCommentsTable } from "@/components/social/phone-apps/app-tables"
import { InboxAnswer } from "@/components/social/phone-apps/inbox-answer"
import { ProjectColumns } from "@/components/social/projects/project-columns"
import { JobsWindow } from "@/components/social/reddit/jobs-window"
import { DashboardCardHeader, DashboardCardHeaderIcon, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { NetworkPaneColumns, useNetworkPanes, withPaneTabs, NetworkTabs } from "@/components/content-app/network-panes"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ProjectHeaderLead } from "@/components/social/projects/project-header-lead"
import { getProjectErrorMessage, putAccountInProject, takeAccountOutOfProject } from "@/lib/api/social/projects"
import { getYoutubeErrorMessage, loadYoutubeModule, type YoutubeModuleView } from "@/lib/api/social/youtube"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { showErrorToast } from "@/lib/toast/error-toast"

import { channelName } from "@/lib/social/youtube/options"
import { cn } from "@/lib/utils"

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
  // Content's Voices and Accounts tabs (`network-panes.tsx`).
  const panes = useNetworkPanes()
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

  // Content's Voices and Accounts tabs after the network's own (`network-panes.tsx`).
  const paneTabs = withPaneTabs(
    panes,
    tab,
    (next) => onSearch({ view: next === "comments" ? "comments" : undefined, comment: undefined }),
    [
      { value: "posts", label: "Posts", count: view ? view.posts.length : undefined },
      { value: "comments", label: "Comments", count: view ? view.comments.filter((row) => row.status === "open").length : undefined },
    ]
  )
  // The left of the one header (`ListHeader`, which every list here draws, the tables too): the
  // project's controls, and the network's own list dropdown, which lands after the search icon.
  const tabs = (
    <span className="flex min-w-0 items-center gap-1">
      <PanelReopenButton side="left" label="Show the Projects page" />
      <ProjectHeaderLead />
      <NetworkTabs tabs={paneTabs} />
    </span>
  )
  // Voices or Accounts, in place of this network's own lists.
  if (panes?.pane) {
    return (
      <NetworkPaneColumns
        panes={{ ...panes, pane: panes.pane }}
        tabs={tabs}
        left={left}
        dialogs={dialogs}
      />
    )
  }

  // Description templates are a tab of the project's ⋮ (Tyler, 27 Nov 2026: "This should be in here"),
  // each opening the Templates window, as does New template.
  const templateActions = guest
    ? undefined
    : {
        title: "Templates",
        items: [
          ...(view?.templates ?? []).map((template) => ({
            label: `${template.name} · ${template.sections.length} ${template.sections.length === 1 ? "section" : "sections"}`,
            icon: <LayoutTemplateIcon className="size-4" />,
            onClick: () => onSearch({ window: "templates" }),
          })),
          { label: "New template", icon: <PlusIcon className="size-4" />, onClick: () => onSearch({ window: "templates" }) },
        ],
      }
  const controls = (
    <>
      {guest ? null : (
        <>
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
      )}
    </>
  )

  // The project's ⋮, last in the one header (`content-app/project-top.tsx`).
  const menu = <ProjectMenuButton actions={templateActions} jobs={guest ? null : { waiting: jobsWaiting, onOpen: () => onSearch({ window: "jobs" }) }} />

  const reading = error ? <ErrorRow message={error} onRetry={() => void refresh()} /> : <LoadingRow label="Reading this project's YouTube videos" />
  const middle = !view && tab !== "comments" ? (
    // Posts draw their own header while read too, so it is drawn once (`reading`).
    <YoutubePostsTable tabs={tabs} controls={controls} menu={menu} rows={[]} reading={reading} canManage={!guest} onRefresh={refresh} />
  ) : !view ? (
    // The one header stays while the list is read, so moving here from another tab never blanks it
    // (Tyler, 27 Nov 2026: "why does cliucking on promote flashes the page").
    <>
      <ListHeader tabs={tabs} primary={controls} end={menu} menuLabel="More for this list" search={null} massSelect={null} />
      {reading}
    </>
  ) : tab === "comments" ? (
    <AppCommentsTable
      network="youtube"
      tabs={tabs}
      controls={controls}
      menu={menu}
      rows={view.comments}
      selectedId={openComment}
      onOpen={(id) => onSearch({ comment: id })}
      onRefresh={refresh}
      emptyText="No comments yet. A channel on a phone reads them when YouTube's notification says one arrived; a channel in a browser reads them once a day with its numbers."
    />
  ) : (
    <YoutubePostsTable tabs={tabs} controls={controls} menu={menu} rows={view.posts} canManage={!guest} onRefresh={refresh} />
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
        {back ?? (
          <DashboardCardHeaderIcon>
            <MessageSquareIcon className="size-4" />
          </DashboardCardHeaderIcon>
        )}
        <span className={cn("min-w-0 flex-1 truncate", dashboardCardHeadingClassName)}>
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
        {back ?? (
          <DashboardCardHeaderIcon>
            <PlusIcon className="size-4" />
          </DashboardCardHeaderIcon>
        )}
        <span className={cn("min-w-0 flex-1 truncate", dashboardCardHeadingClassName)}>New YouTube video</span>
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
