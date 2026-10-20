import * as React from "react"
import { Link } from "@tanstack/react-router"
import { AlertTriangleIcon, Loader2Icon, MessagesSquareIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { usePromoGuest, usePromoShell } from "@/components/social/guest/guest-mode"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { dismissFailed, getCommentsErrorMessage, type FailureRow } from "@/lib/api/social/comments"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"

import { Hint } from "../hint"
import { IN_COLUMN_TABLE } from "../projects/project-columns"

/** Only an address on Reddit is ever opened from a stored value. */
function openOnReddit(url: string) {
  if (url.startsWith("https://www.reddit.com/")) window.open(url, "_blank", "noopener,noreferrer")
}

type SortColumn = "what" | "account" | "why" | "when"

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "what", label: "What", column: "main" },
  // By the middle column's width, not the window's: narrower than 56rem the
  // account and when fold into a line under what failed.
  { key: "account", label: "Account", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "why", label: "Why", column: "meta" },
  { key: "when", label: "When", column: "meta", className: "hidden @4xl:table-cell" },
]

function what(row: FailureRow): string {
  return row.kind === "submit"
    ? row.title || "A post with no title"
    : row.post?.title || "A post that is no longer saved"
}

function compare(a: FailureRow, b: FailureRow, column: SortColumn): number {
  switch (column) {
    case "account":
      return (a.account?.handle ?? "~").localeCompare(b.account?.handle ?? "~")
    // The ones that may be on Reddit anyway first when sorting up.
    case "why":
      return Number(b.mayHaveLanded) - Number(a.mayHaveLanded) || a.reason.localeCompare(b.reason)
    case "when":
      return new Date(a.failedAt).getTime() - new Date(b.failedAt).getTime()
    default:
      return what(a).localeCompare(what(b))
  }
}

function accountText(row: FailureRow): string {
  if (!row.account) return "Account gone"
  return row.account.handle ? `u/${row.account.handle}` : "Not signed in"
}

const KIND_WORDS: Record<FailureRow["kind"], string> = {
  comment: "Comment",
  reply: "Answer to a reply",
  submit: "Post of your own",
}

/**
 * The comments, answers and posts that did not reach Reddit, newest first.
 *
 * A failure is never tried again by itself, because a second go could post
 * twice. One whose browser stopped part-way may be on Reddit anyway, so it
 * says so and offers the post to check by eye. Try again puts the words back
 * where they were written, and Post still needs a press. Dismiss takes a row
 * off this tab once it has been dealt with; the record stays.
 */
export function FailedTable({
  tabs,
  failures,
  error,
  onRefresh,
  onOpenReplies,
}: {
  tabs: React.ReactNode
  failures: FailureRow[]
  error: string | null
  onRefresh: () => Promise<void>
  /** Opens the Replies window of the sent comment an answer sits under. */
  onOpenReplies: (commentId: string) => void
}) {
  const { rowsPerPage } = usePromoShell()
  const selection = useSelection()
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(rowsPerPage)
  const [busy, setBusy] = React.useState(false)
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("when", "desc")
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...failures].sort((a, b) => factor * compare(a, b, sort))
  }, [direction, failures, sort])

  const totalPages = Math.max(1, Math.ceil(failures.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = visible.map((row) => row.id)

  async function dismiss(ids: string[]) {
    setBusy(true)
    try {
      const answer = await dismissFailed(ids)
      toast.success(
        describeBulkResult({
          done: answer.completed.length,
          kept: answer.skipped.length,
          one: "failure",
          many: "failures",
          verb: "dismissed",
          keptReason: "already dismissed",
        })
      )
      selection.clear()
      await onRefresh()
    } catch (failure) {
      showErrorToast(getCommentsErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardTable
      title="Comments that did not go out"
      icon={<MessagesSquareIcon />}
      fillHeight
      className={IN_COLUMN_TABLE}
      tabs={tabs}
      count={failures.length}
      error={error ? { message: error, onRetry: () => void onRefresh() } : null}
      selectedCount={selection.selected.size}
      onClearSelection={selection.clear}
      controls={
        selection.selected.size ? (
          <DashboardToolbarButton
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void dismiss([...selection.selected])}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <XIcon className="size-4" />}
            Dismiss ({selection.selected.size})
          </DashboardToolbarButton>
        ) : null
      }
      header={
        <SortableTableHeader
          columns={COLUMNS}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          leading={
            <SelectAllTableHead
              noun="failures"
              checked={selection.selectAllState(visibleIds)}
              onCheckedChange={() => selection.toggleVisible(visibleIds)}
            />
          }
          trailing={<TableHead column="meta">Actions</TableHead>}
        />
      }
      isEmpty={failures.length === 0}
      emptyText="Nothing failed. Everything you pressed went out."
      emptyColSpan={6}
      footer={{
        type: "pagination",
        page: currentPage,
        pageSize,
        total: failures.length,
        totalPages,
        onPageChange: (next) => setPage(Math.max(1, Math.min(next, totalPages))),
        onPageSizeChange: (next) => {
          setPage(1)
          setPageSize(next)
        },
      }}
    >
      {visible.map((row) => {
        const title = what(row)
        // The title opens the post on Reddit, the same as a row on the Sent tab,
        // so a failure that may have landed is one press from being checked.
        const post = row.post
        const open = post ? () => openOnReddit(post.url) : undefined
        return (
          <TableRow key={row.id} className="group" rowAction={open}>
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(row.id)}
                onCheckedChange={() => selection.toggle(row.id)}
                aria-label={`Select the failure on ${title}`}
              />
            </TableCell>
            <TableCell column="main" className="max-w-0">
              {open ? (
                <Hint label={`${title}. Opens the post on Reddit.`}>
                  <button
                    type="button"
                    className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
                    onClick={open}
                  >
                    {title}
                  </button>
                </Hint>
              ) : (
                <Hint label={title}>
                  <span className="block truncate text-sm font-medium">{title}</span>
                </Hint>
              )}
              <Hint label={row.text}>
                <span className="block truncate text-xs text-muted-foreground">
                  {KIND_WORDS[row.kind]}
                  {row.subreddit ? ` in r/${row.subreddit}` : ""} · {row.text || "No words were saved."}
                </span>
              </Hint>
              <span className="block truncate text-xs text-muted-foreground @4xl:hidden">
                {accountText(row)} · {formatTimeAgo(row.failedAt)}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden max-w-32 @4xl:table-cell">
              <Hint label={accountText(row)}>
                <span className="block truncate">{accountText(row)}</span>
              </Hint>
            </TableCell>
            <TableCell column="meta" className="max-w-72">
              {row.mayHaveLanded ? (
                <Hint label="The browser stopped part-way, so it may have gone out. Press the title to open the post and look before trying again.">
                  <span className="flex min-w-0 items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                    <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">May be on Reddit already</span>
                  </span>
                </Hint>
              ) : null}
              <Hint label={row.reason}>
                <span className="block truncate text-xs text-muted-foreground">{row.reason}</span>
              </Hint>
            </TableCell>
            <TableCell column="meta" className="hidden whitespace-nowrap text-muted-foreground @4xl:table-cell">
              {formatTimeAgo(row.failedAt)}
            </TableCell>
            <TableCell column="actions">
              <TryAgain row={row} onOpenReplies={onOpenReplies} />
              <Hint label="Dismiss: take it off this tab">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() => void dismiss([row.id])}
                  aria-label={`Dismiss the failure on ${title}`}
                >
                  <XIcon className="size-4" />
                </Button>
              </Hint>
            </TableCell>
          </TableRow>
        )
      })}
    </DashboardTable>
  )
}

/**
 * Where the words go back to: a comment to its post's project dashboard with
 * the box filled in, an answer to its comment's Replies window, and a post of
 * your own to its project's New post window. None of them sends anything.
 */
function TryAgain({ row, onOpenReplies }: { row: FailureRow; onOpenReplies: (commentId: string) => void }) {
  // Try again opens the project's page, which for a guest sent from Project is their own one.
  const guest = usePromoGuest()
  const label = "Try again: put the words back where they were written. Nothing is sent until you press Post."
  if (row.kind === "reply" && row.commentId) {
    const commentId = row.commentId
    return (
      <Hint label={label}>
        <Button type="button" variant="ghost" size="icon" onClick={() => onOpenReplies(commentId)} aria-label="Try again">
          <RotateCcwIcon className="size-4" />
        </Button>
      </Hint>
    )
  }
  if (!row.projectId || (row.kind === "comment" && !row.post)) return null
  return (
    <Hint label={label}>
      <Button type="button" variant="ghost" size="icon" asChild>
        <Link
          to={guest ? "/guest/promo/$projectId" : "/admin/projects/$projectId"}
          params={{ projectId: row.projectId }}
          search={row.kind === "comment" ? { post: row.post?.findId, retry: row.id } : { newPost: row.id }}
          aria-label="Try again"
        >
          <RotateCcwIcon className="size-4" />
        </Link>
      </Button>
    </Hint>
  )
}
