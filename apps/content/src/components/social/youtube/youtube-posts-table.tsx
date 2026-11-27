import * as React from "react"
import { ListHeader } from "@/components/content-app/list-header"
import { ExternalLinkIcon, Loader2Icon, PlayIcon, SmartphoneIcon, XIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SelectAllTableHead, SortableTableHeader, type TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { callOffYoutubeUploads, getYoutubeErrorMessage, type YoutubePostRow } from "@/lib/api/social/youtube"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { countWords } from "@/lib/social/phone-apps"
import { postedDateText } from "@/lib/social/wording"
import { YOUTUBE_POST_STATUS_WORDS } from "@/lib/social/youtube/options"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { Hint } from "../hint"
import { IN_COLUMN_TABLE } from "../projects/project-columns"
import { channelName } from "@/lib/social/youtube/options"

/** The middle header every network draws, as Instagram's table does (`app-tables.tsx`). */
const YOUTUBE_TABLE = cn(
  IN_COLUMN_TABLE,
  // The shell table's own toolbar is hidden: the list's header is Content's one `ListHeader`, drawn above
  // it, so this list's header looks like every other (Tyler, 27 Nov 2026: "fix ui for promote dashboard").
  "h-auto min-h-0 flex-1 [&>:first-child]:hidden"
)

type PostColumn = "post" | "channel" | "status" | "views" | "likes" | "comments" | "posted"

const POST_COLUMNS: TableHeaderColumn<PostColumn>[] = [
  { key: "post", label: "Video", column: "main" },
  // By the middle column's width: narrower than 56rem the channel and the date fold into the line under the title.
  { key: "channel", label: "Channel", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "status", label: "Status", column: "meta" },
  { key: "views", label: "Views", column: "meta", className: "text-right" },
  { key: "likes", label: "Likes", column: "meta", className: "hidden text-right @2xl:table-cell" },
  { key: "comments", label: "Comments", column: "meta", className: "hidden text-right @2xl:table-cell" },
  { key: "posted", label: "Uploaded", column: "meta", className: "hidden @4xl:table-cell" },
]

const time = (value: Date | string | null) => (value ? new Date(value).getTime() : 0)
const figure = (value: number | null) => value ?? -1

function comparePosts(a: YoutubePostRow, b: YoutubePostRow, column: PostColumn): number {
  switch (column) {
    case "channel":
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
      return a.title.localeCompare(b.title)
  }
}

/**
 * The videos and Shorts this project uploaded, newest first, with the views,
 * likes and comments the daily reading last read off each (YouTube task,
 * parts 3 and 8). An upload that has not started can be called off; once
 * the browser or phone has started it cannot.
 */
export function YoutubePostsTable({
  tabs,
  controls,
  menu,
  rows,
  reading,
  canManage,
  onRefresh,
}: {
  tabs: React.ReactNode
  controls: React.ReactNode
  /** The project's ⋮, last in the header. */
  menu?: React.ReactNode
  rows: YoutubePostRow[]
  /**
   * While the list is read, what shows under the header in place of the
   * table (reading, or why it failed). The header is this table's either
   * way, so it is drawn once and not again when the posts arrive, which
   * restarted the project tabs' slide (Tyler, 27 Nov 2026: "CLicking on
   * promote tab has a bug that flashes the tab").
   */
  reading?: React.ReactNode
  /** False for a guest sent from Project, who only looks. */
  canManage: boolean
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
      const { skipped } = await callOffYoutubeUploads(ids)
      if (ids.length === 1 && skipped.length) showErrorToast("That upload has already started, so it cannot be called off now.")
      else if (skipped.length) showErrorToast(`${skipped.length} of ${ids.length} had already started, so they were not called off.`)
      selection.clear()
      await onRefresh()
    } catch (failure) {
      showErrorToast(getYoutubeErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ListHeader
        tabs={tabs}
        selected={
          selection.selected.size ? (
            <>
              <DashboardToolbarButton type="button" variant="ghost" onClick={selection.clear}>
                Clear {selection.selected.size} selected
              </DashboardToolbarButton>
              {selection.selected.size && canManage ? (
                <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => void callOff([...selection.selected])}>
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : <XIcon className="size-4" />}
                  Call off ({selection.selected.size})
                </DashboardToolbarButton>
              ) : null}
            </>
          ) : null
        }
        primary={controls}
        menuLabel="More for these posts"
        search={null}
        massSelect={null}
        end={menu}
      />
      {reading ?? (
      <DashboardTable
        title="Posts"
        fillHeight
        className={YOUTUBE_TABLE}
        count={rows.length}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        header={
          <SortableTableHeader
            columns={POST_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={<SelectAllTableHead noun="videos" checked={selection.selectAllState(visibleIds)} onCheckedChange={() => selection.toggleVisible(visibleIds)} />}
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={rows.length === 0}
        emptyText="Nothing uploaded to YouTube from this project yet. Pick a video on the right and press Post."
        emptyColSpan={POST_COLUMNS.length + 2}
        footer={{ type: "summary", count: rows.length, label: "videos" }}
      >
        {sorted.map((row) => {
          const name = channelName(row.account.handle)
          const when = postedDateText(new Date(row.postedAt ?? row.createdAt))
          const numbersWhen = row.numbersReadAt ? `Numbers read ${postedDateText(new Date(row.numbersReadAt)).toLowerCase()}` : "Numbers not read yet"
          return (
            <TableRow key={row.id} className="group">
              <TableCell column="select">
                <Checkbox checked={selection.selected.has(row.id)} onCheckedChange={() => selection.toggle(row.id)} aria-label={`Select ${row.title}`} />
              </TableCell>
              <TableCell column="main" className="max-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  {row.isShort ? (
                    <SmartphoneIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Short" />
                  ) : (
                    <PlayIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Video" />
                  )}
                  <Hint label={row.title}>
                    <span className="block truncate text-sm font-medium">{row.title}</span>
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
                {row.thumbnailNote ? (
                  <Hint label={row.thumbnailNote}>
                    <span className="block truncate text-xs text-amber-600 dark:text-amber-400">Thumbnail not set: {row.thumbnailNote}</span>
                  </Hint>
                ) : null}
              </TableCell>
              <TableCell column="meta" className="hidden max-w-32 @4xl:table-cell">
                <span className="block truncate">{name}</span>
              </TableCell>
              <TableCell column="meta">
                <span className={cn(row.status === "failed" ? "text-destructive" : row.status === "waiting" ? "text-muted-foreground" : "")}>
                  {YOUTUBE_POST_STATUS_WORDS[row.status]}
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
                  <Hint label="Open it on YouTube">
                    <Button type="button" size="icon" variant="ghost" asChild>
                      <a href={row.postUrl} target="_blank" rel="noreferrer" aria-label={`Open ${row.title} on YouTube`}>
                        <ExternalLinkIcon className="size-4" />
                      </a>
                    </Button>
                  </Hint>
                ) : null}
                {row.cancellable && canManage ? (
                  <Hint label="Call off: the upload has not started">
                    <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => void callOff([row.id])} aria-label={`Call off ${row.title}`}>
                      <XIcon className="size-4" />
                    </Button>
                  </Hint>
                ) : null}
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>
      )}
    </>
  )
}
