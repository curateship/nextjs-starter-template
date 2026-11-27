import * as React from "react"
import { ListHeader } from "@/components/content-app/list-header"
import { ProjectMenuButton } from "@/components/content-app/project-top"
import { ArrowLeftIcon, PlusIcon } from "lucide-react"

import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { JobsWindow } from "@/components/social/reddit/jobs-window"
import { ProjectColumns } from "@/components/social/projects/project-columns"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { NetworkPaneColumns, useNetworkPanes, withPaneTabs, NetworkTabs } from "@/components/content-app/network-panes"
import { ProjectHeaderLead } from "@/components/social/projects/project-header-lead"
import {
  getPhoneAppErrorMessage,
  loadAppModule,
  type AppModuleView,
} from "@/lib/api/social/phone-apps"
import { getProjectErrorMessage, putAccountInProject, takeAccountOutOfProject } from "@/lib/api/social/projects"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { handleWords, NETWORK_NAMES, type PhoneAppNetwork } from "@/lib/social/networks"
import { showErrorToast } from "@/lib/toast/error-toast"

import { AppAccountPicker } from "./app-account-picker"
import { AppCommentsTable, AppPostsTable } from "./app-tables"
import { InboxAnswer } from "./inbox-answer"
import { PostComposer } from "./post-composer"

/** How often to ask what the queue is doing, while it is doing something. */
const POLL_MS = 2_000

/** What the module keeps in the address: its tab, an open comment, and the Jobs window. */
export type AppSearch = {
  /** "comments" is the Comments tab, the comments under your own posts; none is Posts. */
  view?: "comments"
  comment?: string
  window?: "jobs"
}

/**
 * Instagram or TikTok as a module on a project's dashboard (phone farm file
 * 06), what fills the middle and right columns when the network is picked in
 * the project's left column, beside Reddit's own module.
 *
 * The middle column is two tabs: Posts, every photo and video this project
 * posted on the network with its numbers, and Comments, what people wrote
 * under them. The right column is a new post with the account it goes out
 * as, or, with a comment open, that comment and the answer to it.
 *
 * There is no search for posts to answer here. Tyler, 16 Oct 2026: "Skip the
 * searching for posts to answer. IG and tiktok is not reddit." Every post,
 * answer and profile change is a job a person pressed for, run on the
 * account's phone once.
 */
export function AppModule({
  network,
  projectId,
  left,
  dialogs,
  search,
  onSearch,
}: {
  network: PhoneAppNetwork
  projectId: string
  /** The project's own column, drawn on the left. */
  left: React.ReactNode
  /** The page's own windows: New project and Delete. */
  dialogs: React.ReactNode
  search: AppSearch
  onSearch: (patch: AppSearch) => void
}) {
  const desktop = useWideScreen()
  // A guest sent from Project answers the inbox and posts from the project's
  // archive only (Archive part 33): the media library is the owner's, and the
  // Jobs window lists every project's work.
  const guest = usePromoGuest()
  // Content's Voices and Accounts tabs (`network-panes.tsx`).
  const panes = useNetworkPanes()
  const tab = search.view === "comments" ? "comments" : "posts"
  const openComment = tab === "comments" ? (search.comment ?? null) : null
  const [view, setView] = React.useState<AppModuleView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  /** The account picked above Post. Nothing is picked to begin with. */
  const [accountId, setAccountId] = React.useState<string | null>(null)
  /** Below 1280px the new post takes the screen once asked for. */
  const [composing, setComposing] = React.useState(false)

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadAppModule(projectId, network).then(
        (next) => {
          setView(next)
          setError(null)
        },
        (failure: unknown) => setError(getPhoneAppErrorMessage(failure))
      ),
    [network, projectId]
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // A phone takes minutes and finishes without telling anybody, so the
  // module asks while the queue has something in it, and stops when it empties.
  const working = view ? view.jobs.queued + view.jobs.running > 0 : false
  React.useEffect(() => {
    if (!working) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh, working])

  const account = view?.accounts.find((row) => row.id === accountId) ?? null
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

  const controls = (
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
  )

  // The project's ⋮, last in the one header (`content-app/project-top.tsx`).
  const menu = <ProjectMenuButton jobs={guest ? null : { waiting: jobsWaiting, onOpen: () => onSearch({ window: "jobs" }) }} />

  const middle = !view ? (
    // The one header stays while the list is read, so moving here from another tab never blanks it
    // (Tyler, 27 Nov 2026: "why does cliucking on promote flashes the page").
    <>
      <ListHeader tabs={tabs} primary={controls} end={menu} menuLabel="More for this list" search={null} massSelect={null} />
      {error ? <ErrorRow message={error} onRetry={() => void refresh()} /> : <LoadingRow label={`Reading this project's ${NETWORK_NAMES[network]} posts`} />}
    </>
  ) : tab === "comments" ? (
    <AppCommentsTable
      network={network}
      tabs={tabs}
      controls={controls}
      menu={menu}
      rows={view.comments}
      selectedId={openComment}
      onOpen={(id) => onSearch({ comment: id })}
      onRefresh={refresh}
    />
  ) : (
    <AppPostsTable network={network} tabs={tabs} controls={controls} menu={menu} rows={view.posts} onRefresh={refresh} />
  )

  const accountPicker = view ? (
    <AppAccountPicker
      network={network}
      accounts={view.accounts}
      freeAccounts={view.freeAccounts}
      selectedId={account?.id ?? null}
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
          {comment.author} on a post by {handleWords(network, comment.account.handle) || "your account"}
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
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">New {NETWORK_NAMES[network]} post</span>
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        {view ? (
          // A guest from Project posts from the project's archive only (part 33).
          <PostComposer
            network={network}
            projectId={projectId}
            account={account}
            accounts={view.accounts}
            guest={Boolean(guest)}
            accountPicker={accountPicker}
            onPosted={async () => {
              setComposing(false)
              onSearch({ view: undefined, comment: undefined })
              await refresh()
            }}
          />
        ) : (
          <LoadingRow label="Reading the accounts" />
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
      rightLabel={comment ? "Show the comment and your answer" : "Show the new post"}
    >
      {dialogs}
      <JobsWindow
        open={search.window === "jobs" && !guest}
        onClose={() => {
          onSearch({ window: undefined })
          void refresh()
        }}
      />
    </ProjectColumns>
  )
}
