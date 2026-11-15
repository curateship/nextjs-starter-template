import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowUpRightIcon,
  CopyIcon,
  PlaneTakeoffIcon,
  PlusIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmGroupRow, CrmTable, CrmTableRow, MainCell, useFolds } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { RatingValue } from "@/components/travel/stars"
import { CoverImage } from "@/components/travel/cover-image"
import { CopyTripDialog } from "@/components/travel/copy-trip-dialog"
import { NewTripDialog } from "@/components/travel/new-trip-dialog"
import { SectionTabs } from "@/components/travel/section-tabs"
import { TripRecord } from "@/components/travel/trip-record"
import { useTripBin } from "@/components/travel/use-trip-bin"
import { useTravelOffline } from "@/components/travel/use-travel-offline"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { archiveTrip } from "@/lib/api/travel/trip-admin"
import { purgeTripById, restoreTripById, type TripListRow } from "@/lib/api/travel/trips"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { countdown, formatTripDates } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { TRIP_STATUS_LABEL } from "@/lib/travel/rules"
import { binGoesLine, TRIP_BIN_DAYS } from "@/lib/travel/trip-bin"
import { MONTH_GROUPS, monthGroupOf, tabOf } from "@/lib/travel/trips-lists"
import { TRIP_TABS, type TripTab, type TripsSearch } from "@/lib/travel/trips-search"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Column = "name" | "start" | "days" | "status" | "rating"
const STATUS_RANK = { planning: 0, booked: 1, done: 2 } as const

const TAB_LABELS: Record<TripTab, string> = { upcoming: "Upcoming", past: "Past", archived: "Archived", bin: "Bin" }


/**
 * The Trips section (Tyler, 12 Nov 2026): every trip of the person signed
 * in, in the dashboard's one header and table shape.
 *
 * - **Header:** Upcoming, Past, Archived and Bin as tabs with their counts;
 *   then search, Mass select and Filter (one tag) as buttons of their own,
 *   never in a ⋮ (Tyler: "Search and mass select as well as bin is no longer
 *   goes into the dropdown"), and New trip, which opens the New trip window.
 * - **Table:** each trip's cover, name, destination and tags, its dates with
 *   the countdown, days, status and the average of its stars. Upcoming folds
 *   into This month, Next month, Later and No dates.
 * - **Right:** the picked trip (`TripRecord`), with Copy, Archive and Delete
 *   at its foot, so the table has no actions column.
 */
export function TripsTableSection({
  trips,
  search,
  frame,
}: {
  trips: TripListRow[]
  search: TripsSearch
  frame: CrmFrame
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const tab: TripTab = search.show ?? "upcoming"
  const q = search.q ?? ""
  const tag = search.tag ?? ""
  // The sort lives in the address, so a reload or coming back keeps it.
  const sort: Column = search.order ?? "start"
  const naturalDirection = (column: Column) => (column === "rating" || column === "days" ? "desc" : "asc")
  const direction = search.direction ?? naturalDirection(sort)
  const toggleSort = (column: Column) => {
    const next = column === sort ? (direction === "asc" ? "desc" : "asc") : naturalDirection(column)
    setListSearch({
      order: column === "start" ? undefined : column,
      direction: next === naturalDirection(column) ? undefined : next,
    })
  }
  const folds = useFolds()
  const [creating, setCreating] = React.useState(false)
  const [copying, setCopying] = React.useState<TripListRow | null>(null)
  // Delete for good, from the Bin: the one delete that asks first.
  const [purging, setPurging] = React.useState<TripListRow[] | null>(null)
  const closingPurging = useLastValue(purging)
  const shownPurging = purging ?? closingPurging
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [run, running] = useAsyncAction(getTravelErrorMessage)
  const tripBin = useTripBin()
  const busy = running || tripBin.busy
  // Kept to open with no signal, then read only (Travel features part 10).
  const readOnly = useTravelOffline()

  const allTags = React.useMemo(() => [...new Set(trips.flatMap((trip) => trip.tags))].sort((a, b) => a.localeCompare(b)), [trips])
  const counts = React.useMemo(() => {
    const result: Record<TripTab, number> = { upcoming: 0, past: 0, archived: 0, bin: 0 }
    for (const trip of trips) result[tabOf(trip)] += 1
    return result
  }, [trips])

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    const needle = q.trim().toLowerCase()
    return trips
      .filter((trip) => tabOf(trip) === tab)
      .filter((trip) => !needle || `${trip.name} ${trip.destination ?? ""}`.toLowerCase().includes(needle))
      .filter((trip) => !tag || trip.tags.includes(tag))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name) * sign
        if (sort === "days") return (a.days - b.days) * sign || a.name.localeCompare(b.name)
        if (sort === "status") return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * sign || a.name.localeCompare(b.name)
        if (sort === "rating") {
          // Unrated trips sort last, whichever way.
          if (a.rating === b.rating) return a.name.localeCompare(b.name)
          if (a.rating === null) return 1
          if (b.rating === null) return -1
          return (a.rating - b.rating) * sign
        }
        // No dates sorts after every dated trip, whichever way.
        if (a.startDate === b.startDate) return a.name.localeCompare(b.name)
        if (!a.startDate) return 1
        if (!b.startDate) return -1
        return a.startDate.localeCompare(b.startDate) * sign
      })
  }, [direction, q, sort, tab, tag, trips])

  // Upcoming folds by month; every other tab is one list.
  const groups = tab === "upcoming"
    ? MONTH_GROUPS.map((label) => ({ label, rows: rows.filter((trip) => monthGroupOf(trip) === label) })).filter(
        (group) => group.rows.length > 0
      )
    : [{ label: null, rows }]
  const ids = groups.flatMap((group) => (group.label && folds.folded(group.label) ? [] : group.rows)).map((trip) => trip.id)
  const openId = search.open
  const openTrip = trips.find((trip) => trip.id === openId) ?? null

  // The right panel is never left empty: a tab, tag or search that leaves the
  // open trip out of the list opens the list's first row instead.
  const firstId = rows[0]?.id
  const openInList = Boolean(openId && rows.some((trip) => trip.id === openId))
  React.useEffect(() => {
    if (firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, openInList, setListSearch])
  // Only a row pressed brings the right panel to the front on a phone; one
  // opened by itself waits behind its pill.
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (id: string) => {
    setPressedId(id)
    setOpen(id)
  }

  useClearSelectionOnListChange(selection.setSelected, `${tab}|${q}|${tag}`)
  const selected = trips.filter((trip) => selection.selected.has(trip.id))
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  const openTripPage = (trip: TripListRow) => void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } })

  async function binTrips(list: TripListRow[]) {
    if (await tripBin.binTrips(list)) selection.clear()
  }

  /**
   * Runs one change on each picked trip, carrying on past a trip that fails, then
   * says how many didn't go through (UI standard, tables: describeBulkResult).
   * True when every trip went (Travel polish part 8).
   */
  async function eachTrip(list: TripListRow[], change: (trip: TripListRow) => Promise<unknown>, verb: string) {
    let done = 0
    let failed = 0
    const ok = await run(async () => {
      for (const trip of list) {
        try {
          await change(trip)
          done += 1
        } catch (error) {
          // One trip on its own says why it failed, not "0 of 1".
          if (list.length === 1) throw error
          failed += 1
        }
      }
    })
    if (!ok) return false
    if (failed) showErrorToast(describeBulkResult({ done, kept: failed, one: "trip", many: "trips", verb }))
    selection.clear()
    await router.invalidate()
    return failed === 0
  }

  /** Put back from the Bin, to the tab each came from. */
  const restoreTrips = (list: TripListRow[]) => eachTrip(list, (trip) => restoreTripById(trip.id), "put back")

  /** Delete for good, from the Bin, after the confirm. */
  async function purgeTrips(list: TripListRow[]) {
    // The window stays open, its button working, until every trip has gone.
    await eachTrip(list, (trip) => purgeTripById(trip.id), "deleted for good")
    setPurging(null)
  }

  const setArchived = (list: TripListRow[], archived: boolean) =>
    eachTrip(list, (trip) => archiveTrip(trip.id, archived), archived ? "archived" : "put back")

  /** What a trip can do, for its right-click menu and the right panel's foot. */
  const actionsFor = (trip: TripListRow): RowMenuItem[] =>
    trip.deletedAt
      ? [
          { label: "Put back", icon: <Undo2Icon className="size-4" />, onSelect: () => void restoreTrips([trip]) },
          { label: "Delete for good", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setPurging([trip]) },
        ]
      : [
          { label: "Open trip", icon: <ArrowUpRightIcon className="size-4" />, onSelect: () => openTripPage(trip) },
          { label: "Copy", icon: <CopyIcon className="size-4" />, onSelect: () => setCopying(trip) },
          trip.archived
            ? { label: "Bring back", icon: <ArchiveRestoreIcon className="size-4" />, onSelect: () => void setArchived([trip], false) }
            : { label: "Archive", icon: <ArchiveIcon className="size-4" />, onSelect: () => void setArchived([trip], true) },
          { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => void binTrips([trip]) },
        ]

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={
          <>
            <PanelReopenButton side="left" label="Show the page" />
            <SectionTabs
              label="Which trips"
              value={tab}
              onValueChange={(next) => setListSearch({ show: next === "upcoming" ? undefined : next })}
              tabs={TRIP_TABS.map((value) => ({
                value,
                label: TAB_LABELS[value],
                count: counts[value],
              }))}
            />
          </>
        }
        end={<PanelReopenButton side="right" label="Show the trip" />}
        selected={
          massSelect && selected.length ? (
            <SelectedMenu
              count={selected.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) =>
                tab === "bin" ? (
                  <>
                    <SelectedMenuRow onClick={() => {
                      menu.close()
                      void restoreTrips(selected)
                    }}>
                      <Undo2Icon className="size-4 text-muted-foreground" />
                      Put back
                    </SelectedMenuRow>
                    <SelectedMenuRow onClick={() => {
                      menu.close()
                      setPurging(selected)
                    }} className="text-destructive">
                      <Trash2Icon className="size-4" />
                      Delete for good
                    </SelectedMenuRow>
                  </>
                ) : (
                  <>
                    <SelectedMenuRow onClick={() => {
                      menu.close()
                      void setArchived(selected, tab !== "archived")
                    }}>
                      {tab === "archived" ? (
                        <ArchiveRestoreIcon className="size-4 text-muted-foreground" />
                      ) : (
                        <ArchiveIcon className="size-4 text-muted-foreground" />
                      )}
                      {tab === "archived" ? "Bring back" : "Archive"}
                    </SelectedMenuRow>
                    <SelectedMenuRow onClick={() => {
                      menu.close()
                      void binTrips(selected)
                    }} className="text-destructive">
                      <Trash2Icon className="size-4" />
                      Delete
                    </SelectedMenuRow>
                  </>
                )
              }
            />
          ) : null
        }
        menuLabel="More for trips"
        search={{
          name: "trip-search",
          label: "Search trips by name or destination",
          placeholder: "Search trips",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={readOnly ? null : { on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover count={tag ? 1 : 0} onClear={() => setListSearch({ tag: undefined })} save={null} contentClassName="w-60">
            <FilterRow id="trips-tag" label="Tag">
              <Select value={tag || "all"} onValueChange={(value) => setListSearch({ tag: value === "all" ? undefined : value })}>
                <SelectTrigger id="trips-tag" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every tag</SelectItem>
                  {allTags.map((each) => (
                    <SelectItem key={each} value={each}>
                      {each}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
        primary={
          readOnly ? null : (
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              <span className="@max-3xl:sr-only">New trip</span>
            </DashboardToolbarButton>
          )
        }
      />
      <CrmTable<Column>
        columns={[
          { key: "name", label: "Trip", column: "main", className: "min-w-40" },
          // Wide enough for "19 to 23 Jan 2027", so the main column can't squeeze it (Travel polish part 5).
          { key: "start", label: "Dates", column: "preview", className: "min-w-44" },
          { key: "days", label: "Days", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
          { key: "status", label: "Status", column: "preview", className: "hidden md:hidden @xl:table-cell" },
          { key: "rating", label: "Rating", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        actions={false}
        select={
          massSelect
            ? {
                noun: "trips",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          rows.length > 0
            ? null
            : q || tag
              ? "No trips match that search."
              : tab === "bin"
                ? `The bin is empty. A deleted trip waits here for ${TRIP_BIN_DAYS} days.`
                : tab === "archived"
                  ? "No archived trips."
                  : tab === "past"
                    ? "No past trips yet."
                    : "No trips yet. Make one with New trip."
        }
      >
        {groups.map((group) => (
          <React.Fragment key={group.label ?? "all"}>
            {group.label ? (
              <CrmGroupRow
                label={group.label}
                count={group.rows.length}
                folded={folds.folded(group.label)}
                onToggle={() => folds.toggle(group.label!)}
              />
            ) : null}
            {group.label && folds.folded(group.label)
              ? null
              : group.rows.map((trip) => (
                  <CrmTableRow
                    key={trip.id}
                    open={trip.id === openId}
                    label={trip.name}
                    tick={{ shown: massSelect, ticked: selection.selected.has(trip.id), onToggle: () => selection.toggle(trip.id) }}
                    onOpen={() => pick(trip.id)}
                    onRightClick={readOnly ? undefined : (x, y) => setRightClick({ id: trip.id, x, y })}
                  >
                    <MainCell
                      name={trip.name}
                      lead={
                        <CoverImage
                          url={trip.coverUrl}
                          className="size-7 shrink-0 rounded-md object-cover"
                          fallback={
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <PlaneTakeoffIcon className="size-3.5" aria-hidden />
                            </span>
                          }
                        />
                      }
                    >
                      {trip.destination ? (
                        <span className="hidden min-w-0 truncate text-xs text-muted-foreground @lg:inline">{trip.destination}</span>
                      ) : null}
                      {trip.tags.map((each) => (
                        <Chip key={each} muted className="hidden shrink-0 @2xl:inline-flex">
                          {each}
                        </Chip>
                      ))}
                    </MainCell>
                    <TableCell column="preview" className="min-w-44">
                      <span className="grid">
                        <span className="truncate">{formatTripDates(trip.startDate, trip.days) ?? <span className="text-muted-foreground">No dates</span>}</span>
                        {trip.deletedAt ? (
                          <span className="text-xs text-muted-foreground">{binGoesLine(trip.deletedAt)}</span>
                        ) : trip.startDate ? (
                          <span className={cn("text-xs text-muted-foreground", countdown(trip) === "on now" && "font-medium text-foreground")}>
                            {countdown(trip)}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @2xl:table-cell">
                      {trip.days}
                    </TableCell>
                    <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
                      <Chip muted>{TRIP_STATUS_LABEL[trip.status]}</Chip>
                    </TableCell>
                    <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
                      <RatingValue rating={trip.rating} />
                    </TableCell>
                  </CrmTableRow>
                ))}
          </React.Fragment>
        ))}
      </CrmTable>
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={(() => {
            const trip = trips.find((each) => each.id === rightClick.id)
            return trip ? actionsFor(trip) : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `${tab}|${q}|${tag}`,
    showRightFor: pressedId && pressedId === search.open ? pressedId : undefined,
    middle,
    right: {
      label: "Trip",
      showLabel: "Show the trip",
      content: openTrip ? (
        <TripRecord key={openTrip.id} trip={openTrip} busy={busy} actions={actionsFor(openTrip)} />
      ) : (
        <EmptyRecord
          title="Trip"
          icon={<PlaneTakeoffIcon aria-hidden />}
          line={trips.length ? "Click a trip to see it here." : "Make a trip with New trip to see it here."}
          hideLabel="Hide the trip"
        />
      ),
    },
    windows: (
      <>
        <NewTripDialog open={creating} onClose={() => setCreating(false)} />
        <CopyTripDialog trip={copying} onClose={() => setCopying(null)} />
        <ConfirmDialog
          open={purging !== null}
          onOpenChange={(open) => {
            if (!open) setPurging(null)
          }}
          title={
            shownPurging && shownPurging.length === 1
              ? `Delete ${shownPurging[0].name} for good?`
              : `Delete ${shownPurging?.length ?? 0} trips for good?`
          }
          description={
            shownPurging && shownPurging.length > 1
              ? "They go at once, with every activity and note on them, and can't be put back."
              : "It goes at once, with every activity and note on it, and can't be put back."
          }
          confirmLabel="Delete for good"
          destructive
          loading={busy}
          onConfirm={() => {
            if (purging) void purgeTrips(purging)
          }}
        />
      </>
    ),
  })
}
