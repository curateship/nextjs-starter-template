import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { FlameIcon, ImageOffIcon, SearchIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableRow } from "@/components/ui/table"
import type { ViralPageData } from "@/lib/api/video/viral"
import { formatRelativeTime } from "@/lib/format/format-time"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import { formatClock } from "@/lib/video/timeline-utils"
import { VIRAL_DAY_CHOICES, type ViralShort } from "@/lib/video/viral"

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

function watchAddress(short: ViralShort) {
  return `https://www.youtube.com/shorts/${encodeURIComponent(short.id)}`
}

/**
 * The Viral page: type a keyword and see the YouTube Shorts about it, with
 * each one's numbers and its channel's size. Searching only happens when the
 * keyword is sent — every search spends 102 of the day's 10,000 free YouTube
 * units, so typing alone must never search.
 */
export function ViralPage({ data }: { data: ViralPageData }) {
  const router = useRouter()
  const listSearch = viralRoute.useSearch()
  const setListSearch = useListSearchNavigate()

  const keyword = listSearch.q ?? ""
  const days = listSearch.days ?? VIRAL_DAY_CHOICES[0]
  const minViews = listSearch.views ?? 0
  const sort: ViralSortColumn = listSearch.sort ?? "views"
  const direction = listSearch.direction ?? "desc"
  const toggleSort = useListSort<ViralSortColumn>(
    { sort, direction },
    naturalDirection
  )

  // What is typed but not yet sent. The address only changes on Search.
  const [draftKeyword, setDraftKeyword] = React.useState(keyword)
  const [draftMinViews, setDraftMinViews] = React.useState(
    minViews ? String(minViews) : ""
  )
  // A pasted link or Back changes the address; the boxes follow it. Adjusted
  // during render rather than in an effect, per the linted React pattern.
  const [seenSearch, setSeenSearch] = React.useState({ keyword, minViews })
  if (seenSearch.keyword !== keyword || seenSearch.minViews !== minViews) {
    setSeenSearch({ keyword, minViews })
    setDraftKeyword(keyword)
    setDraftMinViews(minViews ? String(minViews) : "")
  }

  function runSearch(patch: Record<string, unknown> = {}) {
    const typedViews = Number(draftMinViews)
    setListSearch({
      q: draftKeyword.trim() ? draftKeyword.trim() : undefined,
      views:
        Number.isInteger(typedViews) && typedViews > 0 ? typedViews : undefined,
      ...patch,
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
    : !keyword
      ? "Type a keyword and press Search to see the YouTube Shorts about it."
      : `No Shorts about “${keyword}” in the last ${days} days${minViews ? ` with at least ${minViews.toLocaleString()} views` : ""}.`

  return (
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
            value={String(days)}
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
      footer={{ type: "summary", count: sortedItems.length, label: "Shorts" }}
    >
      {sortedItems.map((item) => (
        <TableRow
          key={item.id}
          className="group"
          rowAction={() =>
            window.open(watchAddress(item), "_blank", "noopener,noreferrer")
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
                  href={watchAddress(item)}
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
            <span className="block max-w-40 truncate" title={item.channelTitle}>
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
          <TableCell column="meta">{formatCount(item.subscribers)}</TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}
