import * as React from "react"
import { ProjectMenuButton } from "@/components/content-app/project-top"
import { useNavigate } from "@tanstack/react-router"
import { AlertTriangleIcon, ExternalLinkIcon, Loader2Icon, MessageSquareIcon, PauseIcon, PlusIcon, RefreshCwIcon, RotateCcwIcon, XIcon } from "lucide-react"

import { CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { ListHeader } from "@/components/content-app/list-header"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { NetworkPaneColumns, NetworkTabs, useNetworkPanes, withPaneTabs, type NetworkPanes } from "@/components/content-app/network-panes"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { ProjectColumns } from "@/components/social/projects/project-columns"
import { ErrorRow } from "@/components/ui/error-row"
import { TableCell } from "@/components/ui/table"
import { dismissFailed, getCommentsErrorMessage, loadFailures, type FailureRow } from "@/lib/api/social/comments"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { postedDateText } from "@/lib/social/wording"
import type { ProjectView } from "@/lib/api/social/projects"
import { checkOwnPosts, getOwnPostErrorMessage, loadFailedPost, loadOwnPosts, type OwnPostRow } from "@/lib/api/social/reddit/own-posts"
import { loadViralRedditDraft } from "@/lib/api/social/viral-link"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

import { NEW_POST_FIRST_FIELD, RedditNewPostPanel, type NewPostStart } from "./reddit-new-post"
import { RedditPostCommentsDialog } from "./reddit-post-comments"
import { usePromoGuest } from "@/components/social/guest/guest-mode"
import { Button } from "@/components/ui/button"
import { Hint } from "@/components/social/hint"
import { ProjectHeaderLead } from "@/components/social/projects/project-header-lead"

/** How often the lists are read again while a post's check is on its way. */
const CHECK_POLL_MS = 2_000

/** What Reddit's posts keep in the address: `?list=failed` is Failed, none is Posts. */
export type RedditPostsSearch = { list?: "failed" }

/**
 * Reddit on a project's dashboard: your own posts. Tyler, 5 Nov 2026: "Every
 * middle panel clicking from the left panel should show my own posts"
 * (`workspace/tasks/Projects/commenting-dashboard.md`, parts 1 to 3 and 9).
 * Finding posts to comment on is Reddit's Commenting row in the same card of
 * the project's left column.
 *
 * The middle column is Posts, every post of yours that landed, and Failed,
 * the ones that did not go out, each with Try again. The right column is
 * always New post, since a Reddit post is read on Reddit itself.
 * `newPostRetryId` is a failed post's job, or a Viral draft, whose words New
 * post opens with. Nothing is sent until Post is pressed. A post sent, or a
 * failed one cleared, reads the project again, so Posts' count on Reddit's
 * card changes at once.
 */
export function RedditPostsModule({
  view,
  left,
  dialogs,
  search,
  onSearch,
  newPostRetryId,
  onProjectChanged,
}: {
  view: ProjectView
  left: React.ReactNode
  dialogs: React.ReactNode
  search: RedditPostsSearch
  onSearch: (patch: RedditPostsSearch) => void
  newPostRetryId: string | null
  /** Reads the project again, for the counts on its network cards. */
  onProjectChanged: () => Promise<void>
}) {
  const desktop = useWideScreen()
  // Content's Voices and Accounts tabs (`network-panes.tsx`).
  const panes = useNetworkPanes()
  const projectId = view.project.id
  const list = search.list === "failed" ? "failed" : "posts"
  const [lists, setLists] = React.useState<{ posts: OwnPostRow[]; failures: FailureRow[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  /** What New post starts with, and a count that starts its boxes afresh after a send. */
  const [start, setStart] = React.useState<NewPostStart | null>(null)
  const [formKey, setFormKey] = React.useState(0)
  /** On a narrow screen, whether New post covers the list. */
  const [composing, setComposing] = React.useState(false)

  const refresh = React.useCallback(
    (): Promise<void> =>
      Promise.all([loadOwnPosts(projectId), loadFailures(projectId)]).then(
        ([posts, failures]) => {
          // Both lists are one person's, narrowed here to this project's
          // posts. Failed comments are on a network's Commenting.
          setLists({
            posts: posts.filter((row) => row.project?.id === projectId),
            failures: failures.filter((row) => row.projectId === projectId && row.kind === "submit"),
          })
          setError(null)
        },
        (failure: unknown) => setError(getCommentsErrorMessage(failure))
      ),
    [projectId]
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // A check takes the reader browser a minute, so the lists are read again
  // every two seconds while one is waiting or running, from the timer's own callback.
  const checking = lists?.posts.some((row) => row.checking) ?? false
  React.useEffect(() => {
    if (!checking) return
    const timer = setInterval(() => void refresh(), CHECK_POLL_MS)
    return () => clearInterval(timer)
  }, [checking, refresh])

  /** After a send or a failure cleared: the lists, and the card's count. */
  const changed = React.useCallback(async () => {
    await Promise.all([refresh(), onProjectChanged()])
  }, [onProjectChanged, refresh])

  // A failed post's words, from Try again, or a post the Viral app wrote
  // (`workspace/docs/viral-link.md`): read once, then New post opens with
  // them. Nothing is sent.
  React.useEffect(() => {
    if (!newPostRetryId) return
    let live = true
    loadFailedPost(newPostRetryId)
      .then(async (failed) => failed ?? (await loadViralRedditDraft(newPostRetryId)))
      .then(
        (words) => {
          if (!live) return
          if (!words) {
            showErrorToast("That post is not a failed one any more, so there is nothing to try again.")
            return
          }
          setStart(words)
          setFormKey((count) => count + 1)
          setComposing(true)
        },
        () => {
          if (live) showErrorToast("That post's words could not be read. Please try again.")
        }
      )
    return () => {
      live = false
    }
  }, [newPostRetryId])

  // Voices or Accounts, in place of Posts and Failed.
  if (panes?.pane) {
    return (
      <NetworkPaneColumns
        panes={{ ...panes, pane: panes.pane }}
        tabs={
          <>
            <PanelReopenButton side="left" label="Show the Projects page" />
            <ProjectHeaderLead />
            <RedditPostsTabs panes={panes} list={list} lists={lists} onPick={(next) => onSearch({ list: next === "failed" ? "failed" : undefined })} />
          </>
        }
        left={left}
        dialogs={dialogs}
      />
    )
  }

  function newPost() {
    setComposing(true)
    // The panel is already drawn on a wide screen; on a narrow one it is
    // drawn once `composing` is set, so the cursor goes in after that.
    requestAnimationFrame(() => document.getElementById(NEW_POST_FIRST_FIELD)?.focus())
  }

  const middle = (
    <RedditPostsMiddle
      list={list}
      lists={lists}
      error={error}
      paused={view.project.pausedNetworks.includes("reddit")}
      onList={(next) => onSearch({ list: next === "failed" ? "failed" : undefined })}
      onRetry={() => void refresh()}
      onChanged={changed}
      onNewPost={newPost}
    />
  )

  return (
    <ProjectColumns
      left={left}
      middle={middle}
      reopenInHeader
      right={
        <RedditNewPostPanel
          key={formKey}
          projectId={projectId}
          accounts={view.accounts}
          start={start}
          onBack={desktop ? undefined : () => setComposing(false)}
          onSent={() => {
            setStart(null)
            setFormKey((count) => count + 1)
            setComposing(false)
            void changed()
          }}
        />
      }
      rightOpen={composing}
      onCloseRight={() => setComposing(false)}
      rightLabel="Show New post"
    >
      {dialogs}
    </ProjectColumns>
  )
}

/**
 * Posts and Failed with their counts, then Content's Voices and Accounts.
 * Drawn once the counts are read: drawn before, the line sat under "Posts" and
 * then slid wider under "Posts 0" (Tyler, 12 Nov 2026: "this border and tab
 * here loads twice").
 */
function RedditPostsTabs({
  panes,
  list,
  lists,
  onPick,
}: {
  panes: NetworkPanes | null
  list: "posts" | "failed"
  lists: { posts: OwnPostRow[]; failures: FailureRow[] } | null
  onPick: (list: "posts" | "failed") => void
}) {
  if (!lists) return <span className="flex-1" />
  const tabs = withPaneTabs(panes, list, (next) => onPick(next === "failed" ? "failed" : "posts"), [
    { value: "posts", label: "Posts", count: lists.posts.length },
    { value: "failed", label: "Failed", count: lists.failures.length },
  ])
  return <NetworkTabs tabs={tabs} />
}

/** Only an address on Reddit is ever opened from a stored value. */
function openOnReddit(url: string) {
  if (url.startsWith("https://www.reddit.com/")) window.open(url, "_blank", "noopener,noreferrer")
}

/**
 * Reddit's Posts in the design's one header and table shape (Tyler, 12 Nov
 * 2026: "the project page itsel is not updated to the new design").
 *
 * - **Header:** Posts and Failed as tabs with their counts, then search,
 *   Select and New post, which puts the cursor in New post on the right.
 * - **Posts:** each post of yours that landed, with the account, the
 *   subreddit and when it went. A press opens it on Reddit, since a Reddit
 *   post is read there; so does its right-click menu.
 * - **Failed:** each post that did not go out, with why, and May be on
 *   Reddit already when the browser stopped part-way. Its right-click menu
 *   has Try again, which opens New post with its words, Open on Reddit when
 *   it may have landed, and Dismiss. Select ticks several to dismiss.
 */
function RedditPostsMiddle({
  list,
  lists,
  error,
  paused,
  onList,
  onRetry,
  onChanged,
  onNewPost,
}: {
  list: "posts" | "failed"
  lists: { posts: OwnPostRow[]; failures: FailureRow[] } | null
  error: string | null
  paused: boolean
  onList: (list: "posts" | "failed") => void
  onRetry: () => void
  onChanged: () => Promise<void>
  onNewPost: () => void
}) {
  const navigate = useNavigate()
  const guest = Boolean(usePromoGuest())
  const panes = useNetworkPanes()
  const [commentsFor, setCommentsFor] = React.useState<string | null>(null)
  const [q, setQ] = React.useState("")
  const [sort, setSort] = React.useState<"what" | "account" | "where" | "upvotes" | "comments" | "when">("when")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const toggleSort = (column: typeof sort) => {
    if (column === sort) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSort(column)
      setDirection(column === "when" ? "desc" : "asc")
    }
  }
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [busy, setBusy] = React.useState(false)
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const needle = q.trim().toLowerCase()
  const sign = direction === "asc" ? 1 : -1

  const posts = React.useMemo(
    () =>
      (lists?.posts ?? [])
        .filter((row) => !needle || `${row.title} ${row.body} ${row.subreddit}`.toLowerCase().includes(needle))
        .sort((a, b) => {
          if (sort === "account") return (a.account.handle || "~").localeCompare(b.account.handle || "~") * sign
          if (sort === "where") return a.subreddit.localeCompare(b.subreddit) * sign
          if (sort === "what") return a.title.localeCompare(b.title) * sign
          if (sort === "upvotes") return ((a.upvotes ?? -1) - (b.upvotes ?? -1)) * sign
          if (sort === "comments") return ((a.commentCount ?? -1) - (b.commentCount ?? -1)) * sign
          return (new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()) * sign
        }),
    [lists, needle, sign, sort]
  )
  const failures = React.useMemo(
    () =>
      (lists?.failures ?? [])
        .filter((row) => !needle || `${row.title} ${row.text} ${row.subreddit} ${row.reason}`.toLowerCase().includes(needle))
        .sort((a, b) => {
          if (sort === "account") return (a.account?.handle ?? "~").localeCompare(b.account?.handle ?? "~") * sign
          if (sort === "where") return a.subreddit.localeCompare(b.subreddit) * sign
          if (sort === "what") return (a.title || "~").localeCompare(b.title || "~") * sign
          return (new Date(a.failedAt).getTime() - new Date(b.failedAt).getTime()) * sign
        }),
    [lists, needle, sign, sort]
  )
  const ids = list === "failed" ? failures.map((row) => row.id) : []

  /** Check: reads the posts' upvotes and comments again in the reader browser. Never posts. */
  async function check(postIds: string[]) {
    if (!postIds.length) return
    setBusy(true)
    try {
      await checkOwnPosts(postIds.slice(0, 50))
      await onChanged()
    } catch (failure) {
      showErrorToast(getOwnPostErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  const postActions = (row: OwnPostRow): RowMenuItem[] => [
    { label: "Comments", icon: <MessageSquareIcon className="size-4" />, onSelect: () => setCommentsFor(row.id) },
    ...(guest ? [] : [{ label: "Check again", icon: <RefreshCwIcon className="size-4" />, onSelect: () => void check([row.id]) }]),
    { label: "Open on Reddit", icon: <ExternalLinkIcon className="size-4" />, onSelect: () => openOnReddit(row.postUrl) },
  ]

  async function dismiss(dismissed: string[]) {
    setBusy(true)
    dismissErrorToast()
    try {
      await dismissFailed(dismissed)
      selection.clear()
      await onChanged()
    } catch (failure) {
      showErrorToast(getCommentsErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  /** Try again: New post with the failed post's words. Nothing is sent until Post is pressed. */
  const tryAgain = (row: FailureRow) =>
    void navigate({ to: ".", search: (previous: Record<string, unknown>) => ({ ...previous, newPost: row.id }) })

  const failureActions = (row: FailureRow): RowMenuItem[] => [
    { label: "Try again", icon: <RotateCcwIcon className="size-4" />, onSelect: () => tryAgain(row) },
    ...(row.mayHaveLanded && row.post
      ? [{ label: "Open on Reddit", icon: <ExternalLinkIcon className="size-4" />, onSelect: () => openOnReddit(row.post!.url) }]
      : []),
    { label: "Dismiss", icon: <XIcon className="size-4" />, destructive: true, onSelect: () => void dismiss([row.id]) },
  ]

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden">
      <ListHeader
        tabs={
          <>
            <PanelReopenButton side="left" label="Show the Projects page" />
            <ProjectHeaderLead />
            <RedditPostsTabs
              panes={panes}
              list={list}
              lists={lists}
              onPick={(next) => {
                selection.clear()
                setMassSelect(false)
                onList(next)
              }}
            />
          </>
        }
        end={<><ProjectMenuButton /><PanelReopenButton side="right" label="Show New post" /></>}
        selected={
          massSelect && selection.selected.size ? (
            <SelectedMenu
              count={selection.selected.size}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <SelectedMenuRow
                  onClick={() => {
                    menu.close()
                    void dismiss([...selection.selected])
                  }}
                >
                  <XIcon className="size-4 text-muted-foreground" />
                  Dismiss
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for Reddit posts"
        search={{
          name: "reddit-post-search",
          label: "Search your Reddit posts",
          placeholder: "Search posts",
          value: q,
          onChange: setQ,
        }}
        massSelect={list === "failed" ? { on: massSelect, onToggle: () => toggleMassSelect() } : null}
        view={
          list === "posts" && posts.length && !guest ? (
            <Hint label="Read the upvotes and comments of the 50 newest again now">
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void check(posts.map((row) => row.id))}>
                {busy || posts.some((row) => row.checking) ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                <span className="@max-3xl:sr-only">Check</span>
              </Button>
            </Hint>
          ) : null
        }
        primary={
          <DashboardToolbarButton type="button" onClick={onNewPost}>
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New post</span>
          </DashboardToolbarButton>
        }
      />
      {paused ? (
        <p className="flex shrink-0 items-start gap-2 border-b px-6 py-2 text-sm">
          <PauseIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Reddit is paused on this project. Nothing is sent or warmed up until it is resumed from the project's ⋮, under Networks.
        </p>
      ) : null}
      {!lists ? (
        error ? (
          <div className="px-6 py-3">
            <ErrorRow message={error} onRetry={onRetry} />
          </div>
        ) : (
          <p className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading your posts
          </p>
        )
      ) : list === "posts" ? (
        <CrmTable<"what" | "account" | "where" | "upvotes" | "comments" | "when">
          columns={[
            { key: "what", label: "Post", column: "main", className: "min-w-40" },
            { key: "account", label: "Account", column: "preview", className: "hidden md:hidden @2xl:table-cell" },
            { key: "where", label: "Subreddit", column: "preview", className: "hidden md:hidden @lg:table-cell" },
            { key: "upvotes", label: "Upvotes", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
            { key: "comments", label: "Comments", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
            { key: "when", label: "Sent", column: "meta", className: "hidden md:hidden @xl:table-cell" },
          ]}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          actions
          empty={posts.length ? null : needle ? "No posts match that search." : "No posts of your own yet. Press New post to write one."}
        >
          {posts.map((row) => (
            <CrmTableRow
              key={row.id}
              open={false}
              label={row.title}
              onOpen={() => openOnReddit(row.postUrl)}
              cog={false}
              buttons={[{ label: `Comments on ${row.title}`, icon: <MessageSquareIcon className="size-4" />, onPress: () => setCommentsFor(row.id) }]}
              onRightClick={(x, y) => setRightClick({ id: row.id, x, y })}
            >
              <MainCell name={row.title}>
                {row.body ? <span className="hidden min-w-0 truncate text-xs text-muted-foreground @lg:inline">{row.body}</span> : null}
              </MainCell>
              <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
                <span className="block truncate">{row.account.handle ? `u/${row.account.handle}` : "Not signed in"}</span>
                {row.sentBy ? <span className="block truncate text-xs text-muted-foreground">{row.sentBy}</span> : null}
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @lg:table-cell">
                <span className="block truncate">r/{row.subreddit}</span>
              </TableCell>
              {/* A dash until a check has read it, never 0, as the Sent tab does. */}
              <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @3xl:table-cell">
                {row.checking ? "Reading" : (row.upvotes ?? "–")}
              </TableCell>
              <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @3xl:table-cell">
                {row.checking ? "" : (row.commentCount ?? "–")}
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
                {postedDateText(new Date(row.postedAt))}
              </TableCell>
            </CrmTableRow>
          ))}
        </CrmTable>
      ) : (
        <CrmTable<"what" | "account" | "where" | "when">
          columns={[
            { key: "what", label: "Post", column: "main", className: "min-w-40" },
            { key: "account", label: "Account", column: "preview", className: "hidden md:hidden @2xl:table-cell" },
            { key: "where", label: "Why", column: "preview", className: "hidden md:hidden @lg:table-cell" },
            { key: "when", label: "Failed", column: "meta", className: "hidden md:hidden @xl:table-cell" },
          ]}
          // Upvotes and Comments are the Posts list's own; sorted by one of them, Failed stays by date.
          sort={sort === "upvotes" || sort === "comments" ? "when" : sort}
          direction={direction}
          onSort={toggleSort}
          actions={false}
          select={
            massSelect
              ? { noun: "failures", disabled: ids.length === 0, checked: selection.selectAllState(ids), onToggle: () => selection.toggleVisible(ids) }
              : null
          }
          empty={failures.length ? null : needle ? "No failures match that search." : "Nothing failed. Every post you pressed went out."}
        >
          {failures.map((row) => (
            <CrmTableRow
              key={row.id}
              open={false}
              label={row.title || "A post with no title"}
              tick={{ shown: massSelect, ticked: selection.selected.has(row.id), onToggle: () => selection.toggle(row.id) }}
              onOpen={() => tryAgain(row)}
              onRightClick={(x, y) => setRightClick({ id: row.id, x, y })}
            >
              <MainCell name={row.title || "A post with no title"}>
                {row.subreddit ? <span className="shrink-0 text-xs text-muted-foreground">r/{row.subreddit}</span> : null}
                {row.mayHaveLanded ? (
                  <Chip className="shrink-0 text-amber-600 dark:text-amber-400">
                    <AlertTriangleIcon className="size-3" aria-hidden />
                    May be on Reddit already
                  </Chip>
                ) : null}
              </MainCell>
              <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
                <span className="block truncate">{row.account?.handle ? `u/${row.account.handle}` : "Not signed in"}</span>
              </TableCell>
              <TableCell column="preview" className="hidden max-w-72 md:hidden @lg:table-cell">
                <span className="block truncate text-muted-foreground">{row.reason}</span>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
                {formatTimeAgo(row.failedAt)}
              </TableCell>
            </CrmTableRow>
          ))}
        </CrmTable>
      )}
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={list === "failed" ? { on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) } : null}
          items={(() => {
            if (list === "failed") {
              const row = failures.find((each) => each.id === rightClick.id)
              return row ? failureActions(row) : []
            }
            const row = posts.find((each) => each.id === rightClick.id)
            return row ? postActions(row) : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
      <RedditPostCommentsDialog
        post={posts.find((row) => row.id === commentsFor) ?? null}
        guest={guest}
        onClose={() => setCommentsFor(null)}
        onChanged={onChanged}
      />
    </div>
  )
}
