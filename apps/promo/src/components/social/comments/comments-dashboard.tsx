import * as React from "react"
import { ExternalLinkIcon, Loader2Icon, MessagesSquareIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  checkComments,
  getCommentsErrorMessage,
  loadComments,
  markNotExample,
  type CommentRow,
} from "@/lib/api/social/comments"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { MAX_CHECKS_PER_PRESS } from "@/lib/social/options"
import { commentStateWords, postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often to ask again while a check is waiting or running. */
const POLL_MS = 2_000

type SortColumn = "post" | "subreddit" | "sent" | "upvotes" | "replies" | "state"

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "post", label: "Post", column: "main" },
  { key: "subreddit", label: "Subreddit", column: "meta", className: "hidden md:table-cell" },
  { key: "sent", label: "Sent", column: "meta", className: "hidden md:table-cell" },
  { key: "upvotes", label: "Upvotes", column: "meta", className: "text-right" },
  { key: "replies", label: "Replies", column: "meta", className: "text-right" },
  { key: "state", label: "Still there", column: "meta" },
  { key: "example", label: "Voice example", column: "meta", sortable: false },
]

/** Not read sorts below every reading, so an unread row never passes for a zero. */
function reading(value: number | null, checked: boolean): number {
  return checked && value !== null ? value : Number.NEGATIVE_INFINITY
}

/** Gone first when sorting up, then there, then never read. */
function stateOrder(row: CommentRow): number {
  if (row.checkedAt === null || row.stillVisible === null) return 2
  return row.stillVisible ? 1 : 0
}

function compare(a: CommentRow, b: CommentRow, column: SortColumn): number {
  switch (column) {
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

/**
 * Every comment the app has sent, and what became of it: its upvotes, how
 * many replies sit under it, and whether it is still there.
 *
 * A reading needs the browser, so Check writes a job and the screen asks
 * again every two seconds until it is done. A comment nobody has checked
 * says so rather than showing 0 replies. A row opens the comment on Reddit.
 *
 * The Voice example switch is the tick that used to live on Settings →
 * Reddit account: off, the AI stops copying how that comment sounds. The
 * comment itself is never changed.
 */
export function CommentsDashboard({ initial }: { initial: CommentRow[] }) {
  const { config } = useShellRuntime()
  const [rows, setRows] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("sent", "desc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const selection = useSelection()
  const [queueing, setQueueing] = React.useState<Set<string>>(new Set())
  const [marking, setMarking] = React.useState<string | null>(null)

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadComments().then(
        (next) => {
          setRows(next)
          setError(null)
        },
        (failure: unknown) => setError(getCommentsErrorMessage(failure))
      ),
    []
  )

  // Asks again only while a check is waiting or running, and stops when none is.
  const anyChecking = rows.some((row) => row.checking)
  React.useEffect(() => {
    if (!anyChecking) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [anyChecking, refresh])

  const shown = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const factor = direction === "asc" ? 1 : -1
    return rows
      .filter(
        (row) =>
          !query ||
          row.postTitle.toLowerCase().includes(query) ||
          row.subreddit.toLowerCase().includes(query) ||
          row.text.toLowerCase().includes(query)
      )
      .sort((a, b) => factor * compare(a, b, sort))
  }, [direction, rows, search, sort])

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
          keptReason: "already being read",
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
      await refresh()
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
      await refresh()
    } catch (failure) {
      showErrorToast(getCommentsErrorMessage(failure))
    } finally {
      setMarking(null)
    }
  }

  return (
    <DashboardTable
      title="Comments"
      icon={<MessagesSquareIcon />}
      count={shown.length}
      error={error ? { message: error, onRetry: () => void refresh() } : null}
      selectedCount={selection.selected.size}
      onClearSelection={selection.clear}
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
          : "Nothing has been sent yet. A comment posted from the Reddit screen shows up here."
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
              <button
                type="button"
                className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
                title={row.postTitle}
                onClick={() => openOnReddit(row.commentUrl)}
              >
                {row.postTitle || "A post with no title"}
              </button>
              <span className="block truncate text-xs text-muted-foreground" title={row.text}>
                {row.text}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden max-w-32 md:table-cell">
              <span className="block truncate text-muted-foreground">r/{row.subreddit}</span>
            </TableCell>
            <TableCell column="meta" className="hidden text-muted-foreground md:table-cell">
              {postedDateText(new Date(row.postedAt))}
            </TableCell>
            <TableCell column="meta" className="text-right tabular-nums">
              {!read ? (
                <span className="text-muted-foreground" title="Not read yet">—</span>
              ) : row.upvotes === null ? (
                <span className="text-muted-foreground" title="Reddit hides this comment's score for now.">
                  Hidden
                </span>
              ) : (
                row.upvotes
              )}
            </TableCell>
            <TableCell column="meta" className="text-right tabular-nums">
              {!read || row.replyCount === null ? (
                <span className="text-muted-foreground" title="Not read yet">—</span>
              ) : (
                row.replyCount
              )}
            </TableCell>
            <TableCell column="meta">
              <span className="block text-sm" title={state.detail}>
                {state.label}
              </span>
              {read ? (
                <span className="block text-xs text-muted-foreground">
                  Read {formatTimeAgo(row.checkedAt)}
                </span>
              ) : null}
            </TableCell>
            <TableCell column="actions">
              <span
                className="inline-flex items-center gap-2"
                title={
                  row.notExample
                    ? "Not used as an example of how you write"
                    : row.inNextDraft
                      ? "In the next draft, as an example of how you write"
                      : "Used as an example once newer ones are switched off"
                }
              >
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
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => void check([row.id])}
                title="Read it again on Reddit"
                aria-label={`Read your comment on ${row.postTitle} again`}
              >
                {busy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <RefreshCwIcon className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => openOnReddit(row.commentUrl)}
                title="Open on Reddit"
                aria-label={`Open your comment on ${row.postTitle} on Reddit`}
              >
                <ExternalLinkIcon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        )
      })}
    </DashboardTable>
  )
}
