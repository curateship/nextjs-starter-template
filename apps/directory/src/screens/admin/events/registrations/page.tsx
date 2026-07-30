"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Users from "lucide-react/dist/esm/icons/users.js"

import {
  cancelEventRegistrationAction,
  getEventRegistrationListAction,
  type EventRegistrationEventSummary,
  type EventRegistrationListItem,
  type EventRegistrationStatus,
} from "@/lib/actions/events/event-registration-actions"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import {
  AdminListPending,
  AdminSortButton,
  AdminTableShell,
  ConfirmDestructive,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCentsAmount } from "@/lib/actions/directories/directory-featured-helpers"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"

type SortColumn = "attendee" | "event" | "ticket" | "status" | "registered"

const ALL_EVENTS = "all"

const STATUS_RANK: Record<EventRegistrationStatus, number> = {
  confirmed: 0,
  pending: 1,
  cancelled: 2,
}

function statusBadge(status: EventRegistrationStatus) {
  switch (status) {
    case "confirmed":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Registered</Badge>
    case "pending":
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Awaiting payment</Badge>
    default:
      return <Badge variant="destructive">Removed</Badge>
  }
}

function ticketLabel(row: EventRegistrationListItem) {
  return formatCentsAmount(row.amount_total, row.currency) || "Free"
}

/** "12 of 30 seats taken · 8 checked in" — the two numbers an organizer wants. */
function seatSummary(summary: EventRegistrationEventSummary) {
  const taken = summary.confirmed_count
  const parts = [summary.capacity === null ? `${taken} signed up` : `${taken} of ${summary.capacity} seats taken`]
  if (summary.pending_count > 0) parts.push(`${summary.pending_count} awaiting payment`)
  parts.push(`${summary.checked_in_count} of ${taken} checked in`)
  return parts.join(" · ")
}

export default function EventRegistrationsPage() {
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
  const [rows, setRows] = useState<EventRegistrationListItem[]>([])
  const [eventSummaries, setEventSummaries] = useState<EventRegistrationEventSummary[]>([])
  const [eventFilter, setEventFilter] = useState<string>(ALL_EVENTS)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [removeTargets, setRemoveTargets] = useState<string[] | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const selection = useAdminBulkSelection()
  const sort = useAdminSort<SortColumn>("registered", "desc")

  const loadRows = useCallback(async () => {
    if (!currentSite?.id) {
      setRows([])
      setEventSummaries([])
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await getEventRegistrationListAction({ data: { siteId: currentSite.id } })
      if (result.error) {
        setError(result.error)
        setRows([])
        setEventSummaries([])
        return
      }
      setRows(result.data)
      setEventSummaries(result.events)
      setTruncated(result.truncated)
    } catch (err) {
      console.error("Failed to load event registrations:", err)
      setError("Could not load registrations. Please try again.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [currentSite?.id, siteLoading])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  // A site switch invalidates both the event filter and any selection.
  useEffect(() => {
    setEventFilter(ALL_EVENTS)
    selection.clearSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSite?.id])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (eventFilter !== ALL_EVENTS && row.event_id !== eventFilter) return false
      if (!term) return true
      return (
        row.name.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term) ||
        row.event_title.toLowerCase().includes(term)
      )
    })
  }, [eventFilter, query, rows])

  const sorted = useMemo(() => {
    const dir = sort.sortDirection === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.sortColumn === "attendee") return a.name.localeCompare(b.name) * dir
      if (sort.sortColumn === "event") return a.event_title.localeCompare(b.event_title) * dir
      if (sort.sortColumn === "ticket") return ((a.amount_total || 0) - (b.amount_total || 0)) * dir
      if (sort.sortColumn === "status") {
        const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status]
        return (rank !== 0 ? rank : a.name.localeCompare(b.name)) * dir
      }
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    })
  }, [filtered, sort.sortColumn, sort.sortDirection])

  const visibleIds = sorted.map((row) => row.id)
  const removableSelected = sorted.filter(
    (row) => selection.selectedIds.has(row.id) && row.status !== "cancelled",
  )

  const selectedSummary = eventFilter === ALL_EVENTS
    ? null
    : eventSummaries.find((summary) => summary.id === eventFilter) || null

  const handleRemove = async () => {
    if (!removeTargets?.length) return
    setRemoveError(null)

    const results = await Promise.all(
      removeTargets.map((registrationId) => cancelEventRegistrationAction({ data: { registrationId } })),
    )
    const failed = results.filter((result) => !result.success)

    if (failed.length === results.length) {
      const message = failed[0]?.error || "Could not remove these registrations."
      setRemoveError(message)
      return
    }

    setRemoveTargets(null)
    selection.clearSelection()
    const removed = results.length - failed.length
    if (failed.length) showActionError(`Removed ${removed}, ${failed.length} failed`)
    else showActionSuccess(`Removed ${removed} ${removed === 1 ? "registration" : "registrations"}`)
    await loadRows()
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Events", href: "/admin/events" }, { label: "Registrations" }]} />

          <AdminTableShell
            title="Event Registrations"
            icon={<Users className="text-muted-foreground" />}
            count={filtered.length}
            loading={loading}
            titleMeta={selectedSummary ? (
              <span className="text-xs text-muted-foreground sm:text-sm">{seatSummary(selectedSummary)}</span>
            ) : null}
            selectedCount={selection.selectedCount}
            onClearSelection={selection.clearSelection}
            titleActions={removableSelected.length ? (
              <TableRightActionsButton
                type="button"
                onClick={() => setRemoveTargets(removableSelected.map((row) => row.id))}
              >
                <Trash2 className="size-4" />
                Remove ({removableSelected.length})
              </TableRightActionsButton>
            ) : null}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    selection.clearSelection()
                  }}
                  placeholder="Search name, email or event"
                />
                <Select
                  value={eventFilter}
                  onValueChange={(value) => {
                    setEventFilter(value)
                    selection.clearSelection()
                  }}
                >
                  <TableRightActionsSelectTrigger aria-label="Event filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_EVENTS}>All events ({rows.length})</SelectItem>
                    {eventSummaries.map((summary) => (
                      <SelectItem key={summary.id} value={summary.id}>
                        {summary.title} ({summary.confirmed_count}
                        {summary.capacity === null ? "" : `/${summary.capacity}`})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableRightActions>
            }
            footer={!loading ? (
              <div className="bg-muted/50 p-4 text-xs text-muted-foreground sm:text-sm">
                {filtered.length} {filtered.length === 1 ? "registration" : "registrations"}
                {selectedSummary ? ` · ${seatSummary(selectedSummary)}` : ""}
                {truncated ? " · showing the 500 most recent" : ""}
              </div>
            ) : null}
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={selection.isPageSelected(visibleIds)}
                        onCheckedChange={() => selection.togglePage(visibleIds)}
                        aria-label="Select registrations"
                      />
                    </TableHead>
                    <TableHead column="main">
                      <AdminSortButton
                        active={sort.sortColumn === "attendee"}
                        direction={sort.sortDirection}
                        onClick={() => sort.toggleSort("attendee")}
                      >
                        Attendee
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="content">
                      <AdminSortButton
                        active={sort.sortColumn === "event"}
                        direction={sort.sortDirection}
                        onClick={() => sort.toggleSort("event")}
                      >
                        Event
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={sort.sortColumn === "ticket"}
                        direction={sort.sortDirection}
                        onClick={() => sort.toggleSort("ticket")}
                      >
                        Ticket
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={sort.sortColumn === "status"}
                        direction={sort.sortDirection}
                        onClick={() => sort.toggleSort("status")}
                      >
                        Status
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={sort.sortColumn === "registered"}
                        direction={sort.sortDirection}
                        onClick={() => sort.toggleSort("registered")}
                      >
                        Registered
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && rows.length === 0 ? (
                    <AdminListPending />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <p className="mb-4 text-red-600">{error}</p>
                        <Button onClick={loadRows} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          No registrations yet. Turn on sign-ups in an event&apos;s Registration settings to
                          start collecting them.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((row) => (
                      <TableRow key={row.id} className="group">
                        <TableCell column="select">
                          <Checkbox
                            checked={selection.selectedIds.has(row.id)}
                            onCheckedChange={() => selection.toggleOne(row.id)}
                            aria-label={`Select ${row.name}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <h4 className="truncate font-medium">{row.name}</h4>
                          <p className="truncate text-sm text-muted-foreground">{row.email}</p>
                        </TableCell>
                        <TableCell column="content">
                          <a
                            href={`/events/${row.event_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-sm hover:underline"
                          >
                            {row.event_title}
                          </a>
                        </TableCell>
                        <TableCell column="meta">
                          <span className="text-sm">{ticketLabel(row)}</span>
                        </TableCell>
                        <TableCell column="meta">
                          {statusBadge(row.status)}
                          {row.checked_in_at ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Checked in {formatDate(row.checked_in_at)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell column="meta">
                          <div className="text-sm text-muted-foreground">{formatDate(row.created_at)}</div>
                          {row.reminder_sent_at ? (
                            <div className="text-xs text-muted-foreground">
                              Reminded {formatDate(row.reminder_sent_at)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell column="meta">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${row.name}`}
                            title="Remove registration"
                            disabled={row.status === "cancelled"}
                            onClick={() => setRemoveTargets([row.id])}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>
        </div>
      </AdminLayout>

      <ConfirmDestructive
        action="remove-event-registration"
        open={Boolean(removeTargets?.length)}
        title={removeTargets && removeTargets.length > 1
          ? `Remove ${removeTargets.length} registrations?`
          : "Remove this registration?"}
        confirmLabel="Remove"
        error={removeError}
        onCancel={() => {
          setRemoveTargets(null)
          setRemoveError(null)
        }}
        onConfirm={handleRemove}
      />
    </>
  )
}
