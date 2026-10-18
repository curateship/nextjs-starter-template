import * as React from "react"
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { ChevronLeftIcon, ChevronRightIcon, FeatherIcon } from "lucide-react"

import { moveCalendarDay, SCHEDULE_STATUS } from "@/components/fitness/program/calendar-actions"
import { useCalendarVersion } from "@/components/fitness/program/calendar-version"
import { PanelBody, PanelEmpty, PanelToolbar } from "@/components/fitness/dashboard/panel-parts"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { loadProgramCalendar, type CalendarDay } from "@/lib/api/fitness/programs"
import { addDays, formatDay, weekStart, WEEKDAY_LABELS, type Day } from "@/lib/fitness/dates"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { cn } from "@/lib/utils"

const MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" })

/** Monday-first weekday names for the grid's heading row. */
const GRID_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0].map((index) => WEEKDAY_LABELS[index])

/**
 * The Calendar view in a program's middle panel: the program's week repeated
 * on every week of the month. A planned date can be
 * dragged to another date; a click picks it, and the right panel shows it to
 * start, open or move. The grid becomes a list when the panel is narrow,
 * whatever the window's width.
 */
export function ProgramCalendar({
  programId,
  today,
  hasPlan,
  pickedId,
  onPick,
}: {
  programId: string
  today: Day
  hasPlan: boolean
  pickedId: string | undefined
  onPick: (scheduledId: string) => void
}) {
  const [month, setMonth] = React.useState(() => today.slice(0, 7))
  const [loaded, setLoaded] = React.useState<{ key: string; days: CalendarDay[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [retryAt, setRetryAt] = React.useState(0)
  const version = useCalendarVersion()

  const first = `${month}-01`
  const gridStart = weekStart(first)
  const gridEnd = addDays(gridStart, 41)
  const key = `${programId}:${gridStart}`

  React.useEffect(() => {
    let live = true
    loadProgramCalendar(programId, gridStart, gridEnd).then(
      (result) => {
        if (!live) return
        setLoaded({ key, days: result.days })
        setError(null)
      },
      (failure: unknown) => {
        if (live) setError(getFitnessErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [programId, gridStart, gridEnd, key, version, retryAt])

  // A month or program still loading shows the loading row, not last month's days.
  const days = loaded && loaded.key === key ? loaded.days : null
  const byDay = React.useMemo(() => new Map((days ?? []).map((entry) => [entry.day, entry])), [days])
  const dndId = React.useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  )

  function onDragEnd(event: DragEndEvent) {
    const entry = days?.find((candidate) => candidate.id === event.active.id)
    const target = event.over?.id
    if (!entry || typeof target !== "string") return
    void moveCalendarDay(entry, target)
  }

  function shiftMonth(by: number) {
    const [year, monthIndex] = month.split("-").map(Number)
    const next = new Date(Date.UTC(year, monthIndex - 1 + by, 1))
    setMonth(next.toISOString().slice(0, 7))
  }

  const monthDays = (days ?? []).filter((entry) => entry.day.startsWith(month))
  const grid = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))

  return (
    <>
      <PanelToolbar>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
              <ChevronLeftIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous month</TooltipContent>
        </Tooltip>
        <h2 className="min-w-32 text-center text-sm font-medium" aria-live="polite">
          {MONTH.format(new Date(`${first}T00:00:00Z`))}
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Next month" onClick={() => shiftMonth(1)}>
              <ChevronRightIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next month</TooltipContent>
        </Tooltip>
        <Button type="button" variant="outline" className="ml-auto" onClick={() => setMonth(today.slice(0, 7))}>
          Today
        </Button>
      </PanelToolbar>
      {!hasPlan ? (
        <PanelEmpty>Every day of the week is a rest day. Make a weekday a workout on the Day view, and it repeats here every week.</PanelEmpty>
      ) : error ? (
        <ErrorRow className="min-h-32" message={error} onRetry={() => setRetryAt(Date.now())} />
      ) : days === null ? (
        <LoadingRow label="Loading the calendar" className="min-h-32" />
      ) : (
        <PanelBody padded={false}>
          <div className="@container">
            <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>
              <div className="hidden @lg:block">
                <div className="grid grid-cols-7 border-b text-xs text-muted-foreground">
                  {GRID_WEEKDAYS.map((label) => (
                    <div key={label} className="px-2 py-1.5">
                      {label}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {grid.map((day) => (
                    <CalendarCell
                      key={day}
                      day={day}
                      today={today}
                      inMonth={day.startsWith(month)}
                      entry={byDay.get(day) ?? null}
                      pickedId={pickedId}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
            </DndContext>
            <ul className="divide-y @lg:hidden">
              {monthDays.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">Nothing planned this month.</li>
              ) : (
                monthDays.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      aria-current={entry.id === pickedId ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                        entry.id === pickedId && "bg-muted"
                      )}
                      onClick={() => onPick(entry.id)}
                    >
                      <span className={cn("w-24 shrink-0 text-xs", entry.day === today && "font-semibold")}>
                        {formatDay(entry.day)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{entry.dayName}</span>
                      <StatusWords entry={entry} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </PanelBody>
      )}
    </>
  )
}

function StatusWords({ entry }: { entry: CalendarDay }) {
  const status = SCHEDULE_STATUS[entry.status]
  const Icon = status.icon
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      {entry.lightWeek ? (
        <span className="flex items-center gap-0.5">
          <FeatherIcon className="size-3" />
          Light
        </span>
      ) : null}
      <Icon className="size-3" />
      {status.label}
    </span>
  )
}

function CalendarCell({
  day,
  today,
  inMonth,
  entry,
  pickedId,
  onPick,
}: {
  day: Day
  today: Day
  inMonth: boolean
  entry: CalendarDay | null
  pickedId: string | undefined
  onPick: (scheduledId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-20 border-r border-b p-1 [&:nth-child(7n)]:border-r-0",
        !inMonth && "bg-muted/40 text-muted-foreground",
        isOver && "bg-primary/10"
      )}
    >
      <div
        className={cn(
          "mb-1 flex size-6 items-center justify-center rounded-full text-xs",
          day === today && "bg-primary font-semibold text-primary-foreground"
        )}
        aria-label={day === today ? "Today" : undefined}
      >
        {Number(day.slice(8))}
      </div>
      {entry ? <CalendarEntry entry={entry} picked={entry.id === pickedId} onPick={onPick} /> : null}
    </div>
  )
}

function CalendarEntry({
  entry,
  picked,
  onPick,
}: {
  entry: CalendarDay
  picked: boolean
  onPick: (scheduledId: string) => void
}) {
  const movable = entry.status === "planned" || entry.status === "missed"
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    disabled: !movable,
  })
  const status = SCHEDULE_STATUS[entry.status]
  const Icon = status.icon
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-pressed={picked}
      aria-label={`${entry.dayName}, ${formatDay(entry.day)}, ${status.label}${entry.lightWeek ? ", light week" : ""}`}
      onClick={() => onPick(entry.id)}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        "relative z-10 flex w-full flex-col gap-0.5 rounded-md border bg-card px-1.5 py-1 text-left text-xs shadow-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        entry.status === "done" && "bg-primary/10",
        entry.status === "missed" && "border-dashed",
        entry.status === "paused" && "opacity-60",
        picked && "ring-2 ring-primary",
        isDragging && "z-20 opacity-80",
        movable && "cursor-grab"
      )}
    >
      <span className="truncate font-medium">{entry.dayName}</span>
      <span className="flex items-center gap-1 truncate text-muted-foreground">
        <Icon className="size-3 shrink-0" />
        {status.label}
        {entry.lightWeek ? (
          <>
            <FeatherIcon className="ml-1 size-3 shrink-0" />
            Light
          </>
        ) : null}
      </span>
    </button>
  )
}
