import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BookmarkIcon,
  ChevronDownIcon,
  CopyIcon,
  MapIcon,
  PlaneTakeoffIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { CopyTripDialog } from "@/components/travel/copy-trip-dialog"
import { GoogleMap } from "@/components/travel/google-map"
import { NewTripDialog } from "@/components/travel/new-trip-dialog"
import { TripsYearView } from "@/components/travel/trips-year-view"
import { SavedPlacesDialog } from "@/components/travel/saved-places-dialog"
import { useTripBin } from "@/components/travel/use-trip-bin"
import { NoSignalLine } from "@/components/travel/no-signal-line"
import { useTravelOffline } from "@/components/travel/use-travel-offline"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { archiveTrip, loadPins, loadVisited, type TripPin, type VisitedPin } from "@/lib/api/travel/trip-admin"
import { purgeTripById, restoreTripById, type TripListRow, type TripsPage } from "@/lib/api/travel/trips"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { addDays, countdown, formatDayDate, formatTripDates, tripHasEnded } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { TRIPS_MAP_KEY, TRIPS_MAP_PINS_KEY } from "@/lib/travel/panel-keys"
import { TRIP_STATUS_LABEL } from "@/lib/travel/rules"
import { TRIP_BIN_DAYS } from "@/lib/travel/trip-bin"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Column = "name" | "days" | "start" | "status"
export type TripsShow = "upcoming" | "past" | "archived" | "bin" | "year"

const COLUMNS: SortableColumn<Column>[] = [
  { key: "name", label: "Trip", column: "main", className: "min-w-0 md:min-w-72" },
  { key: "start", label: "Dates", column: "preview" },
  { key: "days", label: "Days", column: "preview" },
  { key: "status", label: "Status", column: "preview" },
]
const STATUS_RANK = { planning: 0, booked: 1, done: 2 } as const
const ON_OFF = ["on", "off"] as const

/**
 * Upcoming holds every trip that hasn't ended, trips with no dates included;
 * Past the ones that have. A deleted trip is in the Bin, whatever else it is.
 */
function showOf(row: TripListRow): TripsShow {
  if (row.deletedAt) return "bin"
  if (row.archived) return "archived"
  return tripHasEnded(row) ? "past" : "upcoming"
}

/** "Goes for good 3 Dec": a binned trip's line under its dates, short enough for the column. */
function binLine(deletedAt: string) {
  const gone = formatDayDate(addDays(deletedAt.slice(0, 10), TRIP_BIN_DAYS))
  return `Goes for good ${gone.split(" ").slice(1).join(" ")}`
}

/**
 * The Trips table: every trip of the person signed in (task parts 1 and 36
 * to 41). Upcoming, Past, Archived and Bin tabs, kept in the address, and Year,
 * the dated trips as bars across a year (Travel features 4, part 9); the search
 * first, then the tag filter, Saved places and New trip. Each row has its
 * dates, a countdown and its status, and Copy, Archive and Delete. The map of
 * places visited sits above it and hides with its switch.
 */
export function TripsDashboard({
  page,
  show,
  onShow,
}: {
  page: TripsPage
  show: TripsShow
  onShow: (show: TripsShow) => void
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const { config } = useShellRuntime()
  const [creating, setCreating] = React.useState(false)
  const [savedOpen, setSavedOpen] = React.useState(false)
  const [copying, setCopying] = React.useState<TripListRow | null>(null)
  // Delete for good, from the Bin: the one delete that asks first.
  const [deleting, setDeleting] = React.useState<TripListRow[] | null>(null)
  const closingDeleting = useLastValue(deleting)
  const shownDeleting = deleting ?? closingDeleting
  const [query, setQuery] = React.useState("")
  const [tags, setTags] = React.useState<ReadonlySet<string>>(new Set())
  const { sort, direction, toggleSort } = useTableSort<Column>("start")
  const selection = useSelection()
  const [run, running] = useAsyncAction(getTravelErrorMessage)
  const tripBin = useTripBin()
  const busy = running || tripBin.busy
  const [mapShown, setMapShown] = useRememberedChoice(TRIPS_MAP_KEY, "on", ON_OFF)
  // Kept to open with no signal, then read only (Travel features part 10).
  const readOnly = useTravelOffline()

  const allTags = React.useMemo(
    () => [...new Set(page.trips.flatMap((trip) => trip.tags))].sort((a, b) => a.localeCompare(b)),
    [page.trips]
  )
  const counts = {
    upcoming: page.trips.filter((trip) => showOf(trip) === "upcoming").length,
    past: page.trips.filter((trip) => showOf(trip) === "past").length,
    archived: page.trips.filter((trip) => showOf(trip) === "archived").length,
    bin: page.trips.filter((trip) => showOf(trip) === "bin").length,
  }

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    const needle = query.trim().toLowerCase()
    return page.trips
      // The Year tab holds every trip not in the Bin, archived ones too.
      .filter((trip) => (show === "year" ? showOf(trip) !== "bin" : showOf(trip) === show))
      .filter((trip) => !needle || `${trip.name} ${trip.destination ?? ""}`.toLowerCase().includes(needle))
      .filter((trip) => tags.size === 0 || trip.tags.some((tag) => tags.has(tag)))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name) * sign
        if (sort === "days") return (a.days - b.days) * sign || a.name.localeCompare(b.name)
        if (sort === "status") return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * sign || a.name.localeCompare(b.name)
        // No dates sorts after every dated trip, whichever way.
        if (a.startDate === b.startDate) return a.name.localeCompare(b.name)
        if (!a.startDate) return 1
        if (!b.startDate) return -1
        return a.startDate.localeCompare(b.startDate) * sign
      })
  }, [direction, page.trips, query, show, sort, tags])

  const { visible, footer } = useClientPage(rows, config.dashboardRowsPerPage, `${show}|${query}|${[...tags]}|${sort}|${direction}`)
  const visibleIds = visible.map((row) => row.id)
  useClearSelectionOnListChange(selection.setSelected, `${show}|${query}|${[...tags]}`)
  const selected = page.trips.filter((trip) => selection.selected.has(trip.id))

  /** Delete: into the Bin with Undo (Travel features part 8). */
  async function binTrips(trips: TripListRow[]) {
    if (await tripBin.binTrips(trips)) selection.clear()
  }

  /** Put back from the Bin, to the tab each came from. */
  async function restoreTrips(trips: TripListRow[]) {
    const ok = await run(async () => {
      for (const trip of trips) await restoreTripById(trip.id)
      await router.invalidate()
    })
    if (!ok) return
    selection.clear()
    toast.success(describeBulkResult({ done: trips.length, kept: 0, one: "trip", many: "trips", verb: "put back" }))
  }

  /** Delete for good, from the Bin, after the confirm. */
  async function purgeTrips(trips: TripListRow[]) {
    let done = 0
    let failed = 0
    const ok = await run(async () => {
      for (const trip of trips) {
        try {
          await purgeTripById(trip.id)
          done += 1
        } catch {
          failed += 1
        }
      }
    })
    if (!ok) return
    setDeleting(null)
    selection.clear()
    const line = describeBulkResult({ done, kept: failed, one: "trip", many: "trips", verb: "deleted for good" })
    if (failed) showErrorToast(line)
    else toast.success(line)
    await router.invalidate()
  }

  async function setArchived(trips: TripListRow[], archived: boolean) {
    const ok = await run(async () => {
      for (const trip of trips) await archiveTrip(trip.id, archived)
      await router.invalidate()
    })
    if (!ok) return
    selection.clear()
    toast.success(
      describeBulkResult({
        done: trips.length,
        kept: 0,
        one: "trip",
        many: "trips",
        verb: archived ? "archived" : "brought back",
      })
    )
  }

  const tagLabel = tags.size === 0 ? "All tags" : tags.size === 1 ? [...tags][0] : `${tags.size} tags`

  // The rows of every tab but Year, which draws its own bars (Travel features 4, part 9).
  const tableProps = {
    header: (
      <SortableTableHeader
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        leading={
          <SelectAllTableHead
            noun="trips"
            disabled={visibleIds.length === 0}
            checked={selection.selectAllState(visibleIds)}
            onCheckedChange={() => selection.toggleVisible(visibleIds)}
          />
        }
        trailing={<TableHead column="meta">Actions</TableHead>}
      />
    ),
    isEmpty: rows.length === 0,
    emptyText:
      query || tags.size
        ? "No trips match that search."
        : show === "bin"
          ? "The bin is empty. A deleted trip waits here for 30 days."
          : show === "archived"
          ? "No archived trips."
          : show === "past"
            ? "No past trips yet."
            : "No trips yet. Make one with New trip.",
    emptyColSpan: COLUMNS.length + 2,
    children: (
      visible.map((row) => {
        // A trip in the bin doesn't open until it is put back.
        const open = row.deletedAt ? undefined : () => void navigate({ to: "/trips/$tripId", params: { tripId: row.id } })
        return (
          <TableRow key={row.id} rowAction={open} data-trip-id={row.id}>
            <TableCell column="select">
              {readOnly ? null : (
                <Checkbox
                  checked={selection.selected.has(row.id)}
                  onCheckedChange={() => selection.toggle(row.id)}
                  aria-label={`Select ${row.name}`}
                />
              )}
            </TableCell>
            <TableCell column="main">
              <span className="flex min-w-0 items-center gap-3">
                {row.coverUrl ? (
                  <img src={row.coverUrl} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <PlaneTakeoffIcon className="size-4" aria-hidden />
                  </span>
                )}
                <span className="grid min-w-0">
                  <span className="truncate font-medium">{row.name}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {row.destination ? <span className="truncate">{row.destination}</span> : null}
                    {row.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="shrink-0">
                        {tag}
                      </Badge>
                    ))}
                  </span>
                </span>
              </span>
            </TableCell>
            <TableCell column="preview">
              <span className="grid">
                <span>{formatTripDates(row.startDate, row.days) ?? <span className="text-muted-foreground">No dates</span>}</span>
                {row.deletedAt ? (
                  <span className="text-xs text-muted-foreground">{binLine(row.deletedAt)}</span>
                ) : row.startDate ? (
                  <span className={cn("text-xs text-muted-foreground", countdown(row) === "on now" && "font-medium text-foreground")}>
                    {countdown(row)}
                  </span>
                ) : null}
              </span>
            </TableCell>
            <TableCell column="preview" className="tabular-nums">
              {row.days}
            </TableCell>
            <TableCell column="preview">
              {TRIP_STATUS_LABEL[row.status]}
            </TableCell>
            {readOnly ? (
              <TableCell column="actions" />
            ) : row.deletedAt ? (
              <TableCell column="actions">
                <RowButton label={`Put back ${row.name}`} disabled={busy} onClick={() => void restoreTrips([row])}>
                  <Undo2Icon className="size-4" />
                </RowButton>
                <RowButton label={`Delete ${row.name} for good`} onClick={() => setDeleting([row])}>
                  <Trash2Icon className="size-4" />
                </RowButton>
              </TableCell>
            ) : (
            <TableCell column="actions">
              <RowButton label={`Copy ${row.name}`} onClick={() => setCopying(row)}>
                <CopyIcon className="size-4" />
              </RowButton>
              <RowButton
                label={row.archived ? `Bring back ${row.name}` : `Archive ${row.name}`}
                disabled={busy}
                onClick={() => void setArchived([row], !row.archived)}
              >
                {row.archived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}
              </RowButton>
              <RowButton label={`Delete ${row.name}`} disabled={busy} onClick={() => void binTrips([row])}>
                <Trash2Icon className="size-4" />
              </RowButton>
            </TableCell>
            )}
          </TableRow>
        )
      })
    ),
  }

  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      {readOnly ? <NoSignalLine /> : null}
      {mapShown === "on" && !readOnly ? <PlacesMap onHide={() => setMapShown("off")} /> : null}
      <DashboardTable
        title="Trips"
        tabs={
          <Tabs value={show} onValueChange={(value) => onShow(value as TripsShow)}>
            <TabsList>
              <TabsTrigger value="upcoming">
                Upcoming <TabsCount>{counts.upcoming}</TabsCount>
              </TabsTrigger>
              <TabsTrigger value="past">
                Past <TabsCount>{counts.past}</TabsCount>
              </TabsTrigger>
              <TabsTrigger value="archived">
                Archived <TabsCount>{counts.archived}</TabsCount>
              </TabsTrigger>
              <TabsTrigger value="bin">
                Bin <TabsCount>{counts.bin}</TabsCount>
              </TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
        }
        icon={<PlaneTakeoffIcon className="size-4" />}
        count={rows.length}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {readOnly ? null : selected.length && show === "bin" ? (
              <>
                <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => void restoreTrips(selected)}>
                  <Undo2Icon className="size-4" />
                  Put back ({selected.length})
                </DashboardToolbarButton>
                <DashboardToolbarButton type="button" variant="outline" onClick={() => setDeleting(selected)}>
                  <Trash2Icon className="size-4" />
                  Delete for good ({selected.length})
                </DashboardToolbarButton>
              </>
            ) : selected.length ? (
              <>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void setArchived(selected, show !== "archived")}
                >
                  {show === "archived" ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}
                  {show === "archived" ? "Bring back" : "Archive"} ({selected.length})
                </DashboardToolbarButton>
                <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => void binTrips(selected)}>
                  <Trash2Icon className="size-4" />
                  Delete ({selected.length})
                </DashboardToolbarButton>
              </>
            ) : null}
            <DashboardToolbarSearch
              name="trip-search"
              aria-label="Search trips by name or destination"
              placeholder="Search trips…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {allTags.length || tags.size ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <DashboardToolbarButton type="button" variant="outline" aria-label={`Tags: ${tagLabel}`}>
                    {tagLabel}
                    <ChevronDownIcon className="size-4 text-muted-foreground" />
                  </DashboardToolbarButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuCheckboxItem checked={tags.size === 0} onCheckedChange={() => setTags(new Set())}>
                    All tags
                  </DropdownMenuCheckboxItem>
                  {allTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag}
                      checked={tags.has(tag)}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(on) =>
                        setTags((was) => {
                          const next = new Set(was)
                          if (on) next.add(tag)
                          else next.delete(tag)
                          return next
                        })
                      }
                    >
                      {tag}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {mapShown === "off" && !readOnly ? (
              <DashboardToolbarButton type="button" variant="outline" onClick={() => setMapShown("on")}>
                <MapIcon className="size-4" />
                Show map
              </DashboardToolbarButton>
            ) : null}
            {readOnly ? null : (
              <>
                <DashboardToolbarButton type="button" variant="outline" onClick={() => setSavedOpen(true)}>
                  <BookmarkIcon className="size-4" />
                  Saved places
                </DashboardToolbarButton>
                <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
                  <PlusIcon className="size-4" />
                  New trip
                </DashboardToolbarButton>
              </>
            )}
          </>
        }
        footer={
          show === "year"
            ? { type: "summary", count: rows.filter((trip) => trip.startDate).length, label: "dated trips" }
            : footer
        }
        {...(show === "year"
          ? {
              content: (
                <TripsYearView
                  trips={rows}
                  onOpen={(trip) => void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } })}
                />
              ),
            }
          : tableProps)}
      />
      <NewTripDialog open={creating} onClose={() => setCreating(false)} />
      <CopyTripDialog trip={copying} onClose={() => setCopying(null)} />
      <SavedPlacesDialog open={savedOpen} onClose={() => setSavedOpen(false)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={
          shownDeleting && shownDeleting.length === 1
            ? `Delete ${shownDeleting[0].name} for good?`
            : `Delete ${shownDeleting?.length ?? 0} trips for good?`
        }
        description="It goes at once, with every activity and note on it, and can't be put back."
        confirmLabel="Delete for good"
        destructive
        loading={busy}
        onConfirm={() => {
          if (deleting) void purgeTrips(deleting)
        }}
      />
    </div>
  )
}

/** A row's icon button. Repeated table rows carry an accessible name and no tooltip (UI standard, "Controls"). */
function RowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}

const MAP_PINS = ["destinations", "visited"] as const

/**
 * The map above the table. Destinations (task part 40) pins each trip's
 * destination, and a click opens the trip. Places I've been (Travel features
 * 3, part 12; Tyler, 5 Nov 2026: "Small card on the map") pins every card
 * marked Done on every trip, and a click shows a small card with the place,
 * its trip and its rating, and a way to open the trip. The choice is
 * remembered in this browser.
 */
function PlacesMap({ onHide }: { onHide: () => void }) {
  const navigate = useNavigate()
  const [which, setWhich] = useRememberedChoice(TRIPS_MAP_PINS_KEY, "destinations", MAP_PINS)
  const [pins, setPins] = React.useState<TripPin[] | null>(null)
  const [visited, setVisited] = React.useState<VisitedPin[] | null>(null)
  const [picked, setPicked] = React.useState<string | null>(null)
  React.useEffect(() => {
    let alive = true
    loadPins()
      .then((loaded) => {
        if (alive) setPins(loaded)
      })
      .catch(() => {
        if (alive) setPins([])
      })
    return () => {
      alive = false
    }
  }, [])
  React.useEffect(() => {
    if (which !== "visited") return
    let alive = true
    loadVisited()
      .then((loaded) => {
        if (alive) setVisited(loaded)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setVisited([])
        showErrorToast(getTravelErrorMessage(error))
      })
    return () => {
      alive = false
    }
  }, [which])
  const shownPin = which === "visited" ? visited?.find((pin) => pin.activityId === picked) : undefined
  return (
    <section aria-label="Places visited" className="relative">
      {which === "visited" ? (
        <GoogleMap
          className="h-64"
          pins={(visited ?? []).map((pin) => ({ id: pin.activityId, lat: pin.lat, lng: pin.lng, title: `${pin.title}, ${pin.tripName}` }))}
          emptyText={visited === null ? "Finding the places you've been…" : "Mark a card with a place Done to see it here."}
          onPick={setPicked}
        />
      ) : (
        <GoogleMap
          className="h-64"
          pins={(pins ?? []).map((pin) => ({ id: pin.tripId, lat: pin.lat, lng: pin.lng, title: `${pin.name}, ${pin.destination}` }))}
          emptyText={pins === null ? "Finding your destinations…" : "Give a trip a destination to see it on the map."}
          onPick={(tripId) => void navigate({ to: "/trips/$tripId", params: { tripId } })}
        />
      )}
      <Tabs
        value={which}
        onValueChange={(next) => {
          setPicked(null)
          setWhich(next as (typeof MAP_PINS)[number])
        }}
        className="absolute top-2 left-2"
      >
        <TabsList aria-label="Pins on the map" className="bg-card">
          <TabsTrigger value="destinations">Destinations</TabsTrigger>
          <TabsTrigger value="visited">Places I've been</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button type="button" variant="outline" size="sm" className="absolute top-2 right-2 bg-card" onClick={onHide}>
        Hide map
      </Button>
      {shownPin ? (
        <Card size="sm" className="absolute bottom-2 left-2 w-64 max-w-[calc(100%-1rem)]">
          <CardContent className="grid gap-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{shownPin.title}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Close" onClick={() => setPicked(null)}>
                <XIcon className="size-3.5" />
              </Button>
            </div>
            <span className="truncate text-sm text-muted-foreground">{shownPin.tripName}</span>
            {shownPin.rating ? (
              <span className="flex items-center gap-0.5 text-muted-foreground" aria-label={`Rated ${shownPin.rating} out of 5`}>
                {Array.from({ length: shownPin.rating }, (_, index) => (
                  <StarIcon key={index} className="size-3.5 fill-current" aria-hidden />
                ))}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not rated</span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 justify-self-start"
              onClick={() =>
                void navigate({ to: "/trips/$tripId", params: { tripId: shownPin.tripId }, search: { open: shownPin.activityId } })
              }
            >
              Open trip
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}
