import * as React from "react"
import {
  BookmarkIcon,
  BookmarkPlusIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  ChevronsDownUpIcon,
  EllipsisVerticalIcon,
  FoldHorizontalIcon,
  LightbulbIcon,
  LightbulbOffIcon,
  ListChecksIcon,
  SearchIcon,
  UnfoldHorizontalIcon,
  MailOpenIcon,
  MapPinPlusIcon,
  PlusIcon,
  SparklesIcon,
  WandSparklesIcon,
  Trash2Icon,
} from "lucide-react"

import { BinDialog } from "@/components/travel/bin-dialog"
import { useBoardActions } from "@/components/travel/board-actions"
import { CalendarLinkDialog } from "@/components/travel/calendar-link-dialog"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { PasteBookingDialog } from "@/components/travel/paste-booking-dialog"
import { PasteLinksDialog } from "@/components/travel/paste-links-dialog"
import { RouteTime } from "@/components/travel/route-time"
import { SavedPlacesDialog } from "@/components/travel/saved-places-dialog"
import { TripMapView } from "@/components/travel/trip-map-view"
import { TripPhotosView } from "@/components/travel/trip-photos-view"
import { SuggestIdeasDialog } from "@/components/travel/suggest-ideas-dialog"
import { DayBoard } from "@/components/travel/day-board"
import { useBoardLayout } from "@/components/travel/use-board-layout"
import { dayLabel, useNewActivity } from "@/components/travel/new-activity"
import { TripCalendarView } from "@/components/travel/trip-calendar-view"
import { useTrip } from "@/components/travel/trip-context"
import { wantsDraftOnArrival } from "@/components/travel/draft-on-arrival"
import { NoSignalLine } from "@/components/travel/no-signal-line"
import { MenuSearch } from "@/components/travel/menu-search"
import { DraftPlanDialog } from "@/components/travel/draft-plan-dialog"
import { TripListView } from "@/components/travel/trip-list-view"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { SavedViewsControls, SaveViewDialog, type SavedViewsScreen } from "@/components/shared/saved-views"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { COMPACT_CARDS_KEY, TRIP_VIEW_KEY } from "@/lib/travel/panel-keys"
import {
  filterActivities,
  filterCount,
  readTripFilters,
  TRIP_FILTER_KEYS,
  TRIP_VIEWS,
  type TripSearch,
  type TripView,
} from "@/lib/travel/trip-search"
import { DAY_PART_LABEL, DAY_PARTS } from "@/lib/travel/rules"
import {
  describeTripView,
  keptTripFilters,
  tripViewScreen,
} from "@/lib/travel/trip-views"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

const ANY = "any"
const ON_OFF = ["on", "off"] as const

/**
 * The trip's middle panel: the schedule as Board, List, Calendar, Map or Photos, Board
 * first (Tyler, 2 Nov 2026: "board view as default"). The header holds, in
 * the UI standard's order: the "N selected" button while cards are ticked,
 * Mass select, the search, Show or hide Ideas, Filter (by type, task part
 * 17), Views, then "+ Add" (New activity, Paste a booking, Add to calendar).
 * The ⋮ after the tabs holds the bin. Compact cards and Fold every day float
 * at the board's bottom right.
 */
export function SchedulePanel({
  search,
  onSearch,
}: {
  search: TripSearch
  onSearch: (patch: Partial<TripSearch>, options?: { history?: boolean }) => void
}) {
  const { page, refresh, openActivity, readOnly, weather } = useTrip()
  const { trip } = page
  const newActivity = useNewActivity()
  const layout = useBoardLayout(trip.id, trip.days)
  // A trip just made with "Fill it with a first plan" opens on its drafted plan (Travel features part 7).
  const [windowOpen, setWindowOpen] = React.useState<"bin" | "saved" | "paste" | "links" | "draft" | "gaps" | "ideas" | "calendar" | null>(
    () => (wantsDraftOnArrival(trip.id) ? "draft" : null)
  )
  const actions = useBoardActions()
  // The day Fill this day is filling, from its day's menu (More Travel features part 6).
  // The day stays set while the window closes, so its title doesn't change on the way out.
  const [filling, setFilling] = React.useState<{ day: number; open: boolean }>({ day: 1, open: false })
  // The tab is in the address; with none there, the one this browser used last.
  const [rememberedView, rememberView] = useRememberedChoice<TripView>(TRIP_VIEW_KEY, "board", TRIP_VIEWS)
  const view: TripView = search.view ?? rememberedView
  const [compact, setCompact] = useRememberedChoice(COMPACT_CARDS_KEY, "off", ON_OFF)
  const [selecting, setSelecting] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set())
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const shown = React.useMemo(() => filterActivities(page.activities, search), [page.activities, search])
  const filtering = filterCount(search) > 0 || Boolean(search.q)
  const selectedIds = [...selected].filter((id) => shown.some((activity) => activity.id === id))
  const allDone = selectedIds.length > 0 && selectedIds.every((id) => shown.find((activity) => activity.id === id)?.done)

  const here = React.useMemo<SavedViewsScreen>(
    () => ({
      screen: tripViewScreen(trip.id),
      describe: describeTripView,
      kept: keptTripFilters,
      describeError: getTravelErrorMessage,
    }),
    [trip.id]
  )
  const viewFilters = keptTripFilters({ ...search } as Record<string, string>)

  function pickView(next: TripView) {
    rememberView(next)
    onSearch({ view: next })
    // Mass select belongs to one tab's cards, the Board's or the List's; changing tab turns it off.
    stopSelecting()
  }

  function toggleSelected(id: string) {
    setSelected((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
  }

  /**
   * Mass select on or off, from the ⋮ or a card's right-click. Turned on from
   * a card, that card starts ticked, as on Project's lists; from the ⋮,
   * nothing is.
   */
  function toggleMassSelect(tickId?: string) {
    if (selecting) {
      stopSelecting()
      return
    }
    setSelecting(true)
    setSelected(tickId ? new Set([tickId]) : new Set())
  }

  return (
    <>
      <DashboardCardHeader className="@container">
        <DashboardTabs
          value={view}
          onValueChange={(value) => pickView(value as TripView)}
          tabs={[
            { value: "board", label: "Board" },
            { value: "list", label: "List" },
            { value: "calendar", label: "Calendar" },
            { value: "map", label: "Map" },
            { value: "photos", label: "Photos" },
          ]}
        />
        <div className="flex shrink-0 items-center gap-1">
          {selectedIds.length && !readOnly ? (
            <SelectedMenu
              count={selectedIds.length}
              busy={actions.busy}
              onClear={() => setSelected(new Set())}
              main={(menu) => (
                <>
                  {/* The most common change first (UI standard, mass select; More Travel features part 12). It reads
                      Mark not done when every ticked card is already done. */}
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      void actions
                        .markDone(selectedIds, !allDone)
                        .then((ok) => (ok ? setSelected(new Set()) : undefined))
                    }}
                  >
                    {allDone ? "Mark not done" : "Mark done"}
                  </SelectedMenuRow>
                  <SelectedMenuRow page="move" onClick={() => menu.step("move")}>
                    Move to day
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      void actions.remove(selectedIds).then((ok) => (ok ? setSelected(new Set()) : undefined))
                    }}
                  >
                    Delete
                  </SelectedMenuRow>
                </>
              )}
              pages={{
                move: {
                  title: "Move to day",
                  content: (menu) => (
                    <>
                      {[null, ...Array.from({ length: trip.days }, (_, index) => index + 1)].map((day) => (
                        <SelectedMenuRow
                          key={day ?? "ideas"}
                          onClick={() => {
                            menu.close()
                            void actions
                              .moveMany(selectedIds, day)
                              .then((ok) => (ok ? setSelected(new Set()) : undefined))
                          }}
                        >
                          {day === null ? "Ideas" : dayLabel(day, trip.startDate)}
                        </SelectedMenuRow>
                      ))}
                    </>
                  ),
                },
              }}
            />
          ) : null}
          {/* Opened from the ⋮ after the tabs, which holds Search and Mass select (the Admin 3 panel design,
              Tyler, 6 Nov 2026: "mass selects is also not ui standards"). */}
          <MenuSearch
            open={searchOpen}
            onOpenChange={setSearchOpen}
            name="activity-search"
            label="Search activities"
            placeholder="Search activities…"
            value={search.q ?? ""}
            onChange={(q) => onSearch({ q: q || undefined })}
          />
          {/* Shows or hides the Ideas column, between the search and Filter
              (Tyler, 3 Nov 2026: "move the idea icon here"). Lit while Ideas shows. */}
          {view === "board" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <DashboardToolbarButton
                  type="button"
                  variant="ghost"
                  aria-pressed={!layout.ideasHidden}
                  aria-label={layout.ideasHidden ? "Show the Ideas column" : "Hide the Ideas column"}
                  onClick={() => layout.setIdeasHidden(!layout.ideasHidden)}
                >
                  {layout.ideasHidden ? <LightbulbOffIcon className="size-4" /> : <LightbulbIcon className="size-4" />}
                </DashboardToolbarButton>
              </TooltipTrigger>
              <TooltipContent>{layout.ideasHidden ? "Show Ideas" : "Hide Ideas"}</TooltipContent>
            </Tooltip>
          ) : null}
          {view === "board" ? <JumpToDay days={trip.days} startDate={trip.startDate} onJump={layout.jumpTo} /> : null}
          <FilterPopover
            count={filterCount(search)}
            open={filterOpen}
            onOpenChange={setFilterOpen}
            onClear={() => onSearch(Object.fromEntries(TRIP_FILTER_KEYS.map((key) => [key, undefined])))}
            save={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (Object.keys(viewFilters).length === 0) {
                    showErrorToast("Search or pick a filter first, then save it as a view.")
                    return
                  }
                  setFilterOpen(false)
                  setSavingView(true)
                }}
              >
                <BookmarkPlusIcon className="size-4" />
                Save as view
              </Button>
            }
          >
            <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
              <Label htmlFor="trip-filter-type">Type</Label>
              <Select
                value={search.type ?? ANY}
                onValueChange={(value) => onSearch({ type: value === ANY ? undefined : value })}
              >
                <SelectTrigger id="trip-filter-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any type</SelectItem>
                  {page.types.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <span className="flex items-center gap-2">
                        <ActivityTypeIcon type={type} />
                        {type.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* More Travel features part 11: Done, Part of the day, No place yet, Cost, and Must do (part 4). */}
              <FilterSelect
                id="trip-filter-done"
                label="Done"
                value={search.done}
                anyLabel="Done or not"
                options={[
                  ["todo", "Not done"],
                  ["done", "Done"],
                ]}
                onChange={(done) => onSearch({ done })}
              />
              <FilterSelect
                id="trip-filter-part"
                label="Part of day"
                value={search.part}
                anyLabel="Any time"
                options={DAY_PARTS.map((part) => [part, DAY_PART_LABEL[part]])}
                onChange={(part) => onSearch({ part })}
              />
              <FilterSelect
                id="trip-filter-place"
                label="Place"
                value={search.place}
                anyLabel="Any place"
                options={[["none", "No place yet"]]}
                onChange={(place) => onSearch({ place })}
              />
              <FilterSelect
                id="trip-filter-cost"
                label="Cost"
                value={search.cost}
                anyLabel="Any cost"
                options={[
                  ["yes", "Has a cost"],
                  ["no", "No cost"],
                ]}
                onChange={(cost) => onSearch({ cost })}
              />
              <FilterSelect
                id="trip-filter-must"
                label="Must do"
                value={search.must}
                anyLabel="Every activity"
                options={[["yes", "Must do only"]]}
                onChange={(must) => onSearch({ must })}
              />
            </div>
          </FilterPopover>
          <SavedViewsControls
            here={here}
            views={page.views}
            filters={viewFilters}
            saveButton={false}
            buttonVariant="ghost"
            onOpen={(saved) => {
              const type = typeof saved.filters.type === "string" ? saved.filters.type : undefined
              const typeGone = type && !page.types.some((item) => item.id === type)
              if (typeGone) showErrorToast(`${saved.names.type ?? "A type"} was removed, so the view opens without it.`)
              // Every filter the view holds, and none it doesn't, so it opens exactly as it was saved.
              const kept = readTripFilters(saved.filters)
              onSearch({
                ...Object.fromEntries(TRIP_FILTER_KEYS.map((key) => [key, undefined])),
                q: undefined,
                ...kept,
                type: typeGone ? undefined : kept.type,
              })
            }}
          />
          {readOnly ? null : <AddMenu
            newActivity={newActivity}
            onLinks={() => setWindowOpen("links")}
            onDraft={() => setWindowOpen("draft")}
            onGaps={() => setWindowOpen("gaps")}
            onIdeas={() => setWindowOpen("ideas")}
            onPaste={() => setWindowOpen("paste")}
            onCalendar={() => setWindowOpen("calendar")}
          />}
          {/* The ⋮ sits after "+ Add", the last thing in the header, as Project's does (Tyler, 6 Nov 2026,
              pointing past "+ Add": "The 3 dots icon is supposed to be here"). */}
          {readOnly ? null : (
            <ScheduleMenu
              binCount={page.binCount}
              onBin={() => setWindowOpen("bin")}
              onSearch={() => setSearchOpen(true)}
              massSelect={view === "board" || view === "list" ? { on: selecting, onToggle: () => toggleMassSelect() } : undefined}
            />
          )}
        </div>
      </DashboardCardHeader>
      {/* With no signal the trip is the copy kept from the last visit, and every change is off (Travel features part 10). */}
      {readOnly ? <NoSignalLine /> : null}
      {/* A search or filter that hides every card says so, with the way back (the Admin 3 panel design:
          "No tasks match "x"." with Clear filters, never a line telling the person what to do). */}
      {filtering && shown.length === 0 && page.activities.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <p className="text-sm text-muted-foreground">
            {search.q ? `No activities match "${search.q}".` : "No activities match these filters."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSearch({ q: undefined, ...Object.fromEntries(TRIP_FILTER_KEYS.map((key) => [key, undefined])) })}
          >
            Clear filters
          </Button>
        </div>
      ) : null}
      {view === "list" ? (
        <TripListView
          activities={shown}
          newActivity={newActivity}
          actions={actions}
          selecting={selecting && !readOnly}
          selected={selected}
          onToggleSelected={toggleSelected}
          onSelectMany={(ids) =>
            setSelected((was) => {
              const next = new Set(was)
              const all = ids.every((id) => next.has(id))
              for (const id of ids) {
                if (all) next.delete(id)
                else next.add(id)
              }
              return next
            })
          }
          onMassSelect={readOnly ? undefined : toggleMassSelect}
        />
      ) : view === "calendar" ? (
        <TripCalendarView activities={shown} />
      ) : view === "map" ? (
        <TripMapView activities={shown} />
      ) : view === "photos" ? (
        <TripPhotosView activities={shown} />
      ) : (
        // The board fills the panel; its two fold buttons float at its bottom right.
        <div className="relative flex min-h-0 flex-1 flex-col">
          <DayBoard
            activities={shown}
            newActivity={newActivity}
            actions={actions}
            compact={compact === "on"}
            selecting={selecting && !readOnly}
            selected={selected}
            onToggleSelected={toggleSelected}
            onMassSelect={readOnly ? undefined : toggleMassSelect}
            layout={layout}
            showGaps={!filtering}
            onFillDay={(day) => setFilling({ day, open: true })}
            between={(first, next) => <RouteTime first={first} next={next} mode={trip.travelMode} />}
            ideasButton={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Add from saved places"
                  onClick={() => setWindowOpen("saved")}
                >
                  <BookmarkIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add from saved places</TooltipContent>
            </Tooltip>
            }
            holidayOn={(day) => weather.holidays.some((holiday) => holiday.day === day)}
            forecast={weather.forecast}
          />
          <BoardCorner
            compact={compact === "on"}
            onCompact={() => setCompact(compact === "on" ? "off" : "on")}
            allFolded={layout.allFolded}
            onFoldAll={layout.toggleFoldAll}
          />
        </div>
      )}
      <SaveViewDialog open={savingView} here={here} filters={viewFilters} onClose={() => setSavingView(false)} />
      <BinDialog open={windowOpen === "bin"} onClose={() => setWindowOpen(null)} />
      <SavedPlacesDialog
        open={windowOpen === "saved"}
        tripId={trip.id}
        onClose={() => setWindowOpen(null)}
        onAdded={(id) => {
          void refresh().then(() => openActivity(id))
        }}
      />
      <PasteBookingDialog
        open={windowOpen === "paste"}
        onClose={() => setWindowOpen(null)}
        tripId={trip.id}
        days={trip.days}
        startDate={trip.startDate}
        types={page.types}
        currency={trip.currency}
        onCreated={(id) => {
          setWindowOpen(null)
          void refresh().then(() => openActivity(id))
        }}
      />
      <PasteLinksDialog
        open={windowOpen === "links"}
        tripId={trip.id}
        onClose={() => setWindowOpen(null)}
        onLanded={refresh}
      />
      <SuggestIdeasDialog
        open={windowOpen === "ideas"}
        tripId={trip.id}
        types={page.types}
        onClose={() => setWindowOpen(null)}
        onMade={refresh}
      />
      <DraftPlanDialog
        open={windowOpen === "draft"}
        tripId={trip.id}
        startDate={trip.startDate}
        types={page.types}
        onClose={() => setWindowOpen(null)}
        onMade={refresh}
      />
      <DraftPlanDialog
        open={windowOpen === "gaps"}
        tripId={trip.id}
        startDate={trip.startDate}
        types={page.types}
        gaps
        onClose={() => setWindowOpen(null)}
        onMade={refresh}
      />
      <DraftPlanDialog
        open={filling.open}
        tripId={trip.id}
        startDate={trip.startDate}
        types={page.types}
        day={filling.day}
        onClose={() => setFilling((was) => ({ ...was, open: false }))}
        onMade={refresh}
      />
      <CalendarLinkDialog
        open={windowOpen === "calendar"}
        onClose={() => setWindowOpen(null)}
        tripId={trip.id}
        hasStartDate={trip.startDate !== null}
      />
    </>
  )
}

/**
 * One filter's row in Filter: a label, then its Select, with "any" as the
 * first choice, which clears it. The choices are fixed lists, so whatever is
 * picked is one of them.
 */
function FilterSelect<T extends string>({
  id,
  label,
  value,
  anyLabel,
  options,
  onChange,
}: {
  id: string
  label: string
  value: T | undefined
  anyLabel: string
  options: readonly (readonly [T, string])[]
  onChange: (next: T | undefined) => void
}) {
  return (
    <>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? undefined : (next as T))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map(([option, text]) => (
            <SelectItem key={option} value={option}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

/**
 * Compact cards and Fold every day, floating at the board's bottom right
 * (Tyler, 3 Nov 2026: "Move the 2 fold icons to the bottom right of the
 * canvas"), out of the header's way.
 */
function BoardCorner({
  compact,
  onCompact,
  allFolded,
  onFoldAll,
}: {
  compact: boolean
  onCompact: () => void
  allFolded: boolean
  onFoldAll: () => void
}) {
  const compactLabel = compact ? "Show full cards" : "Compact cards: one line each"
  const foldLabel = allFolded ? "Unfold every day" : "Fold every day"
  return (
    <div className="absolute right-4 bottom-4 z-10 flex items-center gap-1 rounded-lg border bg-card p-1 shadow-sm">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={compact ? "secondary" : "ghost"}
            size="icon"
            aria-pressed={compact}
            aria-label="Compact cards"
            onClick={onCompact}
          >
            <ChevronsDownUpIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{compactLabel}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={allFolded ? "secondary" : "ghost"}
            size="icon"
            aria-pressed={allFolded}
            aria-label={foldLabel}
            onClick={onFoldAll}
          >
            {allFolded ? <UnfoldHorizontalIcon className="size-4" /> : <FoldHorizontalIcon className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{foldLabel}</TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * "+ Add" at the end of the header (Tyler, 3 Nov 2026: "Rename the "new
 * activity" button to "+ Add" clicking on this opens a dropdown to give me 3
 * options: New activity, Paste a booking, Add to calender"). New activity
 * opens the New activity dropdown in the same place; the others open their
 * windows. Paste Maps links, Draft a plan, Fill every gap and Suggest Ideas
 * (Travel features parts 6 and 7, Travel features 4 part 10, Travel features
 * 3 part 9) sit after New activity, as the other ways to add places. In a
 * narrow panel the button is the + alone.
 */
function AddMenu({
  newActivity,
  onLinks,
  onDraft,
  onGaps,
  onIdeas,
  onPaste,
  onCalendar,
}: {
  newActivity: ReturnType<typeof useNewActivity>
  onLinks: () => void
  onDraft: () => void
  onGaps: () => void
  onIdeas: () => void
  onPaste: () => void
  onCalendar: () => void
}) {
  const [open, setOpen] = React.useState(false)
  // Set while New activity takes over, so focus stays in its Name field rather than going back to "+ Add".
  const handingOff = React.useRef(false)
  return (
    <div className="relative ml-1">
      <FoldingMenu
        label="Add"
        fit
        open={open}
        onOpenChange={setOpen}
        onCloseAutoFocus={(event) => {
          if (handingOff.current) event.preventDefault()
          handingOff.current = false
        }}
        trigger={
          <Button type="button" className="@max-3xl:size-8 @max-3xl:px-0" aria-label="Add">
            <PlusIcon className="size-4" />
            <span className="@max-3xl:hidden">Add</span>
          </Button>
        }
      >
        <MenuAction
          icon={<PlusIcon className="size-4" />}
          onClick={() => {
            handingOff.current = true
            setOpen(false)
            newActivity.open("header", 1)
          }}
        >
          New activity
        </MenuAction>
        <MenuAction
          icon={<MapPinPlusIcon className="size-4" />}
          onClick={() => {
            setOpen(false)
            onLinks()
          }}
        >
          Paste Maps links
        </MenuAction>
        <MenuAction
          icon={<SparklesIcon className="size-4" />}
          onClick={() => {
            setOpen(false)
            onDraft()
          }}
        >
          Draft a plan
        </MenuAction>
        <MenuAction
          icon={<WandSparklesIcon className="size-4" />}
          onClick={() => {
            setOpen(false)
            onGaps()
          }}
        >
          Fill every gap
        </MenuAction>
        <MenuAction
          icon={<LightbulbIcon className="size-4" />}
          onClick={() => {
            setOpen(false)
            onIdeas()
          }}
        >
          Suggest Ideas
        </MenuAction>
        <MenuAction
          icon={<MailOpenIcon className="size-4" />}
          onClick={() => {
            setOpen(false)
            onPaste()
          }}
        >
          Paste a booking
        </MenuAction>
        <MenuAction
          icon={<CalendarPlusIcon className="size-4" />}
          onClick={() => {
            setOpen(false)
            onCalendar()
          }}
        >
          Add to calendar
        </MenuAction>
      </FoldingMenu>
      {/* The New activity dropdown hangs from "+ Add" too. Its own trigger is this see-through cover, which
          lets clicks through to "+ Add" underneath. */}
      {newActivity("header", 1, <span aria-hidden tabIndex={-1} className="pointer-events-none absolute inset-0" />)}
    </div>
  )
}

/**
 * Jump to a day (Travel features 3, part 7; Tyler, 5 Nov 2026: "Day and date
 * only"): every day as "Day 3 · Wed 12 Mar", or "Day 3" on a trip with no
 * dates. Picking one scrolls the board to it and opens it if it was folded; on
 * a phone it switches to that day.
 */
function JumpToDay({ days, startDate, onJump }: { days: number; startDate: string | null; onJump: (day: number) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    // The tooltip and the menu both hang from the one button.
    <Tooltip>
      <FoldingMenu
        label="Jump to a day"
        fit
        open={open}
        onOpenChange={setOpen}
        trigger={
          <TooltipTrigger asChild>
            <DashboardToolbarButton type="button" variant="ghost" aria-label="Jump to a day">
              <CalendarDaysIcon className="size-4" />
            </DashboardToolbarButton>
          </TooltipTrigger>
        }
      >
        {Array.from({ length: days }, (_, index) => index + 1).map((day) => (
          <MenuAction
            key={day}
            icon={null}
            onClick={() => {
              setOpen(false)
              onJump(day)
            }}
          >
            {dayLabel(day, startDate)}
          </MenuAction>
        ))}
      </FoldingMenu>
      <TooltipContent>Jump to a day</TooltipContent>
    </Tooltip>
  )
}

/**
 * The ⋮ at the end of the header, after "+ Add" (Tyler, 6 Nov 2026: "The 3
 * dots icon is supposed to be here"). It took the place of the More dropdown
 * (Tyler, 3 Nov 2026: "Replace the "More" dropdown with a 3 vertical dot"),
 * and sat after the tabs until 6 Nov 2026. Since 6 Nov 2026 it
 * also holds Search activities and, on the Board, Mass select, which were
 * buttons in the header (the Admin 3 panel design: "The ⋮ holds Search and
 * Mass select"; Tyler: "mass selects is also not ui standards"). Search opens
 * its box once the menu has closed, so the cursor lands in the box rather
 * than back on the ⋮.
 */
function ScheduleMenu({
  binCount,
  onBin,
  onSearch,
  massSelect,
}: {
  binCount: number
  onBin: () => void
  onSearch: () => void
  /** Only where the view has Mass select, the Board and the List. */
  massSelect?: { on: boolean; onToggle: () => void }
}) {
  const [open, setOpen] = React.useState(false)
  const searchNext = React.useRef(false)
  const named = massSelect ? "Search, Mass select and the bin" : "Search and the bin"
  return (
    <Tooltip>
        <FoldingMenu
          label="More for this trip"
          align="end"
          fit
          open={open}
          onOpenChange={setOpen}
          onCloseAutoFocus={(event) => {
            if (!searchNext.current) return
            event.preventDefault()
            searchNext.current = false
            onSearch()
          }}
          trigger={
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="More for this trip" className="size-8">
                <EllipsisVerticalIcon className="size-4" />
              </Button>
            </TooltipTrigger>
          }
        >
          <MenuAction
            icon={<SearchIcon className="size-4" />}
            onClick={() => {
              searchNext.current = true
              setOpen(false)
            }}
          >
            Search activities
          </MenuAction>
          {massSelect ? (
            <MenuAction
              icon={<ListChecksIcon className="size-4" />}
              onClick={() => {
                setOpen(false)
                massSelect.onToggle()
              }}
            >
              {massSelect.on ? "Hide select" : "Mass select"}
            </MenuAction>
          ) : null}
          <MenuAction
            icon={<Trash2Icon className="size-4" />}
            onClick={() => {
              setOpen(false)
              onBin()
            }}
          >
            Bin{binCount ? ` (${binCount})` : ""}
          </MenuAction>
        </FoldingMenu>
        <TooltipContent>{named}</TooltipContent>
      </Tooltip>
  )
}
