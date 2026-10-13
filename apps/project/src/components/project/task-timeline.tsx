import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, HourglassIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import type { TaskCard } from "@/lib/api/project/tasks"
import { plural } from "@/lib/format/plural"
import { todayKey } from "@/lib/project/dates"
import { addDays, dayLabel, dayRangeLabel, daysBetween, weekdayOf } from "@/lib/project/days"
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/project/rules"
import { byPosition } from "@/lib/project/task-order"
import { cn } from "@/lib/utils"

/** One day's width, and how many days show at once: six weeks. */
const DAY_PX = 32
const WINDOW_DAYS = 42
/** How far the arrows move: two weeks. */
const STEP_DAYS = 14
/** The task names down the left. */
const TITLE_PX = 200

/** A bar in its status colour, the same as the Calendar's chips. Never the colour alone: the bar says its status. */
const STATUS_BAR: Record<TaskStatus, string> = {
  todo: "border bg-card text-foreground",
  doing: "border border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  stuck: "border border-destructive/40 bg-destructive/10 text-destructive",
  done: "border bg-muted text-muted-foreground line-through",
}

export type TimelineGroup = { key: string; label: string }

/** What a drag is changing, and by how many days so far. */
type Drag = { taskId: string; end: "start" | "due" | "both"; fromX: number; days: number }

/** The Monday on or before a day. */
function mondayOf(day: string) {
  return addDays(day, -((weekdayOf(day) + 6) % 7))
}

/**
 * A task's first and last day on the timeline. Only a task with both a start
 * day and a due date has a bar (Tyler, 13 Oct 2026); one with either missing
 * stays off it.
 */
function spanOf(task: TaskCard) {
  return task.startDate && task.dueDate ? { first: task.startDate, last: task.dueDate } : null
}

/**
 * A project's Timeline tab: each task with both a start day and a due date as
 * a bar from one to the other, six weeks at a time, under the project's
 * sections. Dragging a bar's left end moves its start day, its right end its
 * due date, and its middle both, the same saves as picking the dates on the
 * task. Clicking a bar opens the task. Tasks waiting on others carry the same
 * Waiting mark as on the List; there are no arrows (Tyler, 13 Oct 2026). The
 * filters above apply. On a phone the timeline scrolls sideways inside its
 * panel. See `workspace/docs/projects-and-tasks.md`, "The Timeline tab".
 */
export function TaskTimeline({
  tasks,
  groups,
  groupOf,
  readOnly,
  onOpenTask,
  onDates,
}: {
  tasks: TaskCard[]
  /** The project's sections, in order, with "No section" last; left out, one plain list. */
  groups?: TimelineGroup[]
  groupOf: (task: TaskCard) => string
  readOnly: boolean
  onOpenTask: (taskId: string) => void
  /** Saves the dates that changed. */
  onDates: (task: TaskCard, dates: { startDate?: string | null; dueDate?: string | null }) => void
}) {
  const [today] = React.useState(() => todayKey())
  const [first, setFirst] = React.useState(() => mondayOf(addDays(today, -7)))
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const last = addDays(first, WINDOW_DAYS - 1)
  const days = React.useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, index) => addDays(first, index)), [first])

  const dated = React.useMemo(() => [...tasks].sort(byPosition).filter((task) => spanOf(task)), [tasks])
  const undated = tasks.length - dated.length
  const sections = (groups ?? [{ key: "", label: "" }])
    .map((group) => ({ ...group, tasks: groups ? dated.filter((task) => groupOf(task) === group.key) : dated }))
    .filter((group) => group.tasks.length > 0)

  /** The span a drag would leave, shown while dragging and saved on release. */
  function moved(span: { first: string; last: string }, change: Drag) {
    if (change.end === "start") {
      const start = addDays(span.first, change.days)
      return { first: start > span.last ? span.last : start, last: span.last }
    }
    if (change.end === "due") {
      const due = addDays(span.last, change.days)
      return { first: span.first, last: due < span.first ? span.first : due }
    }
    return { first: addDays(span.first, change.days), last: addDays(span.last, change.days) }
  }

  function release(task: TaskCard) {
    const span = spanOf(task)
    const change = drag
    setDrag(null)
    if (!span || !change) return
    if (change.days === 0) {
      // A press without a drag is a click.
      if (change.end === "both") onOpenTask(task.id)
      return
    }
    const next = moved(span, change)
    if (change.end === "start") onDates(task, { startDate: next.first })
    else if (change.end === "due") onDates(task, { dueDate: next.last })
    else {
      onDates(task, { startDate: next.first, dueDate: next.last })
    }
  }

  function press(event: React.PointerEvent, task: TaskCard, end: Drag["end"]) {
    if (readOnly || event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ taskId: task.id, end, fromX: event.clientX, days: 0 })
  }

  function follow(event: React.PointerEvent) {
    if (!drag) return
    const days = Math.round((event.clientX - drag.fromX) / DAY_PX)
    if (days !== drag.days) setDrag({ ...drag, days })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium max-sm:basis-full">
          {dayRangeLabel(first, last)}
        </h2>
        {undated ? (
          <span className="text-sm text-muted-foreground">
            {undated} {plural(undated, "task")} without both dates
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Two weeks earlier"
          onClick={() => setFirst(addDays(first, -STEP_DAYS))}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Two weeks later"
          onClick={() => setFirst(addDays(first, STEP_DAYS))}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
        <Button type="button" variant="outline" onClick={() => setFirst(mondayOf(addDays(today, -7)))}>
          Today
        </Button>
      </div>
      {dated.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No task has both a start day and a due date yet. Give one both and it shows here as a bar.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
          <div className="relative" style={{ width: TITLE_PX + WINDOW_DAYS * DAY_PX }}>
            {/* The days, with weekends shaded and today marked, behind every row. */}
            <div aria-hidden className="pointer-events-none absolute inset-y-0 flex" style={{ left: TITLE_PX }}>
              {days.map((day) => (
                <span
                  key={day}
                  className={cn(
                    "h-full border-l",
                    (weekdayOf(day) === 0 || weekdayOf(day) === 6) && "bg-muted/50",
                    day === today && "bg-primary/10"
                  )}
                  style={{ width: DAY_PX }}
                />
              ))}
            </div>
            <div className="sticky top-0 z-20 flex border-b bg-background">
              <span className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: TITLE_PX }} />
              {days.map((day) => (
                <span
                  key={day}
                  aria-hidden
                  className={cn(
                    "flex shrink-0 flex-col items-center py-1 text-[11px] leading-tight text-muted-foreground",
                    day === today && "font-semibold text-foreground"
                  )}
                  style={{ width: DAY_PX }}
                >
                  <span>{day.slice(8) === "01" || day === first ? dayLabel(day).split(" ")[0] : "\u00a0"}</span>
                  <span>{Number(day.slice(8))}</span>
                </span>
              ))}
            </div>
            {sections.map((section) => (
              <section key={section.key} aria-label={section.label || "Tasks"} className="relative">
                {groups ? (
                  <div
                    className="sticky left-0 z-10 bg-background px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground"
                    style={{ width: TITLE_PX }}
                  >
                    {section.label}
                  </div>
                ) : null}
                <ul>
                  {section.tasks.map((task) => {
                    const span = spanOf(task)!
                    const shown = drag?.taskId === task.id ? moved(span, drag) : span
                    const from = daysBetween(first, shown.first)
                    const to = daysBetween(first, shown.last)
                    const inView = to >= 0 && from < WINDOW_DAYS
                    const left = Math.max(from, 0)
                    const width = Math.min(to, WINDOW_DAYS - 1) - left + 1
                    const dates = dayRangeLabel(shown.first, shown.last)
                    const waiting = task.waitingOn && !task.waitingOn.ready
                    return (
                      <li key={task.id} className="relative flex h-9 items-center">
                        <span
                          className="sticky left-0 z-10 flex h-full shrink-0 items-center gap-1.5 bg-background px-3 text-sm"
                          style={{ width: TITLE_PX }}
                        >
                          {waiting ? (
                            <HourglassIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Waiting on another task" />
                          ) : null}
                          <button
                            type="button"
                            className="min-w-0 truncate text-left hover:underline focus-visible:underline focus-visible:outline-none"
                            onClick={() => onOpenTask(task.id)}
                          >
                            {task.title}
                          </button>
                        </span>
                        {inView ? (
                          <button
                            type="button"
                            aria-label={`${task.title}: ${TASK_STATUS_LABEL[task.status]}, ${dates}. Open the task`}
                            title={`${task.title}, ${dates}`}
                            className={cn(
                              "absolute flex h-7 items-center gap-1 overflow-hidden rounded-md px-1.5 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                              STATUS_BAR[task.status],
                              !readOnly && "cursor-grab touch-none",
                              drag?.taskId === task.id && "cursor-grabbing shadow-md"
                            )}
                            style={{ left: TITLE_PX + left * DAY_PX + 2, width: width * DAY_PX - 4 }}
                            onPointerDown={(event) => press(event, task, "both")}
                            onPointerMove={follow}
                            onPointerUp={() => release(task)}
                            onPointerCancel={() => setDrag(null)}
                            onClick={(event) => {
                              // Pointer presses are handled on release; this is the keyboard's Enter or Space.
                              if (event.detail === 0) onOpenTask(task.id)
                            }}
                          >
                            {readOnly ? null : (
                              <>
                                <span
                                  aria-hidden
                                  className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                                  onPointerDown={(event) => press(event, task, "start")}
                                  onPointerMove={follow}
                                  onPointerUp={(event) => {
                                    event.stopPropagation()
                                    release(task)
                                  }}
                                />
                                <span
                                  aria-hidden
                                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
                                  onPointerDown={(event) => press(event, task, "due")}
                                  onPointerMove={follow}
                                  onPointerUp={(event) => {
                                    event.stopPropagation()
                                    release(task)
                                  }}
                                />
                              </>
                            )}
                            {task.status === "stuck" ? <CircleAlertIcon className="size-3 shrink-0" aria-hidden /> : null}
                            {/* A one-day bar has no room for words; its label and the task's name say them. */}
                            {width > 1 ? (
                              <span className="truncate">
                                {TASK_STATUS_LABEL[task.status]}
                                {task.assignee ? ` · ${task.assignee.name}` : ""}
                              </span>
                            ) : null}
                          </button>
                        ) : (
                          <span
                            className={cn(
                              "absolute text-xs text-muted-foreground",
                              to < 0 ? "text-left" : "text-right"
                            )}
                            style={to < 0 ? { left: TITLE_PX + 4 } : { right: 4 }}
                          >
                            {to < 0 ? `← ${dates}` : `${dates} →`}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  )
}
