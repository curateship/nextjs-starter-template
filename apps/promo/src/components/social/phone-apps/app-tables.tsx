import * as React from "react"
import { ExternalLinkIcon, ImageIcon, Loader2Icon, PlayIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  callOffAppPosts,
  getPhoneAppErrorMessage,
  skipInboxItems,
  type AppPostRow,
  type InboxRow,
} from "@/lib/api/social/phone-apps"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { handleWords, NETWORK_NAMES, type PhoneAppNetwork } from "@/lib/social/networks"
import { countWords, INBOX_STATUS_WORDS, POST_STATUS_WORDS } from "@/lib/social/phone-apps"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { Hint } from "../hint"
import { IN_COLUMN_TABLE } from "../projects/project-columns"

type PostColumn = "post" | "account" | "status" | "views" | "likes" | "comments" | "posted"

const POST_COLUMNS: TableHeaderColumn<PostColumn>[] = [
  { key: "post", label: "Post", column: "main" },
  // By the middle column's width: narrower than 56rem the account and the
  // date fold into the line under the caption.
  { key: "account", label: "Account", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "status", label: "Status", column: "meta" },
  { key: "views", label: "Views", column: "meta", className: "text-right" },
  { key: "likes", label: "Likes", column: "meta", className: "hidden text-right @2xl:table-cell" },
  { key: "comments", label: "Comments", column: "meta", className: "hidden text-right @2xl:table-cell" },
  { key: "posted", label: "Posted", column: "meta", className: "hidden @4xl:table-cell" },
]

const time = (value: Date | string | null) => (value ? new Date(value).getTime() : 0)
const figure = (value: number | null) => value ?? -1

function comparePosts(a: AppPostRow, b: AppPostRow, column: PostColumn): number {
  switch (column) {
    case "account":
      return (a.account.handle || "~").localeCompare(b.account.handle || "~")
    case "status":
      return a.status.localeCompare(b.status)
    case "views":
      return figure(a.views) - figure(b.views)
    case "likes":
      return figure(a.likes) - figure(b.likes)
    case "comments":
      return figure(a.comments) - figure(b.comments)
    case "posted":
      return time(a.postedAt ?? a.createdAt) - time(b.postedAt ?? b.createdAt)
    default:
      return (a.caption || a.mediaName).localeCompare(b.caption || b.mediaName)
  }
}

/**
 * The posts this project made on the network, newest first, with the views,
 * likes and comments the daily health visit last read off each (part 39).
 * A post still waiting for its phone can be called off; once the phone has
 * started it cannot.
 */
export function AppPostsTable({
  network,
  tabs,
  controls,
  rows,
  onRefresh,
}: {
  network: PhoneAppNetwork
  tabs: React.ReactNode
  controls: React.ReactNode
  rows: AppPostRow[]
  onRefresh: () => Promise<void>
}) {
  const { sort, direction, toggleSort } = useTableSort<PostColumn>("posted", "desc")
  const selection = useSelection()
  const [busy, setBusy] = React.useState(false)
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => factor * comparePosts(a, b, sort))
  }, [direction, rows, sort])
  const visibleIds = sorted.map((row) => row.id)

  async function callOff(ids: string[]) {
    setBusy(true)
    try {
      const { completed, skipped } = await callOffAppPosts(ids)
      if (ids.length === 1 && skipped.length) {
        showErrorToast("The phone has already started on that post, so it cannot be called off now.")
      } else {
        toast.success(
          describeBulkResult({
            done: completed.length,
            kept: skipped.length,
            one: "post",
            many: "posts",
            verb: "called off",
            keptReason: "already started on the phone",
          })
        )
      }
      selection.clear()
      await onRefresh()
    } catch (failure) {
      showErrorToast(getPhoneAppErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardTable
      title="Posts"
      fillHeight
      className={IN_COLUMN_TABLE}
      tabs={tabs}
      count={rows.length}
      selectedCount={selection.selected.size}
      onClearSelection={selection.clear}
      controls={
        <>
          {selection.selected.size ? (
            <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => void callOff([...selection.selected])}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <XIcon className="size-4" />}
              Call off ({selection.selected.size})
            </DashboardToolbarButton>
          ) : null}
          {controls}
        </>
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
      emptyText={`Nothing posted on ${NETWORK_NAMES[network]} from this project yet. Pick a photo or video on the right and press Post.`}
      emptyColSpan={POST_COLUMNS.length + 2}
      footer={{ type: "summary", count: rows.length, label: "posts" }}
    >
      {sorted.map((row) => {
        const name = handleWords(network, row.account.handle) || "An account not signed in"
        const when = postedDateText(new Date(row.postedAt ?? row.createdAt))
        const title = row.caption.split("\n")[0] || row.mediaName || "A post with no caption"
        const numbersWhen = row.numbersReadAt ? `Numbers read ${postedDateText(new Date(row.numbersReadAt)).toLowerCase()}` : "Numbers not read yet"
        return (
          <TableRow key={row.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(row.id)}
                onCheckedChange={() => selection.toggle(row.id)}
                aria-label={`Select ${title}`}
              />
            </TableCell>
            <TableCell column="main" className="max-w-0">
              <span className="flex min-w-0 items-center gap-2">
                {row.mediaKind === "video" ? (
                  <PlayIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Video" />
                ) : (
                  <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Photo" />
                )}
                <Hint label={row.caption || row.mediaName}>
                  <span className="block truncate text-sm font-medium">{title}</span>
                </Hint>
              </span>
              <span className="block truncate text-xs text-muted-foreground @4xl:hidden">
                {name} · {when}
              </span>
              {row.status === "failed" && row.lastError ? (
                <Hint label={row.lastError}>
                  <span className="block truncate text-xs text-destructive">{row.lastError}</span>
                </Hint>
              ) : null}
            </TableCell>
            <TableCell column="meta" className="hidden max-w-32 @4xl:table-cell">
              <span className="block truncate">{name}</span>
            </TableCell>
            <TableCell column="meta">
              <span className={cn(row.status === "failed" ? "text-destructive" : row.status === "waiting" ? "text-muted-foreground" : "")}>
                {POST_STATUS_WORDS[row.status]}
              </span>
            </TableCell>
            <TableCell column="meta" className="text-right tabular-nums">
              <Hint label={numbersWhen}>
                <span>{countWords(row.views)}</span>
              </Hint>
            </TableCell>
            <TableCell column="meta" className="hidden text-right tabular-nums @2xl:table-cell">
              {countWords(row.likes)}
            </TableCell>
            <TableCell column="meta" className="hidden text-right tabular-nums @2xl:table-cell">
              {countWords(row.comments)}
            </TableCell>
            <TableCell column="meta" className="hidden text-muted-foreground @4xl:table-cell">
              {when}
            </TableCell>
            <TableCell column="actions">
              {row.postUrl ? (
                <Hint label={`Open it on ${NETWORK_NAMES[network]}`}>
                  <Button type="button" size="icon" variant="ghost" asChild>
                    <a href={row.postUrl} target="_blank" rel="noreferrer" aria-label={`Open ${title} on ${NETWORK_NAMES[network]}`}>
                      <ExternalLinkIcon className="size-4" />
                    </a>
                  </Button>
                </Hint>
              ) : null}
              {row.cancellable ? (
                <Hint label="Call off: the phone has not started on it">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void callOff([row.id])}
                    aria-label={`Call off ${title}`}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </Hint>
              ) : null}
            </TableCell>
          </TableRow>
        )
      })}
    </DashboardTable>
  )
}

type CommentColumn = "comment" | "account" | "status" | "when"

const COMMENT_COLUMNS: TableHeaderColumn<CommentColumn>[] = [
  { key: "comment", label: "Comment", column: "main" },
  { key: "account", label: "On a post by", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "status", label: "Status", column: "meta" },
  { key: "when", label: "Read", column: "meta", className: "hidden @2xl:table-cell" },
]

function compareComments(a: InboxRow, b: InboxRow, column: CommentColumn): number {
  switch (column) {
    case "account":
      return (a.account.handle || "~").localeCompare(b.account.handle || "~")
    case "status":
      return a.status.localeCompare(b.status)
    case "when":
      return time(a.updatedAt) - time(b.updatedAt)
    default:
      return a.author.localeCompare(b.author)
  }
}

/**
 * Comments left under this project's posts on the network (part 37), read
 * when the app's notification said one arrived. Each opens beside the list
 * with a suggested answer; nothing is sent until Send is pressed.
 */
export function AppCommentsTable({
  network,
  tabs,
  controls,
  rows,
  selectedId,
  onOpen,
  onRefresh,
}: {
  network: PhoneAppNetwork
  tabs: React.ReactNode
  controls: React.ReactNode
  rows: InboxRow[]
  selectedId: string | null
  onOpen: (id: string) => void
  onRefresh: () => Promise<void>
}) {
  const { sort, direction, toggleSort } = useTableSort<CommentColumn>("when", "desc")
  const selection = useSelection()
  const [busy, setBusy] = React.useState(false)
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => factor * compareComments(a, b, sort))
  }, [direction, rows, sort])
  const visibleIds = sorted.map((row) => row.id)

  async function skip(ids: string[]) {
    setBusy(true)
    try {
      const answer = await skipInboxItems(ids)
      toast.success(
        describeBulkResult({
          done: answer.completed.length,
          kept: answer.skipped.length,
          one: "comment",
          many: "comments",
          verb: "skipped",
          keptReason: "an answer is on its way",
        })
      )
      selection.clear()
      await onRefresh()
    } catch (failure) {
      showErrorToast(getPhoneAppErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardTable
      title="Comments"
      fillHeight
      className={IN_COLUMN_TABLE}
      tabs={tabs}
      count={rows.length}
      selectedCount={selection.selected.size}
      onClearSelection={selection.clear}
      controls={
        <>
          {selection.selected.size ? (
            <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => void skip([...selection.selected])}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <XIcon className="size-4" />}
              Skip ({selection.selected.size})
            </DashboardToolbarButton>
          ) : null}
          {controls}
        </>
      }
      header={
        <SortableTableHeader
          columns={COMMENT_COLUMNS}
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
      emptyText={`No comments yet. When ${NETWORK_NAMES[network]} tells a phone someone commented on one of its posts, the phone reads it and it shows here.`}
      emptyColSpan={COMMENT_COLUMNS.length + 2}
      footer={{ type: "summary", count: rows.length, label: "comments" }}
    >
      {sorted.map((row) => {
        const line = row.lines[row.lines.length - 1]
        const name = handleWords(network, row.account.handle) || "your account"
        return (
          <TableRow
            key={row.id}
            className={cn("group", row.id === selectedId && "bg-muted")}
            rowAction={() => onOpen(row.id)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(row.id)}
                onCheckedChange={() => selection.toggle(row.id)}
                aria-label={`Select the comment by ${row.author}`}
              />
            </TableCell>
            <TableCell column="main" className="max-w-0">
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
              >
                {row.author}: {line?.text ?? ""}
              </button>
              <span className="block truncate text-xs text-muted-foreground">
                {row.thread ? `Under "${row.thread}"` : "Under one of its posts"}
                <span className="@4xl:hidden"> · {name}</span>
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden max-w-32 @4xl:table-cell">
              <span className="block truncate">{name}</span>
            </TableCell>
            <TableCell column="meta">
              <span className={cn(row.status === "open" ? "font-medium" : "text-muted-foreground", row.lastError && "text-destructive")}>
                {row.lastError ? "Answer failed" : INBOX_STATUS_WORDS[row.status]}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden text-muted-foreground @2xl:table-cell">
              {postedDateText(new Date(row.updatedAt))}
            </TableCell>
            <TableCell column="actions">
              {row.status === "open" ? (
                <Hint label="Skip: put it away without answering">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void skip([row.id])}
                    aria-label={`Skip the comment by ${row.author}`}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </Hint>
              ) : null}
            </TableCell>
          </TableRow>
        )
      })}
    </DashboardTable>
  )
}
