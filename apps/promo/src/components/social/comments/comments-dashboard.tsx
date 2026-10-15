import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertTriangleIcon,
  Loader2Icon,
  MessagesSquareIcon,
  RefreshCwIcon,
  ReplyIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { ErrorRow } from "@/components/ui/error-row"
import { Switch } from "@/components/ui/switch"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  checkComments,
  deleteComment,
  editComment,
  getCommentsErrorMessage,
  getReplyErrorMessage,
  loadComments,
  loadFailures,
  markNotExample,
  type CommentRow,
  type FailureRow,
} from "@/lib/api/social/comments"
import { loadOwnPosts, type OwnPostRow } from "@/lib/api/social/reddit/own-posts"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { MAX_CHECKS_PER_PRESS } from "@/lib/social/options"
import {
  commentStateWords,
  postedDateText,
  subredditRemovalText,
  toAnswerText,
} from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

import { Hint } from "../hint"
import { IN_COLUMN_TABLE } from "../projects/project-columns"
import { CommentRepliesDialog } from "./comment-replies-dialog"
import { EditCommentDialog } from "./edit-comment-dialog"
import { FailedTable } from "./failed-table"
import { PostsTable } from "./posts-table"

/** How often to ask again while a check, a delete or an edit is waiting or running. */
const POLL_MS = 2_000

export type CommentsTab = "sent" | "failed" | "posts"

type CommentsPage = { comments: CommentRow[]; failures: FailureRow[]; posts: OwnPostRow[] }

type SortColumn = "post" | "account" | "subreddit" | "sent" | "upvotes" | "replies" | "state"

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "post", label: "Post", column: "main" },
  // The table sits in the project's middle column, so its columns go by the
  // column's width, not the window's. Every column takes 1,287px, so
  // narrower than 82rem the account and when it was sent fold into a line
  // under the post's title, and narrower than 68rem the subreddit, whether it
  // is still there, its upvotes and its replies fold into a second one.
  // Otherwise the row is wider than the column and its switch and buttons go
  // off the edge: 1,076px of columns in a 710px column at a 1440px window,
  // and 1,287px in 1,035px at 2000px, measured 15 Oct 2026.
  { key: "account", label: "Account", column: "meta", className: "hidden @[82rem]:table-cell" },
  { key: "subreddit", label: "Subreddit", column: "meta", className: "hidden @[68rem]:table-cell" },
  { key: "sent", label: "Sent", column: "meta", className: "hidden @[82rem]:table-cell" },
  { key: "upvotes", label: "Upvotes", column: "meta", className: "hidden text-right @[68rem]:table-cell" },
  { key: "replies", label: "Replies", column: "meta", className: "hidden text-right @[68rem]:table-cell" },
  { key: "state", label: "Still there", column: "meta", className: "hidden @[68rem]:table-cell" },
  { key: "example", label: "Voice example", column: "meta", sortable: false },
]

/** Not read sorts below every reading, so an unread row never passes for a zero. */
function reading(value: number | null, checked: boolean): number {
  return checked && value !== null ? value : Number.NEGATIVE_INFINITY
}

/** Gone first when sorting up, then there, then never read, then deleted by you. */
function stateOrder(row: CommentRow): number {
  if (row.deletedAt) return 3
  if (row.checkedAt === null || row.stillVisible === null) return 2
  return row.stillVisible ? 1 : 0
}

function compare(a: CommentRow, b: CommentRow, column: SortColumn): number {
  switch (column) {
    case "account":
      return (a.account.handle || "~").localeCompare(b.account.handle || "~")
    case "subreddit":
      return a.subreddit.localeCompare(b.subreddit)
    case "sent":
      return new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()
    case "upvotes":
      return reading(a.upvotes, a.checkedAt !== null) - reading(b.upvotes, b.checkedAt !== null)
    case "replies":
      return reading(a.replyCount, a.checkedAt !== null) - reading(b.replyCount, b.checkedAt !== null)
    case "state":
      return stateOrder(a) - stateOrder(b)
    default:
      return a.postTitle.localeCompare(b.postTitle)
  }
}

/** Only an address on Reddit is ever opened from a stored value. */
function openOnReddit(url: string) {
  if (url.startsWith("https://www.reddit.com/")) window.open(url, "_blank", "noopener,noreferrer")
}

/** Why Edit and Delete are greyed out while one change is on its way to Reddit. */
function changingReason(changing: CommentRow["changing"]): string {
  return changing === "delete"
    ? "Deleting it on Reddit now. Wait for that to finish."
    : "Changing its words on Reddit now. Wait for that to finish."
}

/**
 * How many checked comments are gone in each subreddit, by lower-case name.
 * Only comments a check has read count, and ones you deleted never do.
 */
function removalsBySubreddit(rows: CommentRow[]): Map<string, { removed: number; checked: number }> {
  const counts = new Map<string, { removed: number; checked: number }>()
  for (const row of rows) {
    if (row.deletedAt || row.checkedAt === null || row.stillVisible === null) continue
    const key = row.subreddit.toLowerCase()
    const count = counts.get(key) ?? { removed: 0, checked: 0 }
    count.checked += 1
    if (!row.stillVisible) count.removed += 1
    counts.set(key, count)
  }
  return counts
}

/**
 * The Comments tab in a project's Reddit module: every comment the project's
 * accounts sent, and what became of it, with posts of your own and what did
 * not go out on tabs of their own. Tyler, 14 Oct 2026: "Today and comments can
 * be part of the views tabs". A comment counts toward the project its account
 * is in now, the same rule the Projects table counts by.
 *
 * Sent: upvotes, how many replies sit under it, whether it is still there and
 * who sent it. A reading needs the browser, so Check writes a job and the
 * screen asks again every two seconds until it is done. A comment nobody has
 * checked says so rather than showing 0 replies. Edit and Delete change it on
 * Reddit from the account that sent it.
 *
 * Failed: comments, answers and posts that never reached Reddit, read off
 * their jobs, with Try again, which puts the words back in the box and never
 * sends them by itself.
 *
 * The lists are read when the tab opens. In the address, `?list=` picks Posts
 * or Failed, `?replies=<id>` opens a comment's Replies window and
 * `?comment=<id>` shows that one comment, which is where the bell's reply and
 * removal notices lead.
 */
export function CommentsDashboard({
  projectId,
  list,
  repliesId,
  commentId,
}: {
  projectId: string
  list: CommentsTab
  /** The comment whose Replies window the address opens. */
  repliesId?: string
  /** One comment the address shows on its own. */
  commentId?: string
}) {
  const navigate = useNavigate()
  const [lists, setLists] = React.useState<CommentsPage | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const setSearch = React.useCallback(
    (patch: { list?: CommentsTab; replies?: string; comment?: string }) =>
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          if (next.list === "sent") delete next.list
          return next
        },
      }),
    [navigate]
  )

  const refresh = React.useCallback(
    (): Promise<void> =>
      Promise.all([loadComments(), loadFailures(), loadOwnPosts()]).then(
        ([comments, failures, posts]) => {
          // Every list is read whole and narrowed to this project here: the
          // lists are one person's, and each row already says its project.
          setLists({
            comments: comments.filter((row) => row.project?.id === projectId),
            failures: failures.filter((row) => row.projectId === projectId),
            posts: posts.filter((row) => row.project?.id === projectId),
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

  // Asks again only while a check, a delete or an edit is waiting or running.
  const anyWorking = Boolean(lists?.comments.some((row) => row.checking || row.changing !== null))
  React.useEffect(() => {
    if (!anyWorking) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [anyWorking, refresh])

  if (!lists) {
    return error ? (
      <ErrorRow message={error} onRetry={() => void refresh()} />
    ) : (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading the comments
      </p>
    )
  }

  const tabs = (
    <Tabs value={list} onValueChange={(value) => setSearch({ list: value as CommentsTab, comment: undefined })}>
      <TabsList>
        <TabsTrigger value="sent" aria-label={`Sent, ${lists.comments.length}`}>
          Sent
          <TabsCount>{lists.comments.length}</TabsCount>
        </TabsTrigger>
        <TabsTrigger value="posts" aria-label={`Posts of your own, ${lists.posts.length}`}>
          Posts
          <TabsCount>{lists.posts.length}</TabsCount>
        </TabsTrigger>
        <TabsTrigger value="failed" aria-label={`Failed, ${lists.failures.length}`}>
          Failed
          <TabsCount>{lists.failures.length}</TabsCount>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )

  if (list === "posts") return <PostsTable tabs={tabs} rows={lists.posts} />

  if (list === "failed") {
    return (
      <FailedTable
        tabs={tabs}
        failures={lists.failures}
        error={error}
        onRefresh={refresh}
        onOpenReplies={(id) => setSearch({ list: "sent", replies: id })}
      />
    )
  }

  return (
    <SentTable
      tabs={tabs}
      rows={lists.comments}
      error={error}
      onRefresh={refresh}
      repliesId={repliesId ?? null}
      onReplies={(id) => setSearch({ replies: id ?? undefined })}
      commentId={commentId ?? null}
      onShowAll={() => setSearch({ comment: undefined })}
    />
  )
}

function SentTable({
  tabs,
  rows,
  error,
  onRefresh,
  repliesId,
  onReplies,
  commentId,
  onShowAll,
}: {
  tabs: React.ReactNode
  rows: CommentRow[]
  error: string | null
  onRefresh: () => Promise<void>
  repliesId: string | null
  onReplies: (commentId: string | null) => void
  commentId: string | null
  onShowAll: () => void
}) {
  const { config } = useShellRuntime()
  const [search, setSearch] = React.useState("")
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("sent", "desc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const selection = useSelection()
  const [queueing, setQueueing] = React.useState<Set<string>>(new Set())
  const [marking, setMarking] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<CommentRow | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const openRow = repliesId ? (rows.find((row) => row.id === repliesId) ?? null) : null
  const editRow = editing ? (rows.find((row) => row.id === editing) ?? null) : null

  const removals = React.useMemo(() => removalsBySubreddit(rows), [rows])

  const shown = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const factor = direction === "asc" ? 1 : -1
    return rows
      .filter((row) => !commentId || row.id === commentId)
      .filter(
        (row) =>
          !query ||
          row.postTitle.toLowerCase().includes(query) ||
          row.subreddit.toLowerCase().includes(query) ||
          row.text.toLowerCase().includes(query) ||
          row.account.handle.toLowerCase().includes(query)
      )
      .sort((a, b) => factor * compare(a, b, sort))
  }, [commentId, direction, rows, search, sort])

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = visible.map((row) => row.id)

  async function check(picked: string[]) {
    // Ticks survive moving between pages, so more than one press's worth can
    // be ticked. The first ones go now and the toast says how many are left.
    const ids = picked.slice(0, MAX_CHECKS_PER_PRESS)
    const left = picked.length - ids.length
    setQueueing(new Set(ids))
    try {
      const answer = await checkComments(ids)
      toast.success(
        describeBulkResult({
          done: answer.completed.length,
          kept: answer.skipped.length,
          one: "comment",
          many: "comments",
          verb: "queued to be read",
          keptReason: "already being read, or deleted",
        }) +
          (left
            ? ` ${left} more ${left === 1 ? "is" : "are"} still ticked, because one press reads ${MAX_CHECKS_PER_PRESS}. Press Check again for ${left === 1 ? "it" : "them"}.`
            : "")
      )
      if (left) {
        selection.setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))))
      } else {
        selection.clear()
      }
      await onRefresh()
    } catch (failure) {
      showErrorToast(getCommentsErrorMessage(failure))
    } finally {
      setQueueing(new Set())
    }
  }

  async function setExample(row: CommentRow, useIt: boolean) {
    setMarking(row.id)
    try {
      await markNotExample(row.id, !useIt)
      await onRefresh()
    } catch (failure) {
      showErrorToast(getCommentsErrorMessage(failure))
    } finally {
      setMarking(null)
    }
  }

  const only = commentId ? rows.find((row) => row.id === commentId) : null

  return (
    <>
        <CommentRepliesDialog
          commentId={repliesId}
          checkedAt={openRow?.checkedAt ?? null}
          checking={Boolean(openRow?.checking) || (repliesId !== null && queueing.has(repliesId))}
          onCheck={(id) => check([id])}
          onClose={() => {
            onReplies(null)
            // The "to answer" counts move once an answer lands.
            void onRefresh()
          }}
        />
        <EditCommentDialog
          comment={editRow}
          onClose={() => setEditing(null)}
          onSave={async (id, text) => {
            try {
              await editComment(id, text)
              toast.success("The edit is on its way to Reddit. The row says when it lands.")
              await onRefresh()
            } catch (failure) {
              showErrorToast(getReplyErrorMessage(failure))
              throw failure
            }
          }}
        />
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open && !deleteBusy) setDeleting(null)
          }}
          title="Delete this comment from Reddit?"
          description={
            deleting
              ? `It is deleted from Reddit by ${deleting.account.handle ? `u/${deleting.account.handle}` : "the account that sent it"}, which cannot be undone. Promo keeps its record here, marked deleted by you.`
              : ""
          }
          confirmLabel="Delete from Reddit"
          loading={deleteBusy}
          onConfirm={async () => {
            if (!deleting) return
            setDeleteBusy(true)
            try {
              await deleteComment(deleting.id)
              toast.success("The delete is on its way to Reddit. The row says when it is gone.")
              setDeleting(null)
              await onRefresh()
            } catch (failure) {
              showErrorToast(getReplyErrorMessage(failure))
            } finally {
              setDeleteBusy(false)
            }
          }}
        />
        <DashboardTable
          title="Comments"
          icon={<MessagesSquareIcon />}
          fillHeight
          className={IN_COLUMN_TABLE}
          tabs={tabs}
          count={shown.length}
          error={error ? { message: error, onRetry: () => void onRefresh() } : null}
          selectedCount={selection.selected.size}
          onClearSelection={selection.clear}
          filters={
            commentId ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {only
                    ? `Showing your comment on ${only.postTitle || "a post with no title"}.`
                    : "That comment is not in this list any more."}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={onShowAll}>
                  Show every comment
                </Button>
            </>
          ) : null
        }
        controls={
          <>
              {selection.selected.size ? (
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={queueing.size > 0}
                  onClick={() => void check([...selection.selected])}
                >
                  {queueing.size ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="size-4" />
                  )}
                  Check ({selection.selected.size})
                </DashboardToolbarButton>
              ) : null}
              <DashboardToolbarSearch
                name="comment-search"
                aria-label="Search comments"
                placeholder="Search comments…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="comments"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={shown.length === 0}
        emptyText={
          rows.length
            ? "No comments match that."
            : "Nothing sent from this project yet."
        }
        emptyColSpan={COLUMNS.length + 2}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: shown.length,
          totalPages,
          onPageChange: (next) => setPage(Math.max(1, Math.min(next, totalPages))),
          onPageSizeChange: (next) => {
            setPage(1)
            setPageSize(next)
          },
        }}
      >
        {visible.map((row) => {
          const state = commentStateWords(row)
          const read = row.checkedAt !== null
          const busy = row.checking || queueing.has(row.id)
          const removal = subredditRemovalText(
            removals.get(row.subreddit.toLowerCase()) ?? { removed: 0, checked: 0 }
          )
          const gone = Boolean(row.deletedAt)
          return (
            <TableRow key={row.id} className="group" rowAction={() => openOnReddit(row.commentUrl)}>
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(row.id)}
                  onCheckedChange={() => selection.toggle(row.id)}
                  aria-label={`Select your comment on ${row.postTitle}`}
                />
              </TableCell>
              <TableCell column="main" className="max-w-0">
                <Hint label={row.postTitle}>
                  <button
                    type="button"
                    className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
                    onClick={() => openOnReddit(row.commentUrl)}
                  >
                    {row.postTitle || "A post with no title"}
                  </button>
                </Hint>
                <Hint label={row.text}>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.editedAt ? "Edited · " : ""}
                    {row.text}
                  </span>
                </Hint>
                <span className="block truncate text-xs text-muted-foreground @[82rem]:hidden">
                  {row.account.handle ? `u/${row.account.handle}` : "An account not signed in"}
                  {` · sent ${postedDateText(new Date(row.postedAt)).toLowerCase()}`}
                </span>
                <span className="block truncate text-xs text-muted-foreground @[68rem]:hidden">
                  {`r/${row.subreddit} · `}
                  {row.changing === "delete" ? "Deleting" : row.changing === "edit" ? "Editing" : state.label}
                  {read && row.upvotes !== null ? ` · ${row.upvotes} ${row.upvotes === 1 ? "upvote" : "upvotes"}` : ""}
                  {read && row.replyCount !== null ? ` · ${row.replyCount} ${row.replyCount === 1 ? "reply" : "replies"}` : ""}
                  {toAnswerText(row.toAnswer) ? `, ${toAnswerText(row.toAnswer)}` : ""}
                  {removal ? ` · ${removal}` : ""}
                </span>
              </TableCell>
              <TableCell column="meta" className="hidden max-w-32 @[82rem]:table-cell">
                <span className="block truncate">
                  {row.account.handle ? `u/${row.account.handle}` : "Not signed in"}
                </span>
              </TableCell>
              <TableCell column="meta" className="hidden max-w-32 @[68rem]:table-cell">
                <span className="block truncate text-muted-foreground">r/{row.subreddit}</span>
                {removal ? (
                  <Hint label={`Of your checked comments in r/${row.subreddit}, this many are gone. Counted from checks only.`}>
                    <span className="flex items-center gap-1 text-xs whitespace-nowrap text-amber-600 dark:text-amber-400">
                      <AlertTriangleIcon className="size-3 shrink-0" aria-hidden="true" />
                      {removal}
                    </span>
                  </Hint>
                ) : null}
              </TableCell>
              <TableCell column="meta" className="hidden text-muted-foreground @[82rem]:table-cell">
                {postedDateText(new Date(row.postedAt))}
              </TableCell>
              <TableCell column="meta" className="hidden text-right tabular-nums @[68rem]:table-cell">
                {!read ? (
                  <Hint label="Not read yet">
                    <span className="text-muted-foreground">—</span>
                  </Hint>
                ) : row.upvotes === null ? (
                  <Hint label="Reddit hides this comment's score for now.">
                    <span className="text-muted-foreground">Hidden</span>
                  </Hint>
                ) : (
                  row.upvotes
                )}
              </TableCell>
              <TableCell column="meta" className="hidden text-right tabular-nums @[68rem]:table-cell">
                {!read || row.replyCount === null ? (
                  <Hint label="Not read yet">
                    <span className="text-muted-foreground">—</span>
                  </Hint>
                ) : (
                  row.replyCount
                )}
                {toAnswerText(row.toAnswer) ? (
                  <span className="block text-xs whitespace-nowrap text-muted-foreground">
                    {toAnswerText(row.toAnswer)}
                  </span>
                ) : null}
              </TableCell>
              <TableCell column="meta" className="hidden @[68rem]:table-cell">
                <Hint label={state.detail}>
                  <span className="block text-sm">
                    {row.changing === "delete" ? "Deleting" : row.changing === "edit" ? "Editing" : state.label}
                  </span>
                </Hint>
                {row.changeError ? (
                  <Hint label={row.changeError}>
                    <span className="block max-w-48 truncate text-xs text-destructive">{row.changeError}</span>
                  </Hint>
                ) : read && !gone ? (
                  <span className="block text-xs text-muted-foreground">
                    Read {formatTimeAgo(row.checkedAt)}
                  </span>
                ) : null}
              </TableCell>
              <TableCell column="actions">
                <Hint
                  label={
                    row.notExample
                      ? "Not used as an example of how you write"
                      : row.inNextDraft
                        ? "In the next draft, as an example of how you write"
                        : "Used as an example once newer ones are switched off"
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    {marking === row.id ? (
                      <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                    ) : null}
                    <Switch
                      checked={!row.notExample}
                      disabled={marking !== null}
                      aria-label={`Use your comment on ${row.postTitle} as an example of how you write`}
                      onCheckedChange={(checked) => void setExample(row, checked)}
                    />
                    {row.inNextDraft ? (
                      <span className="text-xs text-muted-foreground">Next draft</span>
                    ) : null}
                  </span>
                </Hint>
              </TableCell>
              <TableCell column="actions">
                <Hint label="Replies, and answering them">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onReplies(row.id)}
                    aria-label={`Replies to your comment on ${row.postTitle}`}
                  >
                    <ReplyIcon className="size-4" />
                  </Button>
                </Hint>
                {/* A comment you deleted is never read or changed again, so
                    its buttons go rather than sitting greyed out. */}
                {gone ? null : (
                  <>
                    <Hint label="Read it again on Reddit">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        onClick={() => void check([row.id])}
                        aria-label={`Read your comment on ${row.postTitle} again`}
                      >
                        {busy ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          <RefreshCwIcon className="size-4" />
                        )}
                      </Button>
                    </Hint>
                    <DisabledReason reason={changingReason(row.changing)} disabled={row.changing !== null}>
                      <Hint label="Edit its words on Reddit">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={row.changing !== null}
                          onClick={() => setEditing(row.id)}
                          aria-label={`Edit your comment on ${row.postTitle}`}
                        >
                          {row.changing === "edit" ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <SettingsIcon className="size-4" />
                          )}
                        </Button>
                      </Hint>
                    </DisabledReason>
                    <DisabledReason reason={changingReason(row.changing)} disabled={row.changing !== null}>
                      <Hint label="Delete it from Reddit">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={row.changing !== null}
                          onClick={() => setDeleting(row)}
                          aria-label={`Delete your comment on ${row.postTitle} from Reddit`}
                        >
                          {row.changing === "delete" ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <Trash2Icon className="size-4" />
                          )}
                        </Button>
                      </Hint>
                    </DisabledReason>
                  </>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>
    </>
  )
}
