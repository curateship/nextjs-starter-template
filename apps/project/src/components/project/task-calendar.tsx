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
  type DragStartEvent,
} from "@dnd-kit/core"
import { ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, FlagIcon } from "lucide-react"

import { DayNumber, MonthGrid } from "@/components/project/month-grid"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Milestone } from "@/lib/api/project/projects"
import type { TaskCard } from "@/lib/api/project/tasks"
import { formatMonthAndYear } from "@/lib/format/format-time"
import { todayKey } from "@/lib/project/dates"
import { addDays, longDayLabel } from "@/lib/project/days"
import { dayCellClassName } from "@/lib/project/meetings"
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/project/rules"
import { byPosition } from "@/lib/project/task-order"
import { cn } from "@/lib/utils"

const NO_DATE = "no-date"
const DAY_PREFIX = "day:"

/**
 * A task's chip in its status colour. Never the colour alone: Stuck carries
 * its icon, Done is struck through and greyed, and every chip says its status
 * to a screen reader.
 */
const STATUS_CHIP: Record<TaskStatus, string> = {
  todo: "border bg-card text-foreground",
  doing: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  stuck: "bg-destructive/10 text-destructive",
  done: "bg-muted text-muted-foreground line-through",
}

/**
 * A project's Calendar tab: the month with each task on its due date, in its
 * status colour, and the tasks with no date in a list beside it. Dragging a
 * task to another day saves that day as its due date, the same change as
 * picking it on the task, so it sends the same notices; dropping it on "No
 * date" clears it. The filters above the tab apply. It reuses the Team
 * dashboard's month grid rather than drawing a second one. A project's
 * milestones mark their days with a flag and their name, above the tasks.
 */
export function TaskCalendar({
  tasks,
  milestones = [],
  readOnly,
  onOpenTask,
  onDueDate,
}: {
  tasks: TaskCard[]
  /** The project's milestones; My dashboard has none. */
  milestones?: Milestone[]
  readOnly: boolean
  onOpenTask: (taskId: string) => void
  /** Saves the new date, or null for none. */
  onDueDate: (task: TaskCard, dueDate: string | null) => void
}) {
  const [today] = React.useState(() => todayKey())
  const [month, setMonth] = React.useState(() => today.slice(0, 7))
  const [held, setHeld] = React.useState<TaskCard | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  // A fixed id, so the drag library's hidden help text matches on the server and in the browser.
  const dndId = React.useId()

  const { byDay, undated } = React.useMemo(() => {
    const days = new Map<string, TaskCard[]>()
    const none: TaskCard[] = []
    for (const task of [...tasks].sort(byPosition)) {
      if (!task.dueDate) none.push(task)
      else days.set(task.dueDate, [...(days.get(task.dueDate) ?? []), task])
    }
    return { byDay: days, undated: none }
  }, [tasks])
  const byId = React.useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const milestonesByDay = React.useMemo(() => {
    const days = new Map<string, Milestone[]>()
    for (const milestone of milestones) {
      if (milestone.dueDate) days.set(milestone.dueDate, [...(days.get(milestone.dueDate) ?? []), milestone])
    }
    return days
  }, [milestones])
  const [year, monthNumber] = month.split("-").map(Number)
  const inThisMonth = [...byDay.entries()]
    .filter(([day]) => day.startsWith(month))
    .reduce((sum, [, list]) => sum + list.length, 0)

  function handleDragStart(event: DragStartEvent) {
    setHeld(byId.get(String(event.active.id)) ?? null)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setHeld(null)
    const task = byId.get(String(active.id))
    if (!task || !over) return
    const target = String(over.id)
    const dueDate = target === NO_DATE ? null : target.slice(DAY_PREFIX.length)
    if (dueDate !== task.dueDate) onDueDate(task, dueDate)
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setHeld(null)}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h3 className="min-w-0 truncate text-sm font-medium">
          {formatMonthAndYear(year, monthNumber)}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {inThisMonth === 1 ? "1 task due" : `${inThisMonth} tasks due`}
          </span>
        </h3>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="ml-auto"
          aria-label="Previous month"
          onClick={() => setMonth(addDays(`${month}-01`, -1).slice(0, 7))}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next month"
          onClick={() => setMonth(addDays(`${month}-01`, 32).slice(0, 7))}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
        <Button type="button" variant="outline" onClick={() => setMonth(today.slice(0, 7))}>
          Today
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {/* Beside the month once the panel has room for both, under it before
            that, so the day squares stay wide enough to read a title. */}
        <div className="@container">
          <div className="grid @min-[52rem]:grid-cols-[minmax(0,1fr)_12rem]">
          <MonthGrid month={month}>
            {({ date, inMonth }) => (
              <DayCell
                key={date}
                date={date}
                today={today}
                inMonth={inMonth}
                tasks={inMonth ? (byDay.get(date) ?? []) : []}
                milestones={inMonth ? (milestonesByDay.get(date) ?? []) : []}
                readOnly={readOnly}
                onOpenTask={onOpenTask}
              />
            )}
          </MonthGrid>
            <NoDateList tasks={undated} readOnly={readOnly} onOpenTask={onOpenTask} />
          </div>
        </div>
      </ScrollArea>
      <DragOverlay>
        {held ? <ChipBody task={held} className="w-40 cursor-grabbing shadow-lg" /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function DayCell({
  date,
  today,
  inMonth,
  tasks,
  milestones,
  readOnly,
  onOpenTask,
}: {
  date: string
  today: string
  inMonth: boolean
  tasks: TaskCard[]
  milestones: Milestone[]
  readOnly: boolean
  onOpenTask: (taskId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DAY_PREFIX}${date}`, disabled: readOnly || !inMonth })
  const label = `${longDayLabel(date)}: ${tasks.length === 0 ? "nothing due" : tasks.length === 1 ? "1 task due" : `${tasks.length} tasks due`}${milestones.map((milestone) => `, milestone ${milestone.name}`).join("")}`
  return (
    <section
      ref={setNodeRef}
      aria-label={inMonth ? label : undefined}
      aria-hidden={inMonth ? undefined : true}
      className={cn(dayCellClassName(inMonth), isOver && "ring-2 ring-ring")}
    >
      <DayNumber date={date} today={today} />
      {milestones.map((milestone) => (
        <p
          key={milestone.id}
          aria-hidden
          className="flex w-full min-w-0 items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300"
        >
          <FlagIcon className="size-3 shrink-0" />
          <span className="truncate">{milestone.name}</span>
        </p>
      ))}
      {tasks.length ? (
        <ul className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
          {tasks.map((task) => (
            <li key={task.id} className="min-w-0">
              <TaskChip task={task} readOnly={readOnly} onOpen={() => onOpenTask(task.id)} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function NoDateList({
  tasks,
  readOnly,
  onOpenTask,
}: {
  tasks: TaskCard[]
  readOnly: boolean
  onOpenTask: (taskId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: NO_DATE, disabled: readOnly })
  return (
    <section
      ref={setNodeRef}
      aria-labelledby="calendar-no-date-heading"
      className={cn(
        "m-3 grid content-start gap-2 rounded-lg bg-muted/60 p-2 @max-[52rem]:mt-0 @min-[52rem]:ml-0",
        isOver && "ring-2 ring-ring"
      )}
    >
      <h3 id="calendar-no-date-heading" className="flex items-center gap-2 px-1 text-sm font-medium">
        No date
        <span className="text-muted-foreground">{tasks.length}</span>
      </h3>
      {tasks.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">Every task here has a due date.</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskChip task={task} readOnly={readOnly} onOpen={() => onOpenTask(task.id)} />
            </li>
          ))}
        </ul>
      )}
      {readOnly ? null : (
        <p className="px-1 text-xs text-muted-foreground">Drag a task onto a day to give it that date.</p>
      )}
    </section>
  )
}

function TaskChip({
  task,
  readOnly,
  onOpen,
}: {
  task: TaskCard
  readOnly: boolean
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: readOnly,
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onOpen}
      {...listeners}
      {...attributes}
      // dnd-kit names it a draggable; it is a button that opens the task.
      role="button"
      aria-roledescription={readOnly ? undefined : "draggable task"}
      className={cn(
        "block w-full rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        isDragging && "opacity-40"
      )}
    >
      <ChipBody task={task} />
    </button>
  )
}

function ChipBody({ task, className }: { task: TaskCard; className?: string }) {
  return (
    <span
      title={`${task.title} · ${TASK_STATUS_LABEL[task.status]}`}
      className={cn(
        "flex w-full min-w-0 items-start gap-1 rounded px-1 py-0.5 text-left text-xs leading-snug hover:brightness-95",
        STATUS_CHIP[task.status],
        className
      )}
    >
      {task.status === "stuck" ? <CircleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden /> : null}
      {/* Two lines before "…", since a day square is narrow. */}
      <span className="line-clamp-2 min-w-0 break-words">{task.title}</span>
      <span className="sr-only">, {TASK_STATUS_LABEL[task.status]}</span>
    </span>
  )
}
