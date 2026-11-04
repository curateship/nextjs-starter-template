import * as React from "react"
import {
  BookmarkIcon,
  BookmarkPlusIcon,
  CalendarPlusIcon,
  ChevronsDownUpIcon,
  EllipsisVerticalIcon,
  FoldHorizontalIcon,
  LightbulbIcon,
  LightbulbOffIcon,
  UnfoldHorizontalIcon,
  MailOpenIcon,
  MapPinPlusIcon,
  PlusIcon,
  SparklesIcon,
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
import { DayBoard } from "@/components/travel/day-board"
import { useBoardLayout } from "@/components/travel/use-board-layout"
import { DayWeatherLine, useTripWeather } from "@/components/travel/day-weather"
import { dayLabel, useNewActivity } from "@/components/travel/new-activity"
import { TripCalendarView } from "@/components/travel/trip-calendar-view"
import { useTrip } from "@/components/travel/trip-context"
import { wantsDraftOnArrival } from "@/components/travel/draft-on-arrival"
import { NoSignalLine } from "@/components/travel/no-signal-line"
import { DraftPlanDialog } from "@/components/travel/draft-plan-dialog"
import { TripListView } from "@/components/travel/trip-list-view"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { MassSelectChip, SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { SavedViewsControls, SaveViewDialog, type SavedViewsScreen } from "@/components/shared/saved-views"
import { SearchToggle } from "@/components/shared/search-toggle"
import { useOptionalShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DEFAULT_DASHBOARD_TABS } from "@/lib/layout/styling-values"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { COMPACT_CARDS_KEY, TRIP_VIEW_KEY } from "@/lib/travel/panel-keys"
import {
  filterActivities,
  filterCount,
  TRIP_VIEWS,
  type TripSearch,
  type TripView,
} from "@/lib/travel/trip-search"
import {
  describeTripView,
  keptTripFilters,
  tripViewScreen,
} from "@/lib/travel/trip-views"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const ANY = "any"
const ON_OFF = ["on", "off"] as const

/**
 * The trip's middle panel: the schedule as Board, List or Calendar, Board
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
  const { page, refresh, openActivity, readOnly } = useTrip()
  const { trip } = page
  const newActivity = useNewActivity()
  const layout = useBoardLayout(trip.id, trip.days)
  // A trip just made with "Fill it with a first plan" opens on its drafted plan (Travel features part 7).
  const [windowOpen, setWindowOpen] = React.useState<"bin" | "saved" | "paste" | "links" | "draft" | "calendar" | null>(
    () => (wantsDraftOnArrival(trip.id) ? "draft" : null)
  )
  const actions = useBoardActions()
  // The tab is in the address; with none there, the one this browser used last.
  const [rememberedView, rememberView] = useRememberedChoice<TripView>(TRIP_VIEW_KEY, "board", TRIP_VIEWS)
  const view: TripView = search.view ?? rememberedView
  const [compact, setCompact] = useRememberedChoice(COMPACT_CARDS_KEY, "off", ON_OFF)
  const [selecting, setSelecting] = React.useState(false)
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set())
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const weather = useTripWeather(trip)
  const shown = React.useMemo(() => filterActivities(page.activities, search), [page.activities, search])
  const filtering = Boolean(search.type || search.q)
  const selectedIds = [...selected].filter((id) => shown.some((activity) => activity.id === id))

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
          ]}
          after={readOnly ? undefined : <ScheduleMenu binCount={page.binCount} onBin={() => setWindowOpen("bin")} />}
        />
        <div className="flex shrink-0 items-center gap-1">
          {selectedIds.length && !readOnly ? (
            <SelectedMenu
              count={selectedIds.length}
              busy={actions.busy}
              onClear={() => setSelected(new Set())}
              main={(menu) => (
                <>
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
          {view !== "board" || readOnly ? null : (
            <MassSelectChip on={selecting} onToggle={() => (selecting ? stopSelecting() : setSelecting(true))} />
          )}
          <SearchToggle
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
          <FilterPopover
            count={filterCount(search)}
            open={filterOpen}
            onOpenChange={setFilterOpen}
            onClear={() => onSearch({ type: undefined })}
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
              onSearch({
                type: typeGone ? undefined : type,
                q: typeof saved.filters.q === "string" ? saved.filters.q : undefined,
              })
            }}
          />
          {readOnly ? null : <AddMenu
            newActivity={newActivity}
            onLinks={() => setWindowOpen("links")}
            onDraft={() => setWindowOpen("draft")}
            onPaste={() => setWindowOpen("paste")}
            onCalendar={() => setWindowOpen("calendar")}
          />}
        </div>
      </DashboardCardHeader>
      {/* With no signal the trip is the copy kept from the last visit, and every change is off (Travel features part 10). */}
      {readOnly ? <NoSignalLine /> : null}
      {view === "list" ? (
        <TripListView activities={shown} />
      ) : view === "calendar" ? (
        <TripCalendarView activities={shown} />
      ) : view === "map" ? (
        <TripMapView activities={shown} />
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
            layout={layout}
            showGaps={!filtering}
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
            weatherOf={(day) => {
              const forecast = weather.find((item) => item.day === day)
              return forecast ? <DayWeatherLine weather={forecast} /> : null
            }}
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
      <DraftPlanDialog
        open={windowOpen === "draft"}
        tripId={trip.id}
        startDate={trip.startDate}
        types={page.types}
        onClose={() => setWindowOpen(null)}
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
 * windows. Paste Maps links and Draft a plan (Travel features parts 6 and 7)
 * sit after New activity, as the other ways to add places. In a narrow panel the button is the + alone.
 */
function AddMenu({
  newActivity,
  onLinks,
  onDraft,
  onPaste,
  onCalendar,
}: {
  newActivity: ReturnType<typeof useNewActivity>
  onLinks: () => void
  onDraft: () => void
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

/** The ⋮ after the tabs, where the More dropdown was (Tyler, 3 Nov 2026: "Replace the "More" dropdown with a 3 vertical dot"). */
function ScheduleMenu({ binCount, onBin }: { binCount: number; onBin: () => void }) {
  const [open, setOpen] = React.useState(false)
  const runtime = useOptionalShellRuntime()
  const pills = (runtime?.config.styling.dashboardTabs ?? DEFAULT_DASHBOARD_TABS) === "pills"
  return (
    // It sits level with the tab names ("not aligned"). Underlined tabs stretch to the header's height with a
    // 2px see-through line under each, so the ⋮ is centred with the same line; pills are 28px, so it is 28px.
    <div className={cn("flex items-center", !pills && "border-b-2 border-transparent")}>
      <FoldingMenu
        label="More for this trip"
        align="start"
        fit
        open={open}
        onOpenChange={setOpen}
        trigger={
          <Button type="button" variant="ghost" size={pills ? "icon-sm" : "icon"} aria-label="More for this trip">
            <EllipsisVerticalIcon className="size-4" />
          </Button>
        }
      >
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
    </div>
  )
}
