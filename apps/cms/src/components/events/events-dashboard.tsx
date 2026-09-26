import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  CalendarDaysIcon,
  CopyIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { EventDialog } from "@/components/events/event-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import type { Category } from "@/lib/api/directory/categories"
import {
  copyEvent,
  getEventErrorMessage,
  removeEvents,
  type EventsPage,
  type EventSummary,
} from "@/lib/api/events/events"
import {
  LISTING_STATUS_FILTERS,
  LISTING_STATUS_LABELS,
  type ListingStatusFilter,
} from "@/lib/directory/listing-sort"
import {
  DEFAULT_EVENT_SORT,
  EVENT_VIEW_RANGES,
  EVENT_VIEW_RANGE_LABELS,
  eventSortDirection,
  type EventSortColumn,
  type EventViewRange,
} from "@/lib/events/event-sort"
import { describeRepeat } from "@/lib/events/event-repeat"
import { formatEventStart } from "@/lib/events/event-time"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"

function columnsFor(
  viewDays: EventViewRange
): SortableColumn<EventSortColumn>[] {
  return [
    { key: "title", label: "Event", column: "main" },
    { key: "status", label: "Status", column: "meta" },
    { key: "date", label: "Date", column: "meta" },
    {
      key: "views",
      label: viewDays === "all" ? "Views" : "30-day views",
      column: "meta",
    },
    {
      key: "updated",
      label: "Updated",
      column: "meta",
      className: "hidden md:table-cell",
    },
  ]
}

/**
 * The admin's Events screen: this site's events, searched, filtered by
 * status, sorted and paged on the server, in the same table as Posts. The list
 * opens on the latest event date first. A row opens the event's window over
 * the list, and `?open=<id>` in the address says which.
 */
export function EventsDashboard({
  data,
  categories,
  search,
}: {
  data: EventsPage
  categories: Category[]
  search: {
    q?: string
    status?: ListingStatusFilter
    sort?: EventSortColumn
    direction?: "asc" | "desc"
    days?: EventViewRange
    open?: string
  }
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const [searchText, setSearchText] = useSearchBoxText(search.q ?? "", (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const sort = search.sort ?? DEFAULT_EVENT_SORT
  const direction = search.direction ?? eventSortDirection(sort)
  const viewDays = search.days ?? "all"
  const columns = React.useMemo(() => columnsFor(viewDays), [viewDays])
  const toggleSort = useListSort<EventSortColumn>(
    { sort, direction },
    eventSortDirection
  )

  const selection = useSelection()
  const selectedIds = selection.selected
  const [run, deleting] = useAsyncAction(getEventErrorMessage)
  const [creating, setCreating] = React.useState(false)
  const [confirm, setConfirm] = React.useState<{
    ids: string[]
    title: string | null
    /** Later dates of repeating events among them, which go too. */
    dates: number
  } | null>(null)
  const askToDelete = (ids: string[], title: string | null) =>
    setConfirm({
      ids,
      title,
      dates: data.events
        .filter((event) => ids.includes(event.id))
        .reduce((sum, event) => sum + event.seriesDates.total, 0),
    })

  const listKey = `${search.q ?? ""}|${search.status ?? ""}|${sort}|${direction}|${viewDays}|${data.page}|${data.pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)

  const visibleIds = React.useMemo(
    () => data.events.map((event) => event.id),
    [data.events]
  )
  const openRow = search.open
    ? (data.events.find((event) => event.id === search.open) ?? null)
    : null

  /** Opening pushes a history entry, so Back closes the window. */
  const setOpen = React.useCallback(
    (id: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )
  const openEditor = (event: EventSummary) => setOpen(event.id)

  const [copy, copying] = useAsyncAction(getEventErrorMessage)
  /** A draft copy, opened at once so the admin can change the date. */
  const duplicate = (event: EventSummary) => {
    void copy(async () => {
      const made = await copyEvent(event.id)
      await router.invalidate()
      toast.success(`${made.title} was created as a draft.`)
      setOpen(made.id)
    })
  }

  const confirmDelete = async () => {
    if (!confirm) return
    await run(async () => {
      const { done, kept } = await removeEvents(confirm.ids)
      await router.invalidate()
      selection.setSelected(new Set(kept))
      if (done.length === 0) {
        throw new Error(
          "No events were deleted. They may already be gone. The list has been refreshed."
        )
      }
      toast.success(
        describeBulkResult({
          done: done.length,
          kept: kept.length,
          one: "event",
          many: "events",
          verb: "deleted",
        })
      )
      setConfirm(null)
    })
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <>
      <DashboardTable
        title="Events"
        icon={<CalendarDaysIcon className="text-muted-foreground" />}
        count={data.total}
        fillHeight
        className="h-auto max-h-full"
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => askToDelete([...selectedIds], null)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="event-search"
              aria-label="Search events"
              placeholder="Search title, address or place…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={search.status ?? "all"}
              onValueChange={(value) =>
                setListSearch({
                  status: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <SelectTrigger className="w-fit" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {LISTING_STATUS_FILTERS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {LISTING_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(viewDays)}
              onValueChange={(value) =>
                setListSearch({
                  days: value === "all" ? undefined : Number(value),
                  page: undefined,
                })
              }
            >
              <SelectTrigger className="w-fit" aria-label="Choose view range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_VIEW_RANGES.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {EVENT_VIEW_RANGE_LABELS[days]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              onClick={() => setCreating(true)}
            >
              <PlusIcon className="size-4" />
              New event
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={columns}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select all events on this page"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={data.events.length === 0}
        emptyText={
          search.q?.trim() || search.status
            ? "No event matches that search."
            : "No events yet. Add the first one."
        }
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages,
          onPageChange: (page) =>
            setListSearch({ page: page > 1 ? page : undefined }),
          onPageSizeChange: (size) => setListSearch({ size, page: undefined }),
        }}
      >
        {data.events.map((event) => (
          <TableRow
            key={event.id}
            className="group"
            rowAction={() => openEditor(event)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(event.id)}
                onCheckedChange={() => selection.toggle(event.id)}
                aria-label={`Select ${event.title}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => openEditor(event)}
                title={event.title}
              >
                {event.title}
              </button>
              <span className="block max-w-96 truncate text-xs text-muted-foreground">
                {repeatLine(event) ||
                  event.placeName ||
                  (event.categories.length
                    ? event.categories.join(", ")
                    : `/events/${event.slug}`)}
              </span>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                {event.status === "published" ? (
                  <Badge variant="secondary">Published</Badge>
                ) : (
                  <Badge variant="outline">Draft</Badge>
                )}
                {event.visibility === "private" ? (
                  <Badge variant="outline">Private</Badge>
                ) : null}
                {event.repeat ? <Badge variant="outline">Repeats</Badge> : null}
                {event.featuredNow ? (
                  <Badge variant="outline">Featured</Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell column="meta">{formatEventStart(event)}</TableCell>
            <TableCell column="meta">{event.views.toLocaleString()}</TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {formatDate(event.updatedAt)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Duplicate ${event.title}`}
                  disabled={copying}
                  onClick={() => duplicate(event)}
                >
                  <CopyIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${event.title}`}
                  onClick={() => openEditor(event)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${event.title}`}
                  disabled={deleting}
                  onClick={() => askToDelete([event.id], event.title)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {/* One window for editing and creating. */}
      <EventDialog
        open={creating || Boolean(search.open)}
        eventId={creating ? null : (search.open ?? null)}
        categories={categories}
        preview={
          openRow ? { title: openRow.title, status: openRow.status } : null
        }
        onClose={() => {
          if (creating) setCreating(false)
          else setOpen(undefined)
        }}
        onSaved={() => void router.invalidate()}
        onOpenEvent={setOpen}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={
          confirm && confirm.ids.length === 1
            ? "Delete this event?"
            : `Delete ${confirm?.ids.length ?? 0} events?`
        }
        description={
          confirm
            ? deleteWarning(confirm)
            : null
        }
        confirmLabel={
          confirm && confirm.ids.length > 1
            ? `Delete ${confirm.ids.length} events`
            : "Delete event"
        }
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

/** What the delete window says goes, dates of repeating events included. */
function deleteWarning(confirm: {
  ids: string[]
  title: string | null
  dates: number
}): string {
  const keeps = "The listings and categories they point at stay."
  if (confirm.ids.length > 1) {
    const dates = confirm.dates
      ? ` So do ${datesText(confirm.dates)} of the repeating events among them.`
      : ""
    return `${confirm.ids.length} events go for good, and their pages stop existing.${dates} ${keeps}`
  }
  const title = confirm.title ?? "The event"
  if (confirm.dates) {
    return `${title} and its ${datesText(confirm.dates)} go for good, and their pages stop existing. ${keeps}`
  }
  return `${title} goes for good, and its page stops existing. The listings and categories it points at stay.`
}

function datesText(count: number): string {
  return `${count} later ${count === 1 ? "date" : "dates"}`
}

/**
 * A main event's line under its title: "Every Thursday · 7 more dates coming",
 * or "No longer repeats · 12 later dates" once its repeat is stopped.
 */
function repeatLine(event: EventSummary): string | null {
  const { total, upcoming } = event.seriesDates
  if (event.repeat) {
    return `${describeRepeat(event.repeat)} · ${upcoming} more ${upcoming === 1 ? "date" : "dates"} coming`
  }
  return total ? `No longer repeats · ${datesText(total)}` : null
}
