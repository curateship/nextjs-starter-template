import * as React from "react"
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, PlusIcon } from "lucide-react"

import { ActivityCardContent, CARD_CLASS } from "@/components/travel/activity-card"
import type { BoardActions } from "@/components/travel/board-actions"
import type { BoardLayout } from "@/components/travel/use-board-layout"
import { BoardCard, CardMenu } from "@/components/travel/board-card"
import { COLUMN_DRAG, COLUMN_GAP, DayColumn } from "@/components/travel/day-column"
import { dayLabel } from "@/components/travel/new-activity"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { addTripDay, moveTripDay } from "@/lib/api/travel/days"
import type { Activity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { boardColumns, dayOfColumn, formatMinutes, gapsOf, plannedMinutes } from "@/lib/travel/board"
import { dateOfDay, formatDayDate, todaysDay, weekday } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { MAX_TRIP_DAYS } from "@/lib/travel/rules"
import { hoursWarning, nearestOpenDay } from "@/lib/travel/hours"
import { mustDoWarning } from "@/lib/travel/must-do"
import { cardRainLine, rainyDayMove } from "@/lib/travel/rainy-day"
import { HOLIDAY_WARNING } from "@/lib/travel/weather"
import { readDayInfo } from "@/lib/travel/trip-days"
import { usePhone } from "@/lib/travel/use-phone"
import { beenHereText } from "@/lib/travel/been-here"
import { cn } from "@/lib/utils"

type Held = { id: string; columns: Record<string, string[]> }

const isColumnDrag = (id: UniqueIdentifier) => String(id).startsWith(COLUMN_DRAG)

/**
 * The trip's days as a board (Tyler, 2 Nov 2026: "Col 1 is day 1, col 2 is
 * day 2 etc.. and each day cards is activities for each day"), with an Ideas
 * column before Day 1 for places not on a day yet. Cards drag between columns
 * and up and down inside one, the way Project's board does
 * (`task-board.tsx`); each move saves the column's new order in one go and
 * can be undone. A day drags by its heading. A stay of several nights is one
 * card on its check-in day (Tyler, 2 Nov 2026).
 */
export function DayBoard({
  activities,
  newActivity,
  actions,
  compact,
  selecting,
  selected,
  onToggleSelected,
  onMassSelect,
  layout,
  showGaps,
  between,
  ideasButton,
  onFillDay,
  holidayOn,
  forecast = [],
}: {
  /** The activities shown, after any filter. */
  activities: Activity[]
  /** The New activity dropdown, opened from a column's "+" already set to its day. */
  newActivity: (key: string, day: number | null, trigger: React.ReactNode) => React.ReactNode
  actions: BoardActions
  compact: boolean
  selecting: boolean
  selected: ReadonlySet<string>
  onToggleSelected: (id: string) => void
  /** Mass select on or off from a card's right-click, that card ticked as it comes on. */
  onMassSelect?: (tickId?: string) => void
  /** Folded days and the hidden Ideas column, shared with the header's buttons. */
  layout: BoardLayout
  /** Off while a filter hides cards, since the time between two shown cards isn't free (task part 17). */
  showGaps: boolean
  /** Something more for the line between two cards, such as the travel time (task part 43). */
  between?: (first: Activity, next: Activity) => React.ReactNode
  /** Beside the Ideas column's "+": add from saved places (task part 41). */
  ideasButton?: React.ReactNode
  /** A day's Fill this day (More Travel features part 6). */
  onFillDay: (day: number) => void
  /** Whether a day is a public holiday at the destination (More Travel features part 8). */
  holidayOn?: (day: number) => boolean
  /** Each day's chance of rain, for moving outdoor cards off a rainy day (More Travel features part 9). */
  forecast?: readonly { day: number; rain: number | null; hourlyRain?: readonly (number | null)[] }[]
}) {
  const { page, typesById, refresh, openActivity, openActivityId, readOnly } = useTrip()
  const { trip } = page
  const [run] = useAsyncAction(getTravelErrorMessage)
  const { folded, toggleFold, ideasHidden } = layout
  const [menu, setMenu] = React.useState<{ id: string; at: { x: number; y: number } } | null>(null)
  const phone = usePhone()
  const columns = React.useMemo(() => boardColumns(trip.days, activities), [activities, trip.days])
  const byId = React.useMemo(() => new Map(activities.map((activity) => [activity.id, activity])), [activities])
  const beenHereById = React.useMemo(
    () => new Map(page.beenHere.map((visit) => [visit.activityId, beenHereText(visit)])),
    [page.beenHere]
  )
  const dayInfo = readDayInfo(trip)
  const today = todaysDay(trip)
  const [held, setHeldState] = React.useState<Held | null>(null)
  const heldRef = React.useRef<Held | null>(null)
  function setHeld(next: Held | null) {
    heldRef.current = next
    setHeldState(next)
  }
  // A drag starts after 8px, so a click still opens the card. With no signal each card and day is set not to drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const dndId = React.useId()
  const allKeys = [...columns.keys()].filter((key) => !(ideasHidden && key === "ideas"))
  // On a phone, one day at a time (task part 46): today's on a trip that's on, otherwise Day 1.
  const [phoneKey, setPhoneKey] = React.useState(() => (today ? `day-${today}` : "day-1"))
  const shownPhoneKey = allKeys.includes(phoneKey) ? phoneKey : "day-1"
  const keys = phone ? [shownPhoneKey] : allKeys
  const step = (by: -1 | 1) => {
    const at = allKeys.indexOf(shownPhoneKey)
    const next = allKeys[Math.min(allKeys.length - 1, Math.max(0, at + by))]
    if (next) setPhoneKey(next)
  }
  const swipeFrom = React.useRef<number | null>(null)
  // Jump to a day (Travel features 3, part 7): a phone switches to that day, a wider screen scrolls to it.
  const [seenJump, setSeenJump] = React.useState(layout.jump)
  if (layout.jump !== seenJump) {
    setSeenJump(layout.jump)
    if (layout.jump && phone) setPhoneKey(layout.jump.key)
  }

  // During the trip the board opens on today's column (task part 6).
  const boardRef = React.useRef<HTMLDivElement>(null)
  const panArea = React.useRef<HTMLDivElement>(null)
  const pan = useDragToPan(panArea)
  React.useEffect(() => {
    if (today === null) return
    boardRef.current
      ?.querySelector(`[data-day-column="day-${today}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "start" })
  }, [today, trip.id])

  React.useEffect(() => {
    if (!layout.jump || phone) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    boardRef.current
      ?.querySelector(`[data-day-column="${layout.jump.key}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "start", behavior: still ? "auto" : "smooth" })
  }, [layout.jump, phone])

  // Cards land on cards and columns; a day only on another day.
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    if (isColumnDrag(args.active.id)) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) => isColumnDrag(container.id)),
      })
    }
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => !isColumnDrag(container.id) && !String(container.id).endsWith("-fixed")
      ),
    })
  }, [])

  function handleDragStart(event: DragStartEvent) {
    if (isColumnDrag(event.active.id)) return
    setHeld({
      id: String(event.active.id),
      columns: Object.fromEntries([...columns].map(([key, cards]) => [key, cards.map((card) => card.id)])),
    })
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    const current = heldRef.current
    if (!over || !current || isColumnDrag(active.id)) return
    const from = columnOf(current.columns, active.id)
    const to = columnOf(current.columns, over.id)
    if (!from || !to || from === to) return
    const target = current.columns[to]
    const overIndex = target.indexOf(String(over.id))
    const translated = active.rect.current.translated
    const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false
    const at = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length
    setHeld({
      ...current,
      columns: {
        ...current.columns,
        [from]: current.columns[from].filter((id) => id !== active.id),
        [to]: [...target.slice(0, at), String(active.id), ...target.slice(at)],
      },
    })
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (isColumnDrag(active.id)) {
      if (!over || !isColumnDrag(over.id)) return
      const from = dayOfColumn(String(active.id).slice(COLUMN_DRAG.length))
      const to = dayOfColumn(String(over.id).slice(COLUMN_DRAG.length))
      if (from === null || to === null || from === to) return
      void run(async () => {
        await moveTripDay(trip.id, from, to)
        await refresh()
      })
      return
    }
    const state = heldRef.current
    setHeld(null)
    const activity = byId.get(String(active.id))
    if (!state || !activity || !over) return
    const key = columnOf(state.columns, active.id)
    if (!key) return
    let ids = state.columns[key]
    const from = ids.indexOf(activity.id)
    const to = ids.indexOf(String(over.id))
    if (to >= 0 && to !== from) ids = arrayMove(ids, from, to)
    const day = dayOfColumn(key)
    const before = (columns.get(key) ?? []).map((card) => card.id)
    if (day === activity.day && ids.every((id, index) => id === before[index])) return
    void actions.moveTo(activity, day, ids)
  }

  const menuActivity = menu ? byId.get(menu.id) : undefined
  const heldActivity = held ? byId.get(held.id) : undefined

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setHeld(null)}
    >
      {phone ? (
        <PhoneDayPager
          label={shownPhoneKey === "ideas" ? "Ideas" : `Day ${dayOfColumn(shownPhoneKey)}`}
          first={allKeys.indexOf(shownPhoneKey) === 0}
          last={allKeys.indexOf(shownPhoneKey) === allKeys.length - 1}
          onStep={step}
        />
      ) : null}
      {/* The whole board area, empty space under the columns included, drags sideways. */}
      <div
        ref={panArea}
        // An open hand over empty space says it drags; a closed one while it does (Tyler, 3 Nov 2026).
        className={cn("flex min-h-0 flex-1 flex-col", phone ? undefined : pan.panning ? "cursor-grabbing select-none" : "cursor-grab")}
        onPointerDown={phone ? undefined : pan.onPointerDown}
      >
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div
          ref={boardRef}
          className={cn("relative", phone ? "w-full" : "w-max min-w-full")}

          onTouchStart={(event) => {
            if (phone) swipeFrom.current = event.touches[0].clientX
          }}
          onTouchEnd={(event) => {
            if (!phone || swipeFrom.current === null) return
            const moved = event.changedTouches[0].clientX - swipeFrom.current
            swipeFrom.current = null
            // A swipe of 60px or more moves one day.
            if (Math.abs(moved) >= 60) step(moved < 0 ? 1 : -1)
          }}
        >
          <SortableContext
            items={keys.filter((key) => key !== "ideas").map((key) => COLUMN_DRAG + key)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex min-h-0 items-start p-3" style={{ gap: COLUMN_GAP }}>
              {keys.map((key) => {
                const day = dayOfColumn(key)
                const cards = held
                  ? held.columns[key].flatMap((id) => byId.get(id) ?? [])
                  : (columns.get(key) ?? [])
                const label = day === null ? "Ideas" : `Day ${day}`
                const date = day === null ? null : dateOfDay(trip.startDate, day)
                const gaps = held || !showGaps ? [] : gapsOf(cards)
                return (
                  <DayColumn
                    key={key}
                    id={key}
                    day={day}
                    date={date}
                    info={day === null ? null : dayInfo[day - 1]}
                    isToday={day !== null && day === today}
                    folded={!phone && folded.has(key)}
                    readOnly={readOnly}
                    // Every card on the day counts, whatever Filter is showing.
                    planned={day === null ? null : plannedMinutes(page.activities.filter((activity) => activity.day === day))}
                    fullWidth={phone}
                    count={cards.length}
                    onFold={() => toggleFold(key)}
                    onCopyDay={(to) => (day === null ? undefined : void actions.copyDay(day, to))}
                    onBestOrder={() => (day === null ? undefined : void actions.bestOrder(day))}
                    onFillDay={() => (day === null ? undefined : onFillDay(day))}
                    addButton={
                      readOnly ? null : <>
                        {day === null ? ideasButton : null}
                        {newActivity(
                          key,
                          day,
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Add an activity to ${label}`}>
                            <PlusIcon className="size-4" />
                          </Button>
                        )}
                      </>
                    }
                  >
                    {cards.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-muted-foreground">
                        {day === null ? "Places you might go. Drag them onto a day." : "Nothing planned"}
                      </p>
                    ) : (
                      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
                        <ul className={cn("flex flex-col", compact ? "gap-1" : "gap-2")}>
                          {cards.map((card, index) => {
                            const gap = gaps.find((item) => item.afterId === card.id)
                            const next = cards[index + 1]
                            const extra = next && between && showGaps && !held ? between(card, next) : null
                            // A sight or meal on a public holiday may find it shut (More Travel features part 8), and a
                            // Must do card left in Ideas once the trip is on says so (part 4).
                            const builtin = typeOf(card, typesById)?.builtin
                            const warning =
                              hoursWarning(card.openingHours, date ? weekday(date) : null, card.startTime) ??
                              (day !== null && holidayOn?.(day) && (builtin === "sight" || builtin === "food")
                                ? HOLIDAY_WARNING
                                : null) ??
                              mustDoWarning(card, trip)
                            // A place shut all day offers the nearest open day (Travel features part 1); compact cards stay one line.
                            const openDay = compact || held || readOnly ? null : nearestOpenDay(card.openingHours, trip, day)
                            // An outdoor place on a very rainy day offers the driest day (More Travel features part 9).
                            const rainy = compact || held || readOnly || openDay !== null ? null : rainyDayMove(card, trip, forecast)
                            return (
                              <React.Fragment key={card.id}>
                                <BoardCard
                                  activity={card}
                                  locked={readOnly}
                                  open={card.id === openActivityId}
                                  selecting={selecting}
                                  selected={selected.has(card.id)}
                                  onToggleSelected={() => onToggleSelected(card.id)}
                                  onOpen={() => openActivity(card.id)}
                                  onMenu={(at) => (readOnly ? undefined : setMenu({ id: card.id, at }))}
                                  onDone={readOnly ? undefined : () => actions.setField(card, { done: !card.done })}
                                  footer={
                                    openDay !== null && warning ? (
                                      <ClosedDayMove
                                        warning={warning}
                                        title={card.title}
                                        toDay={openDay}
                                        startDate={trip.startDate}
                                        onMove={() => void actions.moveTo(card, openDay)}
                                      />
                                    ) : rainy?.toDay ? (
                                      <ClosedDayMove
                                        warning={rainy.warning}
                                        title={card.title}
                                        toDay={rainy.toDay}
                                        startDate={trip.startDate}
                                        onMove={() => void actions.moveTo(card, rainy.toDay)}
                                      />
                                    ) : undefined
                                  }
                                >
                                  <ActivityCardContent
                                    activity={card}
                                    type={typeOf(card, typesById)}
                                    currency={trip.currency}
                                    compact={compact}
                                    roomForMenu
                                    warning={openDay !== null ? null : (warning ?? (rainy && !rainy.toDay ? rainy.warning : null))}
                                    // Rain at the card's own hour (Travel features 4, part 3); a place shut that day says that instead.
                                    rain={openDay !== null || held ? null : cardRainLine(card, forecast)}
                                    beenHere={beenHereById.get(card.id) ?? null}
                                  />
                                </BoardCard>
                                {gap || extra ? <GapLine gap={gap} extra={extra} /> : null}
                              </React.Fragment>
                            )
                          })}
                        </ul>
                      </SortableContext>
                    )}
                  </DayColumn>
                )
              })}
              {/* After the last day, a "+" that adds one more (Tyler, 3 Nov 2026: "Add an + icon here to add a day"). */}
              {phone || readOnly ? null : <AddDayButton />}
            </div>
          </SortableContext>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      </div>
      <DragOverlay>
        {heldActivity ? (
          <div aria-hidden className={cn(CARD_CLASS, "w-64 cursor-grabbing shadow-lg")}>
            <ActivityCardContent
              activity={heldActivity}
              type={typeOf(heldActivity, typesById)}
              currency={trip.currency}
              compact={compact}
            />
          </div>
        ) : null}
      </DragOverlay>
      {menu && menuActivity ? (
        <CardMenu
          key={menu.id + menu.at.x + menu.at.y}
          at={menu.at}
          activity={menuActivity}
          days={trip.days}
          startDate={trip.startDate}
          actions={actions}
          massSelect={onMassSelect ? { on: selecting, onToggle: () => onMassSelect(menuActivity.id) } : undefined}
          onOpen={() => openActivity(menuActivity.id)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </DndContext>
  )
}

/** The column a card is in, or the column itself when the pointer is over its empty space. */
function columnOf(columns: Record<string, string[]>, id: UniqueIdentifier) {
  const key = String(id)
  if (key in columns) return key
  return Object.keys(columns).find((column) => columns[column].includes(key)) ?? null
}

/**
 * "Closed on Mondays" with "Move to Tue", along the foot of a card whose
 * place is shut all day (Tyler, 3 Nov 2026: "Warning + Move button"), or
 * "Rain on Tue" with "Move to Thu" on an outdoor card on a very rainy day
 * (More Travel features part 9). The move is the board's usual one, with Undo.
 */
export function ClosedDayMove({
  warning,
  title,
  toDay,
  startDate,
  onMove,
}: {
  warning: string
  title: string
  toDay: number
  startDate: string | null
  onMove: () => void
}) {
  const date = dateOfDay(startDate, toDay)
  return (
    <>
      <span className="min-w-0 truncate text-xs text-destructive">{warning}</span>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="ml-auto shrink-0"
        aria-label={`Move ${title} to ${dayLabel(toDay, startDate)}`}
        onClick={onMove}
      >
        Move to {date ? formatDayDate(date).split(" ")[0] : `Day ${toDay}`}
      </Button>
    </>
  )
}

/** The thin line between two timed cards (task part 8): "1h 30m free", or how much they overlap. */
function GapLine({ gap, extra }: { gap: ReturnType<typeof gapsOf>[number] | undefined; extra: React.ReactNode }) {
  return (
    <li
      aria-hidden={!gap && !extra}
      className={cn(
        "flex items-center gap-2 px-1 text-xs",
        gap?.kind === "overlap" ? "text-destructive" : "text-muted-foreground"
      )}
    >
      <span className="h-px flex-1 bg-border" />
      {gap ? (gap.kind === "overlap" ? `Overlaps by ${formatMinutes(gap.minutes)}` : `${formatMinutes(gap.minutes)} free`) : null}
      {extra}
      <span className="h-px flex-1 bg-border" />
    </li>
  )
}

/** The day picker over a phone's one-day board: back and forward a day, with the day's name between. */
function PhoneDayPager({
  label,
  first,
  last,
  onStep,
}: {
  label: string
  first: boolean
  last: boolean
  onStep: (by: -1 | 1) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
      <Button type="button" variant="outline" size="icon" aria-label="Day before" disabled={first} onClick={() => onStep(-1)}>
        <ChevronLeftIcon className="size-4" />
      </Button>
      <span className="text-sm font-medium" aria-live="polite">
        {label}
      </span>
      <Button type="button" variant="outline" size="icon" aria-label="Day after" disabled={last} onClick={() => onStep(1)}>
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  )
}

/** What a press on the board lands on that keeps its own meaning, so it never starts a pan. */
const NOT_EMPTY =
  "[data-activity-id], button, input, textarea, a, [role=button], [contenteditable], [aria-roledescription], [data-slot=scroll-area-scrollbar]"

/**
 * Dragging the board's empty space scrolls it sideways (task "Misc": "I want
 * to be able to drag empty space to go horizontal scroll"), the way a map
 * pans. Cards, buttons and a day's heading keep their own drag.
 */
function useDragToPan(area: React.RefObject<HTMLDivElement | null>) {
  const [panning, setPanning] = React.useState(false)
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType === "touch") return
    const target = event.target
    if (!(target instanceof Element) || target.closest(NOT_EMPTY)) return
    const viewport = area.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]")
    if (!viewport) return
    const startX = event.clientX
    const startLeft = viewport.scrollLeft
    let moved = false
    const move = (next: PointerEvent) => {
      const by = next.clientX - startX
      if (!moved && Math.abs(by) < 4) return
      if (!moved) {
        moved = true
        setPanning(true)
      }
      viewport.scrollLeft = startLeft - by
    }
    const stop = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
      setPanning(false)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
  }
  return { panning, onPointerDown }
}

/** The "+" after the last day's column: adds a day at the end of the trip, up to 60. */
function AddDayButton() {
  const { page, refresh } = useTrip()
  const { trip } = page
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const full = trip.days >= MAX_TRIP_DAYS
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={full ? "A trip can have at most 60 days" : `Add Day ${trip.days + 1}`}
          disabled={busy || full}
          className="shrink-0"
          onClick={() =>
            void run(async () => {
              await addTripDay(trip.id, trip.days)
              await refresh()
            })
          }
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{full ? "A trip can have at most 60 days" : "Add a day"}</TooltipContent>
    </Tooltip>
  )
}
