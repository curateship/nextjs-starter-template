import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  FlameIcon,
  ImageOffIcon,
  RotateCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  deleteViralSearches,
  getViralErrorMessage,
  type ViralPageData,
} from "@/lib/api/video/viral"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatRelativeTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSelection } from "@/lib/hooks/use-selection"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { formatClock } from "@/lib/video/timeline-utils"
import {
  VIRAL_DAY_CHOICES,
  type ViralSearchSummary,
  type ViralShort,
} from "@/lib/video/viral"

const viralRoute = getRouteApi("/_authenticated/admin/video-viral")

type ViralSortColumn =
  | "title"
  | "channel"
  | "views"
  | "likes"
  | "comments"
  | "age"
  | "subscribers"

const VIRAL_COLUMNS: SortableColumn<ViralSortColumn>[] = [
  { key: "title", label: "Short", column: "main" },
  { key: "channel", label: "Channel", column: "meta" },
  { key: "views", label: "Views", column: "meta" },
  { key: "likes", label: "Likes", column: "meta" },
  {
    key: "comments",
    label: "Comments",
    column: "meta",
    className: "hidden xl:table-cell",
  },
  { key: "age", label: "Posted", column: "meta" },
  { key: "subscribers", label: "Subscribers", column: "meta" },
]

/** Numeric columns read best biggest-first; words read A to Z. */
function naturalDirection(column: ViralSortColumn): "asc" | "desc" {
  return column === "title" || column === "channel" ? "asc" : "desc"
}

function compareShorts(a: ViralShort, b: ViralShort, column: ViralSortColumn) {
  switch (column) {
    case "title":
      return a.title.localeCompare(b.title)
    case "channel":
      return a.channelTitle.localeCompare(b.channelTitle)
    case "likes":
      return (a.likes ?? -1) - (b.likes ?? -1)
    case "comments":
      return (a.comments ?? -1) - (b.comments ?? -1)
    case "age":
      return Date.parse(a.publishedAt) - Date.parse(b.publishedAt)
    case "subscribers":
      return (a.subscribers ?? -1) - (b.subscribers ?? -1)
    default:
      return a.views - b.views
  }
}

/** "—" when the channel hides the number, never a zero that reads as a true zero. */
function formatCount(value: number | null) {
  return value === null ? "—" : value.toLocaleString()
}

/**
 * The Viral page: type a keyword and see the YouTube Shorts about it. Every
 * search is kept with its results, so the left panel reopens yesterday's
 * keyword without spending any of the day's ~100 free searches. Only pressing
 * Search (or Run again) asks YouTube; after it answers, the address swaps the
 * keyword for the saved search's id, so a reload shows the saved copy free.
 */
export function ViralPage({ data }: { data: ViralPageData }) {
  const router = useRouter()
  const listSearch = viralRoute.useSearch()
  const setListSearch = useListSearchNavigate()

  const keyword = listSearch.q ?? ""
  const openSearch = data.open
  const sort: ViralSortColumn = listSearch.sort ?? "views"
  const direction = listSearch.direction ?? "desc"
  const toggleSort = useListSort<ViralSortColumn>(
    { sort, direction },
    naturalDirection
  )

  // What the boxes show: what was typed, or the open saved search's own
  // keyword and filters, so Search and the day select rerun what is on screen.
  const shownKeyword = keyword || openSearch?.keyword || ""
  const shownMinViews = listSearch.views ?? openSearch?.min_views ?? 0
  const shownDays =
    listSearch.days ?? openSearch?.days ?? VIRAL_DAY_CHOICES[0]

  // What is typed but not yet sent. The address only changes on Search.
  const [draftKeyword, setDraftKeyword] = React.useState(shownKeyword)
  const [draftMinViews, setDraftMinViews] = React.useState(
    shownMinViews ? String(shownMinViews) : ""
  )
  // A pasted link, Back, or opening a saved search changes what the boxes
  // should show; they follow it. Adjusted during render rather than in an
  // effect, per the linted React pattern.
  const [seen, setSeen] = React.useState({ shownKeyword, shownMinViews })
  if (
    seen.shownKeyword !== shownKeyword ||
    seen.shownMinViews !== shownMinViews
  ) {
    setSeen({ shownKeyword, shownMinViews })
    setDraftKeyword(shownKeyword)
    setDraftMinViews(shownMinViews ? String(shownMinViews) : "")
  }

  // A fresh search just landed and was saved: swap `?q=` for `?open=` so a
  // reload (or a shared address) shows the saved copy instead of spending
  // another 102 units.
  React.useEffect(() => {
    if (data.fresh && data.open && listSearch.q) {
      setListSearch({ q: undefined, open: data.open.id })
    }
  }, [data.fresh, data.open, listSearch.q, setListSearch])

  /** Runs a fresh, paid search with what the boxes hold. */
  function runSearch(patch: Record<string, unknown> = {}) {
    const typedViews = Number(draftMinViews)
    setListSearch({
      q: draftKeyword.trim() ? draftKeyword.trim() : undefined,
      open: undefined,
      views:
        Number.isInteger(typedViews) && typedViews > 0 ? typedViews : undefined,
      ...patch,
    })
  }

  const [run, busy] = useAsyncAction(getViralErrorMessage)
  const selection = useSelection()
  const [deleteTargets, setDeleteTargets] = React.useState<
    ViralSearchSummary[]
  >([])

  async function confirmDelete() {
    if (!deleteTargets.length) return
    await run(async () => {
      const { deleted_ids: deleted } = await deleteViralSearches(
        deleteTargets.map((search) => search.id)
      )
      if (!deleted.length) {
        showErrorToast("Nothing was deleted — those may already be gone.")
        return
      }
      selection.clear()
      setDeleteTargets([])
      // If the open search went with them, the address must not keep asking
      // for it.
      if (openSearch && deleted.includes(openSearch.id)) {
        setListSearch({ open: undefined })
      }
      await router.invalidate()
      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: deleteTargets.length - deleted.length,
          one: "saved search",
          many: "saved searches",
          verb: "deleted",
        })
      )
    })
  }

  const sortedItems = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...data.results].sort((a, b) => factor * compareShorts(a, b, sort))
  }, [data.results, direction, sort])

  const emptyText = !data.keyConfigured
    ? data.keyUnreadable
      ? "The saved YouTube API key can no longer be read — paste it again in Settings → YouTube."
      : "Add your YouTube API key in Settings → YouTube to search."
    : shownKeyword
      ? `No Shorts about “${shownKeyword}” in the last ${shownDays} days${shownMinViews ? ` with at least ${shownMinViews.toLocaleString()} views` : ""}.`
      : "Type a keyword and press Search, or pick a past search on the left."

  const selectedSearches = data.searches.filter((search) =>
    selection.selected.has(search.id)
  )

  return (
    <div
      className="flex flex-col items-start lg:flex-row"
      style={{ gap: pageGutter }}
    >
      <Card size="sm" className="w-full shrink-0 lg:w-64">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Past searches</CardTitle>
          {selectedSearches.length ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => setDeleteTargets(selectedSearches)}
            >
              <Trash2Icon className="size-4" />
              Delete ({selectedSearches.length})
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-1">
          {data.searches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every search you run is kept here, so looking at it again is
              free.
            </p>
          ) : (
            data.searches.map((search) => (
              <div
                key={search.id}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5",
                  openSearch?.id === search.id && "bg-muted"
                )}
              >
                <Checkbox
                  checked={selection.selected.has(search.id)}
                  onCheckedChange={() => selection.toggle(search.id)}
                  aria-label={`Select the search “${search.keyword}”`}
                />
                <button
                  type="button"
                  className="grid min-w-0 flex-1 gap-0.5 text-left"
                  onClick={() => setListSearch({ open: search.id, q: undefined })}
                >
                  <span
                    className="truncate text-sm font-medium"
                    title={search.keyword}
                  >
                    {search.keyword}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {`${search.result_count} ${plural(search.result_count, "Short", "Shorts")} · ${formatRelativeTime(search.ran_at)}`}
                  </span>
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 w-full flex-1">
        <DashboardTable
          title="Viral"
          icon={<FlameIcon />}
          count={sortedItems.length}
          error={
            data.error
              ? {
                  message: data.error,
                  onRetry: () => void router.invalidate(),
                }
              : null
          }
          controls={
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                runSearch()
              }}
            >
              <Input
                name="viral-keyword"
                aria-label="Keyword"
                placeholder="A keyword, like home workouts"
                maxLength={100}
                value={draftKeyword}
                onChange={(event) => setDraftKeyword(event.target.value)}
                className="w-56"
              />
              <Select
                value={String(shownDays)}
                onValueChange={(value) =>
                  runSearch({
                    days:
                      Number(value) !== VIRAL_DAY_CHOICES[0]
                        ? Number(value)
                        : undefined,
                  })
                }
              >
                <SelectTrigger aria-label="Posted within">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIRAL_DAY_CHOICES.map((choice) => (
                    <SelectItem key={choice} value={String(choice)}>
                      Last {choice} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                name="viral-min-views"
                aria-label="Minimum views"
                placeholder="Min views"
                inputMode="numeric"
                value={draftMinViews}
                onChange={(event) =>
                  setDraftMinViews(event.target.value.replace(/[^0-9]/g, ""))
                }
                className="w-28"
              />
              <Button type="submit">
                <SearchIcon className="size-4" />
                Search
              </Button>
            </form>
          }
          filters={
            openSearch ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {`Saved results for “${openSearch.keyword}”, ran ${formatRelativeTime(openSearch.ran_at)}. Looking at them costs nothing.`}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    runSearch({
                      q: openSearch.keyword,
                      days:
                        openSearch.days !== VIRAL_DAY_CHOICES[0]
                          ? openSearch.days
                          : undefined,
                      views:
                        openSearch.min_views > 0
                          ? openSearch.min_views
                          : undefined,
                    })
                  }
                >
                  <RotateCwIcon className="size-4" />
                  Run again
                </Button>
              </div>
            ) : null
          }
          header={
            <SortableTableHeader
              columns={VIRAL_COLUMNS}
              sort={sort}
              direction={direction}
              onSort={toggleSort}
            />
          }
          isEmpty={sortedItems.length === 0}
          emptyText={emptyText}
          emptyColSpan={7}
          footer={{
            type: "summary",
            count: sortedItems.length,
            label: "Shorts",
          }}
        >
          {sortedItems.map((item) => (
            <TableRow
              key={item.id}
              className="group"
              rowAction={() =>
                window.open(item.url, "_blank", "noopener,noreferrer")
              }
            >
              <TableCell column="main">
                <div className="flex items-center gap-3">
                  <span className="flex h-16 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImageOffIcon className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <div className="grid min-w-0 gap-0.5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block max-w-md truncate text-left font-medium group-hover:underline"
                      title={item.title}
                    >
                      {item.title}
                    </a>
                    <span className="text-sm text-muted-foreground">
                      {formatClock(item.durationSeconds * 1000)}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell column="meta">
                <span
                  className="block max-w-40 truncate"
                  title={item.channelTitle}
                >
                  {item.channelTitle || "—"}
                </span>
              </TableCell>
              <TableCell column="meta">{item.views.toLocaleString()}</TableCell>
              <TableCell column="meta">{formatCount(item.likes)}</TableCell>
              <TableCell column="meta" className="hidden xl:table-cell">
                {formatCount(item.comments)}
              </TableCell>
              <TableCell column="meta">
                {formatRelativeTime(item.publishedAt)}
              </TableCell>
              <TableCell column="meta">
                {formatCount(item.subscribers)}
              </TableCell>
            </TableRow>
          ))}
        </DashboardTable>
      </div>

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets([])
        }}
        title={
          deleteTargets.length > 1
            ? `Delete ${deleteTargets.length} saved searches?`
            : `Delete the search “${deleteTargets[0]?.keyword}”?`
        }
        description="The keyword and its saved results go; nothing else does. Running the keyword again later starts a fresh search."
        confirmLabel={
          deleteTargets.length > 1 ? "Delete searches" : "Delete search"
        }
        loading={busy}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
