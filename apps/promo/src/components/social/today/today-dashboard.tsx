import * as React from "react"
import { Loader2Icon, MessageCircleReplyIcon, RefreshCwIcon, SunIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { usePromoShell } from "@/components/social/guest/guest-mode"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorRow } from "@/components/ui/error-row"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { checkComments, getCommentsErrorMessage } from "@/lib/api/social/comments"
import { getRedditErrorMessage, setFindsStatus } from "@/lib/api/social/reddit/keywords"
import { getTodayErrorMessage, loadToday, type TodayView } from "@/lib/api/social/today"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

import { Hint } from "../hint"
import { IN_COLUMN_TABLE } from "../projects/project-columns"

type TodayTab = "posts" | "replies"

type Post = TodayView["posts"][number]
type Reply = TodayView["replies"][number]

type PostColumn = "post" | "subreddit" | "posted" | "replies"
type ReplyColumn = "post" | "account" | "toAnswer"

const POST_COLUMNS: TableHeaderColumn<PostColumn>[] = [
  { key: "post", label: "Post", column: "main" },
  // By the middle column's width, not the window's: narrower than 56rem the
  // subreddit and when it went up fold into the line under the title.
  { key: "subreddit", label: "Subreddit", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "posted", label: "Posted", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "replies", label: "Replies", column: "meta", className: "text-right" },
]

const REPLY_COLUMNS: TableHeaderColumn<ReplyColumn>[] = [
  { key: "post", label: "Your comment on", column: "main" },
  { key: "account", label: "Account", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "toAnswer", label: "To answer", column: "meta", className: "text-right" },
]

const time = (value: Date | null) => (value ? new Date(value).getTime() : 0)

/** The list's own order is the ranking, so "post" sorts by it rather than by title. */
function comparePosts(a: Post, b: Post, column: PostColumn, order: Map<string, number>): number {
  switch (column) {
    case "subreddit":
      return a.subreddit.localeCompare(b.subreddit)
    case "posted":
      return time(a.postedAt) - time(b.postedAt)
    case "replies":
      return a.commentCount - b.commentCount
    default:
      return (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0)
  }
}

function compareReplies(a: Reply, b: Reply, column: ReplyColumn): number {
  switch (column) {
    case "account":
      return (a.account.handle || "~").localeCompare(b.account.handle || "~")
    case "toAnswer":
      return a.toAnswer - b.toAnswer
    default:
      return a.postTitle.localeCompare(b.postTitle)
  }
}

/**
 * Today, a tab in a project's Reddit module: the project's Strong fit posts
 * and its replies waiting for an answer, best first, so the morning round for
 * one project is one list. Tyler, 14 Oct 2026: "Today and comments can be part
 * of the views tabs".
 *
 * A post opens beside the list, where Post sends from one of the project's
 * accounts. A reply opens its comment's Replies window on the Comments tab.
 * Nothing here sends anything; Skip only moves posts out of the way. The list
 * is read when the tab opens, and a spinner holds its place until then.
 */
export function TodayDashboard({
  projectId,
  onOpenPost,
  onOpenReplies,
}: {
  projectId: string
  onOpenPost: (findId: string) => void
  onOpenReplies: (commentId: string) => void
}) {
  const [tab, setTab] = React.useState<TodayTab>("posts")
  const [view, setView] = React.useState<TodayView | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadToday(projectId).then(
        (next) => {
          setView(next)
          setError(null)
        },
        (failure: unknown) => setError(getTodayErrorMessage(failure))
      ),
    [projectId]
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  if (!view) {
    return error ? (
      <ErrorRow message={error} onRetry={() => void refresh()} />
    ) : (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading today&apos;s list
      </p>
    )
  }

  const tabs = (
    <Tabs value={tab} onValueChange={(value) => setTab(value === "replies" ? "replies" : "posts")}>
      <TabsList>
        <TabsTrigger value="posts" aria-label={`Posts to answer, ${view.posts.length}`}>
          Posts
          <TabsCount>{view.posts.length}</TabsCount>
        </TabsTrigger>
        <TabsTrigger value="replies" aria-label={`Replies to answer, ${view.replies.length}`}>
          Replies
          <TabsCount>{view.replies.length}</TabsCount>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )

  return tab === "replies" ? (
    <RepliesTable tabs={tabs} rows={view.replies} error={error} onRefresh={refresh} onOpen={onOpenReplies} />
  ) : (
    <PostsTable tabs={tabs} rows={view.posts} error={error} onRefresh={refresh} onOpen={onOpenPost} />
  )
}

function usePages<T>(rows: T[]) {
  const { rowsPerPage } = usePromoShell()
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(rowsPerPage)
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  return {
    visible: rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    footer: {
      type: "pagination" as const,
      page: currentPage,
      pageSize,
      total: rows.length,
      totalPages,
      onPageChange: (next: number) => setPage(Math.max(1, Math.min(next, totalPages))),
      onPageSizeChange: (next: number) => {
        setPage(1)
        setPageSize(next)
      },
    },
  }
}

function PostsTable({
  tabs,
  rows,
  error,
  onRefresh,
  onOpen,
}: {
  tabs: React.ReactNode
  rows: Post[]
  error: string | null
  onRefresh: () => Promise<void>
  onOpen: (findId: string) => void
}) {
  const { sort, direction, toggleSort } = useTableSort<PostColumn>("post", "desc")
  const selection = useSelection()
  const [skipping, setSkipping] = React.useState(false)
  const order = React.useMemo(() => new Map(rows.map((row, index) => [row.id, rows.length - index])), [rows])
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => factor * comparePosts(a, b, sort, order))
  }, [direction, order, rows, sort])
  const { visible, footer } = usePages(sorted)
  const visibleIds = visible.map((row) => row.id)

  async function skip(ids: string[]) {
    setSkipping(true)
    try {
      const answer = await setFindsStatus(ids, "skipped")
      toast.success(
        describeBulkResult({
          done: answer.completed.length,
          kept: answer.skipped.length,
          one: "post",
          many: "posts",
          verb: "skipped",
          keptReason: "already commented on",
        })
      )
      selection.clear()
      await onRefresh()
    } catch (failure) {
      showErrorToast(getRedditErrorMessage(failure))
    } finally {
      setSkipping(false)
    }
  }

  return (
    <DashboardTable
      title="Today"
      icon={<SunIcon />}
      fillHeight
      className={IN_COLUMN_TABLE}
      tabs={tabs}
      count={rows.length}
      error={error ? { message: error, onRetry: () => void onRefresh() } : null}
      selectedCount={selection.selected.size}
      onClearSelection={selection.clear}
      controls={
        selection.selected.size ? (
          <DashboardToolbarButton
            type="button"
            variant="outline"
            disabled={skipping}
            onClick={() => void skip([...selection.selected])}
          >
            {skipping ? <Loader2Icon className="size-4 animate-spin" /> : <XIcon className="size-4" />}
            Skip ({selection.selected.size})
          </DashboardToolbarButton>
        ) : null
      }
      header={
        <SortableTableHeader
          columns={POST_COLUMNS}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          leading={
            <SelectAllTableHead
              noun="posts"
              checked={selection.selectAllState(visibleIds)}
              onCheckedChange={() => selection.toggleVisible(visibleIds)}
            />
          }
          trailing={<TableHead column="meta">Actions</TableHead>}
        />
      }
      isEmpty={rows.length === 0}
      emptyText="No Strong fit posts are waiting in this project."
      emptyColSpan={POST_COLUMNS.length + 2}
      footer={footer}
    >
      {visible.map((row) => (
        <TableRow
          key={row.id}
          className="group"
          rowAction={() => onOpen(row.id)}
        >
          <TableCell column="select">
            <Checkbox
              checked={selection.selected.has(row.id)}
              onCheckedChange={() => selection.toggle(row.id)}
              aria-label={`Select ${row.title}`}
            />
          </TableCell>
          <TableCell column="main" className="max-w-0">
            <Hint label={row.title}>
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
              >
                {row.title || "A post with no title"}
              </button>
            </Hint>
            <Hint label={row.reason}>
              <span className="block truncate text-xs text-muted-foreground">{row.reason}</span>
            </Hint>
            <span className="block truncate text-xs text-muted-foreground @4xl:hidden">
              r/{row.subreddit} · {postedDateText(row.postedAt ? new Date(row.postedAt) : null)}
            </span>
          </TableCell>
          <TableCell column="meta" className="hidden max-w-32 @4xl:table-cell">
            <span className="block truncate text-muted-foreground">r/{row.subreddit}</span>
          </TableCell>
          <TableCell column="meta" className="hidden text-muted-foreground @4xl:table-cell">
            {postedDateText(row.postedAt ? new Date(row.postedAt) : null)}
          </TableCell>
          <TableCell column="meta" className="text-right tabular-nums">
            {row.commentCount}
          </TableCell>
          <TableCell column="actions">
            <Hint label="Skip this post">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={skipping}
                onClick={() => void skip([row.id])}
                aria-label={`Skip ${row.title}`}
              >
                <XIcon className="size-4" />
              </Button>
            </Hint>
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}

function RepliesTable({
  tabs,
  rows,
  error,
  onRefresh,
  onOpen,
}: {
  tabs: React.ReactNode
  rows: Reply[]
  error: string | null
  onRefresh: () => Promise<void>
  onOpen: (commentId: string) => void
}) {
  const { sort, direction, toggleSort } = useTableSort<ReplyColumn>("toAnswer", "desc")
  const selection = useSelection()
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => factor * compareReplies(a, b, sort))
  }, [direction, rows, sort])
  const { visible, footer } = usePages(sorted)
  const visibleIds = visible.map((row) => row.commentId)
  const [checking, setChecking] = React.useState(false)

  async function check(ids: string[]) {
    setChecking(true)
    try {
      const answer = await checkComments(ids)
      toast.success(
        describeBulkResult({
          done: answer.completed.length,
          kept: answer.skipped.length,
          one: "comment",
          many: "comments",
          verb: "queued to be read again",
          keptReason: "already being read",
        })
      )
      selection.clear()
    } catch (failure) {
      showErrorToast(getCommentsErrorMessage(failure))
    } finally {
      setChecking(false)
    }
  }

  return (
    <DashboardTable
      title="Today"
      icon={<SunIcon />}
      fillHeight
      className={IN_COLUMN_TABLE}
      tabs={tabs}
      count={rows.length}
      error={error ? { message: error, onRetry: () => void onRefresh() } : null}
      selectedCount={selection.selected.size}
      onClearSelection={selection.clear}
      controls={
        selection.selected.size ? (
          <DashboardToolbarButton
            type="button"
            variant="outline"
            disabled={checking}
            onClick={() => void check([...selection.selected])}
          >
            {checking ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
            Check again ({selection.selected.size})
          </DashboardToolbarButton>
        ) : null
      }
      header={
        <SortableTableHeader
          columns={REPLY_COLUMNS}
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
      isEmpty={rows.length === 0}
      emptyText="No replies are waiting for an answer."
      emptyColSpan={REPLY_COLUMNS.length + 2}
      footer={footer}
    >
      {visible.map((row) => (
        <TableRow
          key={row.commentId}
          className="group"
          rowAction={() => onOpen(row.commentId)}
        >
          <TableCell column="select">
            <Checkbox
              checked={selection.selected.has(row.commentId)}
              onCheckedChange={() => selection.toggle(row.commentId)}
              aria-label={`Select your comment on ${row.postTitle}`}
            />
          </TableCell>
          <TableCell column="main" className="max-w-0">
            <Hint label={row.postTitle}>
              <button
                type="button"
                onClick={() => onOpen(row.commentId)}
                className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
              >
                {row.postTitle || "A post with no title"}
              </button>
            </Hint>
            <Hint label={row.latest.text}>
              <span className="block truncate text-xs text-muted-foreground">
                {row.latest.author ? `u/${row.latest.author}: ` : ""}
                {row.latest.text}
              </span>
            </Hint>
            <span className="block truncate text-xs text-muted-foreground @4xl:hidden">
              {row.account.handle ? `u/${row.account.handle}` : "An account not signed in"}
            </span>
          </TableCell>
          <TableCell column="meta" className="hidden max-w-32 @4xl:table-cell">
            <span className="block truncate">{row.account.handle ? `u/${row.account.handle}` : "Not signed in"}</span>
          </TableCell>
          <TableCell column="meta" className="text-right tabular-nums">
            {row.toAnswer}
          </TableCell>
          <TableCell column="actions">
            <Hint label="Open the replies and answer them">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onOpen(row.commentId)}
                aria-label={`Answer the replies on ${row.postTitle}`}
              >
                <MessageCircleReplyIcon className="size-4" />
              </Button>
            </Hint>
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}
