import * as React from "react"
import { BookmarkIcon, MapPinIcon, PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmGroupRow, CrmTable, CrmTableRow, MainCell, useFolds } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { RatingValue } from "@/components/travel/stars"
import { PlaceRecord } from "@/components/travel/place-record"
import { SectionTabs } from "@/components/travel/section-tabs"
import { placeFacts, type PlaceRow } from "@/lib/travel/trips-lists"
import { PlaceSearchField } from "@/components/travel/place-search-field"
import { ActivityTypeIcon, ActivityTypeSelect } from "@/components/travel/type-icon"
import { useTravelOffline } from "@/components/travel/use-travel-offline"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import type { PlaceDetails } from "@/lib/api/travel/services"
import {
  changeSavedPlaceList,
  loadSavedPlaces,
  makeSavedPlace,
  type SavedPlace,
} from "@/lib/api/travel/saved-places"
import { loadTripPlaces, type TripPlace } from "@/lib/api/travel/trips-dashboard"
import type { TripListRow } from "@/lib/api/travel/trips"
import { getActivityTypes, type ActivityType } from "@/lib/api/travel/types"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useLoad } from "@/lib/hooks/use-load"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { binGoesLine, TRIP_BIN_DAYS } from "@/lib/travel/trip-bin"
import {
  PLACE_SORT_LABELS,
  PLACE_TAB_LABELS,
  PLACE_TABS,
  type PlaceGroup,
  type PlaceSort,
  type PlaceTab,
  type TripsSearch,
} from "@/lib/travel/trips-search"
import { showErrorToast } from "@/lib/toast/error-toast"


/** "newest" is no column: newest first shows no column as sorted. */
type PlaceColumn = "name" | "went" | "stars" | "newest"

const NO_TYPE = "none"
const ANY = "any"

/**
 * The Places section (Tyler, 12 Nov 2026): the person's places in one list,
 * where they were a window behind a button and a switch on a map.
 *
 * - **Tabs:** Saved (the saved places), Go again (every card ticked Would go
 *   again), Been (every card marked Done) and Bin (saved places deleted in
 *   the last 30 days).
 * - **Header:** search, Mass select on Saved and the Bin, Filter (one type,
 *   folds by trip or by type, and the order), and New place on Saved.
 * - **Right:** the place picked (`PlaceRecord`).
 */
export function PlacesSection({
  trips,
  search,
  frame,
  onSavedCount,
}: {
  trips: readonly TripListRow[]
  search: TripsSearch
  frame: CrmFrame
  /** How many saved places there are, for the Dashboards block's count. */
  onSavedCount: (count: number) => void
}) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const tab: PlaceTab = search.tab ?? "saved"
  const q = search.q ?? ""
  const typeFilter = search.type ?? ""
  // Saved places come from no trip, so they fold by type only.
  const group: PlaceGroup | null = search.group === "trip" && tab !== "saved" && tab !== "bin" ? "trip" : search.group === "type" ? "type" : null
  const sort: PlaceSort | "newest" = search.sort ?? "newest"
  const folds = useFolds()
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [purging, setPurging] = React.useState<SavedPlace[] | null>(null)
  const closingPurging = useLastValue(purging)
  const shownPurging = purging ?? closingPurging
  const [run, busy] = useAsyncAction(getTravelErrorMessage)

  // Every list is read at once, so each tab shows its count before it is picked, and again after a change.
  const [round, setRound] = React.useState(0)
  const reread = () => setRound((count) => count + 1)
  const saved = useLoad(() => loadSavedPlaces(), getTravelErrorMessage, { keys: [round], remember: "trips-saved-places" })
  const binned = useLoad(() => loadSavedPlaces({ inBin: true }), getTravelErrorMessage, {
    keys: [round],
    remember: "trips-binned-places",
  })
  const cards = useLoad(() => loadTripPlaces(), getTravelErrorMessage, { keys: [round], remember: "trips-trip-places" })
  const types = useLoad(getActivityTypes, getTravelErrorMessage, { remember: "trips-activity-types" })
  const typeList: readonly ActivityType[] = types.data ?? []
  const typeName = (typeId: string | null) => (typeId ? (typeList.find((type) => type.id === typeId)?.name ?? "Other") : "No type")

  const savedCount = saved.data?.length
  React.useEffect(() => {
    if (savedCount !== undefined) onSavedCount(savedCount)
  }, [onSavedCount, savedCount])

  const source = tab === "saved" ? saved : tab === "bin" ? binned : cards
  const all: PlaceRow[] | null = React.useMemo(() => {
    if (tab === "saved") return saved.data?.map((place) => ({ kind: "saved" as const, id: place.id, saved: place })) ?? null
    if (tab === "bin") return binned.data?.map((place) => ({ kind: "saved" as const, id: place.id, saved: place })) ?? null
    const list = cards.data
    if (!list) return null
    return list
      .filter((card) => (tab === "again" ? card.goAgain : card.done))
      .map((card) => ({ kind: "trip" as const, id: card.id, card }))
  }, [binned.data, cards.data, saved.data, tab])

  const tabCount = (value: PlaceTab) =>
    value === "saved"
      ? saved.data?.length
      : value === "bin"
        ? binned.data?.length
        : cards.data?.filter((card) => (value === "again" ? card.goAgain : card.done)).length

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = (all ?? []).filter((row) => {
      const facts = placeFacts(row)
      if (typeFilter && (typeFilter === NO_TYPE ? facts.typeId !== null : facts.typeId !== typeFilter)) return false
      if (!needle) return true
      const words = [facts.title, facts.place?.name, facts.place?.address, row.kind === "trip" ? row.card.tripName : ""]
      return words.join(" ").toLowerCase().includes(needle)
    })
    const stars = (row: PlaceRow) => (row.kind === "trip" ? row.card.rating : null)
    const went = (row: PlaceRow) => (row.kind === "trip" ? row.card.tripStart : null)
    return [...list].sort((a, b) => {
      if (sort === "name") return placeFacts(a).title.localeCompare(placeFacts(b).title)
      if (sort === "stars") return (stars(b) ?? -1) - (stars(a) ?? -1) || placeFacts(a).title.localeCompare(placeFacts(b).title)
      if (sort === "last") return (went(b) ?? "").localeCompare(went(a) ?? "") || placeFacts(a).title.localeCompare(placeFacts(b).title)
      // Newest: as the server listed them.
      return 0
    })
  }, [all, q, sort, typeFilter])

  const groups = React.useMemo(() => {
    if (!group) return [{ key: "all", label: null as string | null, rows }]
    const byKey = new Map<string, { key: string; label: string; rows: PlaceRow[] }>()
    for (const row of rows) {
      const key = group === "trip" && row.kind === "trip" ? row.card.tripId : (placeFacts(row).typeId ?? NO_TYPE)
      const label = group === "trip" && row.kind === "trip" ? row.card.tripName : typeName(placeFacts(row).typeId)
      const held = byKey.get(key) ?? { key, label, rows: [] }
      held.rows.push(row)
      byKey.set(key, held)
    }
    return [...byKey.values()]
    // `typeName` reads `typeList`, which is in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, rows, typeList])

  const ids = groups.flatMap((each) => (each.label && folds.folded(each.key) ? [] : each.rows)).map((row) => row.id)
  const openRow = (all ?? []).find((row) => row.id === search.open) ?? null

  // The right panel is never left empty: once the tab's list is read, a tab,
  // filter or search that leaves the open place out opens the first row.
  const firstId = rows[0]?.id
  const openInList = Boolean(search.open && rows.some((row) => row.id === search.open))
  // A place just made opens before the list has read it again, so it waits for it.
  const [awaiting, setAwaiting] = React.useState<string>()
  if (awaiting && (all ?? []).some((row) => row.id === awaiting)) setAwaiting(undefined)
  const listRead = all !== null && !awaiting
  React.useEffect(() => {
    if (listRead && firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, listRead, openInList, setListSearch])
  // Only a row pressed brings the right panel to the front on a phone.
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (id: string) => {
    setPressedId(id)
    setOpen(id)
  }

  // With no signal every change is off (Travel features part 10).
  const readOnly = useTravelOffline()
  const canMassSelect = !readOnly && (tab === "saved" || tab === "bin")
  useClearSelectionOnListChange(selection.setSelected, `${tab}|${q}|${typeFilter}`)
  const selectedSaved = (all ?? [])
    .filter((row): row is Extract<PlaceRow, { kind: "saved" }> => row.kind === "saved" && selection.selected.has(row.id))
    .map((row) => row.saved)
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  /** Into the bin, back out, or gone for good, in one request; the ones refused are said. */
  async function change(places: SavedPlace[], how: "bin" | "restore" | "purge") {
    const ok = await run(async () => {
      const { done, skipped } = await changeSavedPlaceList(
        places.map((place) => place.id),
        how
      )
      if (skipped.length) {
        showErrorToast(
          describeBulkResult({
            done: done.length,
            kept: skipped.length,
            one: "place",
            many: "places",
            verb: how === "bin" ? "moved to the bin" : how === "restore" ? "put back" : "deleted for good",
          })
        )
      }
    })
    if (!ok) return
    selection.clear()
    setPurging(null)
    reread()
  }

  const actionsFor = (row: PlaceRow): RowMenuItem[] => {
    if (row.kind !== "saved") return []
    if (row.saved.deletedAt) {
      return [
        { label: "Put back", icon: <Undo2Icon className="size-4" />, onSelect: () => void change([row.saved], "restore") },
        { label: "Delete for good", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setPurging([row.saved]) },
      ]
    }
    return [{ label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => void change([row.saved], "bin") }]
  }

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={
          <>
            <PanelReopenButton side="left" label="Show the page" />
            <SectionTabs
              label="Which places"
              value={tab}
              onValueChange={(next) => {
                setMassSelect(false)
                setListSearch({ tab: next === "saved" ? undefined : next })
              }}
              tabs={PLACE_TABS.map((value) => ({
                value,
                label: PLACE_TAB_LABELS[value],
                count: tabCount(value),
              }))}
            />
          </>
        }
        end={<PanelReopenButton side="right" label="Show the place" />}
        selected={
          massSelect && selectedSaved.length ? (
            <SelectedMenu
              count={selectedSaved.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) =>
                tab === "bin" ? (
                  <>
                    <SelectedMenuRow
                      onClick={() => {
                        menu.close()
                        void change(selectedSaved, "restore")
                      }}
                    >
                      <Undo2Icon className="size-4 text-muted-foreground" />
                      Put back
                    </SelectedMenuRow>
                    <SelectedMenuRow
                      className="text-destructive"
                      onClick={() => {
                        menu.close()
                        setPurging(selectedSaved)
                      }}
                    >
                      <Trash2Icon className="size-4" />
                      Delete for good
                    </SelectedMenuRow>
                  </>
                ) : (
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      void change(selectedSaved, "bin")
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </SelectedMenuRow>
                )
              }
            />
          ) : null
        }
        menuLabel="More for places"
        search={{
          name: "place-search",
          label: "Search places by name, address or trip",
          placeholder: "Search places",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={canMassSelect ? { on: massSelect, onToggle: () => toggleMassSelect() } : null}
        filter={
          <FilterPopover
            count={(typeFilter ? 1 : 0) + (search.group ? 1 : 0) + (search.sort ? 1 : 0)}
            onClear={() => setListSearch({ type: undefined, group: undefined, sort: undefined })}
            save={null}
            contentClassName="w-64"
          >
            <FilterRow id="places-type" label="Type">
              <Select value={typeFilter || ANY} onValueChange={(value) => setListSearch({ type: value === ANY ? undefined : value })}>
                <SelectTrigger id="places-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Every type</SelectItem>
                  {typeList.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <span className="flex items-center gap-2">
                        <ActivityTypeIcon type={type} />
                        {type.name}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value={NO_TYPE}>No type</SelectItem>
                </SelectContent>
              </Select>
            </FilterRow>
            <FilterRow id="places-group" label="Group">
              <Select
                value={search.group ?? "none"}
                onValueChange={(value) => setListSearch({ group: value === "none" ? undefined : value })}
              >
                <SelectTrigger id="places-group" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No groups</SelectItem>
                  <SelectItem value="trip">By trip</SelectItem>
                  <SelectItem value="type">By type</SelectItem>
                </SelectContent>
              </Select>
            </FilterRow>
            <FilterRow id="places-sort" label="Order">
              <Select value={sort} onValueChange={(value) => setListSearch({ sort: value === "newest" ? undefined : value })}>
                <SelectTrigger id="places-sort" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["newest", "name", "stars", "last"] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {PLACE_SORT_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
        primary={
          tab === "saved" && !readOnly ? (
            <NewPlace
              types={typeList}
              onMade={(id) => {
                setAwaiting(id)
                reread()
                pick(id)
              }}
            />
          ) : null
        }
      />
      <CrmTable<PlaceColumn>
        columns={[
          { key: "name", label: "Place", column: "main", className: "min-w-40" },
          tab === "again" || tab === "been"
            ? { key: "went", label: "Trip", column: "preview" }
            : { key: "where", label: tab === "bin" ? "Deleted" : "Address", column: "preview", sortable: false },
          { key: "type", label: "Type", column: "preview", className: "hidden md:hidden @xl:table-cell", sortable: false },
          ...(tab === "again" || tab === "been"
            ? [{ key: "stars" as const, label: "Stars", column: "meta" as const, className: "hidden md:hidden @2xl:table-cell" }]
            : []),
        ]}
        sort={sort === "stars" ? "stars" : sort === "last" ? "went" : sort === "name" ? "name" : "newest"}
        direction={sort === "name" ? "asc" : "desc"}
        onSort={(column) => {
          const next: PlaceSort | undefined = column === "stars" ? "stars" : column === "went" ? "last" : "name"
          // Pressing the column already sorting goes back to newest first.
          setListSearch({ sort: next === sort ? undefined : next })
        }}
        actions={false}
        select={
          massSelect && canMassSelect
            ? { noun: "places", disabled: ids.length === 0, checked: selection.selectAllState(ids), onToggle: () => selection.toggleVisible(ids) }
            : null
        }
        empty={
          all === null ? (
            source.error ? (
              <ErrorRow message={source.error} onRetry={source.retry} className="py-0" />
            ) : (
              <LoadingRow label="Loading the places…" className="py-0" />
            )
          ) : rows.length > 0 ? null : q || typeFilter ? (
            <EmptyLine>{"No places match that search."}</EmptyLine>
          ) : tab === "saved" ? (
            <EmptyLine>{"No saved places yet. Save one from an activity's How was it, or make one with New place."}</EmptyLine>
          ) : tab === "again" ? (
            <EmptyLine>{"Nothing here yet. Tick Would go again on an activity you've done."}</EmptyLine>
          ) : tab === "been" ? (
            <EmptyLine>{"Nothing here yet. Mark an activity Done on a trip to see it here."}</EmptyLine>
          ) : (
            <EmptyLine>{`The bin is empty. A deleted place waits here for ${TRIP_BIN_DAYS} days.`}</EmptyLine>
          )
        }
      >
        {groups.map((each) => (
          <React.Fragment key={each.key}>
            {each.label ? (
              <CrmGroupRow
                label={each.label}
                count={each.rows.length}
                folded={folds.folded(each.key)}
                onToggle={() => folds.toggle(each.key)}
              />
            ) : null}
            {each.label && folds.folded(each.key)
              ? null
              : each.rows.map((row) => {
                  const facts = placeFacts(row)
                  const type = facts.typeId ? (typeList.find((one) => one.id === facts.typeId) ?? null) : null
                  return (
                    <CrmTableRow
                      key={row.id}
                      open={row.id === search.open}
                      label={facts.title}
                      tick={canMassSelect ? { shown: massSelect, ticked: selection.selected.has(row.id), onToggle: () => selection.toggle(row.id) } : null}
                      onOpen={() => pick(row.id)}
                      onRightClick={canMassSelect ? (x, y) => setRightClick({ id: row.id, x, y }) : undefined}
                    >
                      <MainCell name={facts.title} lead={<ActivityTypeIcon type={type} />} />
                      <TableCell column="preview">
                        <span className="block max-w-64 truncate text-muted-foreground">
                          {row.kind === "trip"
                            ? `${row.card.tripName} · ${row.card.day === null ? "Ideas" : `Day ${row.card.day}`}`
                            : row.saved.deletedAt
                              ? binGoesLine(row.saved.deletedAt)
                              : (facts.place?.address ?? "No address")}
                        </span>
                      </TableCell>
                      <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
                        <Chip muted>{typeName(facts.typeId)}</Chip>
                      </TableCell>
                      {row.kind === "trip" ? (
                        <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
                          <RatingValue rating={row.card.rating} />
                        </TableCell>
                      ) : null}
                    </CrmTableRow>
                  )
                })}
          </React.Fragment>
        ))}
      </CrmTable>
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={(() => {
            const row = (all ?? []).find((each) => each.id === rightClick.id)
            return row ? actionsFor(row) : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    // Until the tab's list is read, its rows are not known, so nothing opens by itself.
    showMiddleFor: `${tab}|${q}|${typeFilter}`,
    showRightFor: pressedId && pressedId === search.open ? pressedId : undefined,
    middle,
    right: {
      label: "Place",
      showLabel: "Show the place",
      content: openRow ? (
        <PlaceRecord
          key={openRow.id}
          row={openRow}
          types={typeList}
          trips={trips}
          busy={busy}
          actions={actionsFor(openRow)}
          onSavedChange={(next: SavedPlace) =>
            saved.setData((current) => current?.map((place) => (place.id === next.id ? next : place)) ?? current)
          }
          onCardChange={(next: TripPlace) =>
            cards.setData((current) => current?.map((card) => (card.id === next.id ? next : card)) ?? current)
          }
        />
      ) : (
        <EmptyRecord
          title="Place"
          icon={tab === "saved" ? <BookmarkIcon aria-hidden /> : <MapPinIcon aria-hidden />}
          loading={all === null && !source.error}
          line={all && all.length === 0 ? "Places show here once there are some." : "Click a place to see it here."}
          hideLabel="Hide the place"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={purging !== null}
        onOpenChange={(open) => {
          if (!open) setPurging(null)
        }}
        title={
          shownPurging && shownPurging.length === 1
            ? `Delete ${shownPurging[0].title} for good?`
            : `Delete ${shownPurging?.length ?? 0} places for good?`
        }
        description={
          shownPurging && shownPurging.length > 1
            ? "They go at once and can't be put back. Copies already on a trip stay."
            : "It goes at once and can't be put back. Copies already on a trip stay."
        }
        confirmLabel="Delete for good"
        destructive
        loading={busy}
        onConfirm={() => {
          if (purging) void change(purging, "purge")
        }}
      />
    ),
  })
}

/**
 * New place: the usual New dropdown hanging from the button, with the place
 * found on Google (or typed), then its type. Create saved place makes it and
 * opens it on the right, where its picture and notes are added.
 */
function NewPlace({ types, onMade }: { types: readonly ActivityType[]; onMade: (id: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [details, setDetails] = React.useState<PlaceDetails | null>(null)
  const [typed, setTyped] = React.useState("")
  const [typeId, setTypeId] = React.useState<string | null>(null)
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const [round, setRound] = React.useState(0)

  async function create() {
    const title = (details?.place.name || typed).trim()
    if (!title) {
      setInvalid(true)
      showErrorToast("Give the place a name.")
      return
    }
    let id = ""
    const ok = await run(async () => {
      id = (
        await makeSavedPlace({
          title,
          typeId,
          place: details?.place ?? null,
          website: details?.website ?? null,
          phone: details?.phone ?? null,
        })
      ).id
    })
    if (!ok) return
    setOpen(false)
    setDetails(null)
    setTyped("")
    setTypeId(null)
    setRound((count) => count + 1)
    onMade(id)
  }

  return (
    <NewRecordDropdown
      label="New place"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create saved place"
      busy={busy}
      onSubmit={() => void create()}
      trigger={
        <DashboardToolbarButton type="button">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:sr-only">New place</span>
        </DashboardToolbarButton>
      }
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-place-name">Place</FieldLabel>
        <PlaceSearchField
          key={round}
          id="new-place-name"
          invalid={invalid}
          placeholder="Search for a place, or type its name"
          onPick={(picked) => {
            setInvalid(false)
            setTyped(picked.place.name)
            // A name typed with no Google place comes back with no position, and is kept as a name only.
            setDetails(picked.place.placeId || picked.place.lat !== null ? picked : null)
          }}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-place-type">Type</FieldLabel>
        <ActivityTypeSelect id="new-place-type" types={types} value={typeId} onChange={setTypeId} />
      </div>
    </NewRecordDropdown>
  )
}

/** The table's empty line wraps onto more lines on a phone instead of running off the edge. */
function EmptyLine({ children }: { children: React.ReactNode }) {
  return <span className="block whitespace-normal">{children}</span>
}
