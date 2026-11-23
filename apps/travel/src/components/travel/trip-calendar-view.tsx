import * as React from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { CalendarDaysIcon } from "lucide-react"

import { useBoardActions } from "@/components/travel/board-actions"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { useSaveTrip } from "@/components/travel/trip-budget-card"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { DatePicker } from "@/components/ui/date-picker"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Activity } from "@/lib/api/travel/trips"
import { boardColumns, formatTime } from "@/lib/travel/board"
import { DAY_PART_LABEL } from "@/lib/travel/rules"
import { addDays, daysBetween, lastDate, localDateToIso, todayIn, weekday } from "@/lib/travel/dates"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * The Calendar tab (task part 18): the trip's dates as weeks, each day
 * holding its activities by time. It needs a start date; a trip with none
 * says so, with a date picker right there that saves the start date (the
 * Trip settings window it used to open became the trip's ⋮ menu).
 *
 * A card drags onto another day of the trip (More Travel features part 10;
 * Tyler: "Keep time and part"): it keeps its start time and part of the day,
 * through the board's own move, with Undo. Days outside the trip take no drop.
 */
export function TripCalendarView({ activities }: { activities: Activity[] }) {
  const { page, typesById, readOnly } = useTrip()
  const { trip } = page
  const saveTrip = useSaveTrip()
  const actions = useBoardActions()
  const [held, setHeld] = React.useState<Activity | null>(null)
  // A drag starts after 8px, so a click still opens the card.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const dndId = React.useId()

  if (!trip.startDate) {
    return (
      <div className="grid flex-1 content-center justify-items-center gap-3 p-6 text-center">
        <CalendarDaysIcon className="size-5 text-muted-foreground" aria-hidden />
        <p className="max-w-64 text-sm text-muted-foreground">Add a start date to see the calendar.</p>
        {readOnly ? null : <DatePicker
          value={undefined}
          placeholder="Add a start date"
          onChange={(date) => (date ? void saveTrip({ startDate: localDateToIso(date) }) : undefined)}
        />}
      </div>
    )
  }

  const start = trip.startDate
  const end = lastDate(start, trip.days)!
  const gridStart = addDays(start, -weekday(start))
  const gridEnd = addDays(end, 6 - weekday(end))
  const cells = daysBetween(gridStart, gridEnd) + 1
  const columns = boardColumns(trip.days, activities)
  const today = todayIn(trip.timeZone)

  function handleDragEnd({ active, over }: DragEndEvent) {
    setHeld(null)
    const activity = activities.find((item) => item.id === active.id)
    const day = over ? Number(String(over.id).replace(DROP_PREFIX, "")) : NaN
    if (!activity || !Number.isInteger(day) || day < 1 || day > trip.days || day === activity.day) return
    void actions.moveTo(activity, day)
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      onDragStart={({ active }) => setHeld(activities.find((item) => item.id === active.id) ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setHeld(null)}
    >
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <div className="grid gap-px p-3">
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((name) => (
            <div key={name} className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {name}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
          {Array.from({ length: cells }, (_, index) => {
            const date = addDays(gridStart, index)
            const day = daysBetween(start, date) + 1
            const inTrip = day >= 1 && day <= trip.days
            const cards = inTrip ? (columns.get(`day-${day}`) ?? []) : []
            const [, month, dayOfMonth] = date.split("-").map(Number)
            return (
              <CalendarDay key={date} date={date} day={inTrip && !readOnly ? day : null} outside={!inTrip}>
                <div className="flex items-baseline gap-1.5 px-0.5 text-xs">
                  <span className={cn("font-medium", date === today && "rounded bg-foreground px-1 text-background")}>
                    {dayOfMonth === 1 || index === 0 ? `${dayOfMonth} ${MONTHS[month - 1]}` : dayOfMonth}
                  </span>
                  {inTrip ? <span className="text-muted-foreground">Day {day}</span> : null}
                </div>
                {cards.map((activity) => (
                  <CalendarCard key={activity.id} activity={activity} locked={readOnly} />
                ))}
              </CalendarDay>
            )
          })}
        </div>
      </div>
    </ScrollArea>
      <DragOverlay>
        {held ? (
          <div aria-hidden className="flex max-w-48 items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-xs shadow-lg">
            <ActivityTypeIcon type={typeOf(held, typesById)} className="size-3" />
            <span className="truncate">{held.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/** A day cell's drop id is the trip day after this, so it never meets a card's id. */
const DROP_PREFIX = "calendar-day|"

/** One date in the grid. A day of the trip takes a dropped card; a date outside it doesn't. */
function CalendarDay({
  date,
  day,
  outside,
  children,
}: {
  date: string
  /** The trip day a card dropped here moves to, or null when nothing may land here. */
  day: number | null
  outside: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DROP_PREFIX}${day ?? date}`, disabled: day === null })
  return (
    <div
      ref={setNodeRef}
      data-date={date}
      className={cn("grid min-h-28 content-start gap-1 bg-card p-1.5", outside && "bg-muted/40", isOver && "bg-accent/60")}
    >
      {children}
    </div>
  )
}

/** One activity in a day: opens on a click and drags to another day. */
function CalendarCard({ activity, locked }: { activity: Activity; locked: boolean }) {
  const { typesById, openActivity, openActivityId } = useTrip()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: activity.id, disabled: locked })
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => openActivity(activity.id)}
      {...listeners}
      {...attributes}
      aria-roledescription={locked ? undefined : "draggable activity"}
      aria-current={activity.id === openActivityId || undefined}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        activity.id === openActivityId && "bg-accent",
        activity.done && "text-muted-foreground line-through",
        isDragging && "opacity-40"
      )}
    >
      <ActivityTypeIcon type={typeOf(activity, typesById)} className="size-3" />
      {activity.startTime ? (
        <span className="shrink-0 text-muted-foreground tabular-nums">{formatTime(activity.startTime)}</span>
      ) : activity.dayPart ? (
        <span className="shrink-0 text-muted-foreground">{DAY_PART_LABEL[activity.dayPart]}</span>
      ) : null}
      <span className="truncate">{activity.title}</span>
    </button>
  )
}
