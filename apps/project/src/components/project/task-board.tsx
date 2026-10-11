import * as React from "react"
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CircleAlertIcon, FolderIcon, MessageSquareIcon, UndoIcon } from "lucide-react"

import {
  DueDate,
  LabelChip,
  PersonAvatar,
  PickedDaysBadge,
  RepeatMark,
  SnoozedBadge,
  StepsCount,
  WaitingBadge,
  WaitingOnBadge,
} from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import type { TaskCard } from "@/lib/api/project/tasks"
import { TASK_STATUSES, TASK_STATUS_LABEL, isTaskStatus, type TaskStatus } from "@/lib/project/rules"
import { todayKey } from "@/lib/project/dates"
import { splitRecentDone } from "@/lib/project/task-filters"
import { byPosition } from "@/lib/project/task-order"
import { cn } from "@/lib/utils"

/**
 * One column per status. A card drags up or down inside its column to set the
 * project's order, which everyone on it sees, and across to another column to
 * change its status, landing where it is let go. A click opens the task. The
 * Done column shows tasks finished in the last 14 days, with the rest behind
 * "Show older".
 *
 * While a card is held, a copy follows the pointer and the columns make room
 * for it wherever it is over, so it never jumps back to where it started.
 */
export function TaskBoard({
  tasks,
  readOnly,
  onOpenTask,
  onMove,
  onReorder,
}: {
  tasks: TaskCard[]
  readOnly: boolean
  onOpenTask: (taskId: string) => void
  /** The task, its new status, and the new column's tasks in their new order. */
  onMove: (task: TaskCard, status: TaskStatus, taskIds: string[]) => void
  /** The column's tasks in their new order. */
  onReorder: (taskIds: string[]) => void
}) {
  // A short drag threshold, so a click on a card still opens it.
  // No keyboard dragging: Enter on a card opens it, as a button should.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  // A fixed id, so the drag library names its hidden help text the same on the
  // server and in the browser. Without it the page fails to hydrate.
  const dndId = React.useId()
  const [showOlder, setShowOlder] = React.useState(false)
  const [today] = React.useState(() => new Date())

  const columns = React.useMemo(() => {
    const sorted = [...tasks].sort(byPosition)
    const done = splitRecentDone(
      sorted.filter((task) => task.status === "done"),
      today
    )
    return Object.fromEntries(
      TASK_STATUSES.map((status) => [
        status,
        status === "done"
          ? { shown: showOlder ? [...done.recent, ...done.older] : done.recent, hidden: showOlder ? 0 : done.older.length }
          : { shown: sorted.filter((task) => task.status === status), hidden: 0 },
      ])
    ) as Record<TaskStatus, { shown: TaskCard[]; hidden: number }>
  }, [today, showOlder, tasks])

  // Each column's cards while one is held, moved as it crosses columns. The
  // ref is what the drop reads, so a drop in the same instant as a crossing
  // still sees it before the screen has redrawn.
  const [held, setHeldState] = React.useState<Held | null>(null)
  const heldRef = React.useRef<Held | null>(null)
  function setHeld(next: Held | null) {
    heldRef.current = next
    setHeldState(next)
  }
  const byId = React.useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const heldTask = held ? byId.get(held.id) : undefined

  function handleDragStart(event: DragStartEvent) {
    setHeld({
      id: String(event.active.id),
      columns: Object.fromEntries(
        TASK_STATUSES.map((status) => [status, columns[status].shown.map((task) => task.id)])
      ) as Record<TaskStatus, string[]>,
    })
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    const current = heldRef.current
    if (!over || !current) return
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
    const state = heldRef.current
    setHeld(null)
    const task = byId.get(String(active.id))
    if (!state || !task || !over) return
    const status = columnOf(state.columns, active.id)
    if (!status) return
    let ids = state.columns[status]
    const from = ids.indexOf(task.id)
    const to = ids.indexOf(String(over.id))
    if (to >= 0 && to !== from) ids = arrayMove(ids, from, to)
    if (status !== task.status) {
      onMove(task, status, ids)
      return
    }
    const before = columns[status].shown.map((t) => t.id)
    if (ids.some((id, index) => id !== before[index])) onReorder(ids)
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setHeld(null)}
    >
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="flex h-full min-h-0 gap-3 p-3">
          {TASK_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={
                held
                  ? held.columns[status].flatMap((id) => byId.get(id) ?? [])
                  : columns[status].shown
              }
              hidden={columns[status].hidden}
              onShowOlder={() => setShowOlder(true)}
              readOnly={readOnly}
              onOpenTask={onOpenTask}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <DragOverlay>
        {heldTask ? (
          <div aria-hidden className={cn(CARD_CLASS, "cursor-grabbing shadow-lg")}>
            <CardContent task={heldTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

type Held = { id: string; columns: Record<TaskStatus, string[]> }

/** The column a card is in, or the column itself when the pointer is over its empty space. */
function columnOf(columns: Record<TaskStatus, string[]>, id: UniqueIdentifier) {
  if (isTaskStatus(id)) return id
  return TASK_STATUSES.find((status) => columns[status].includes(String(id))) ?? null
}

const CARD_CLASS = "grid w-full gap-2 rounded-lg border bg-card p-3 text-left text-sm shadow-xs"

function BoardColumn({
  status,
  tasks,
  hidden,
  onShowOlder,
  readOnly,
  onOpenTask,
}: {
  status: TaskStatus
  tasks: TaskCard[]
  /** Done tasks older than 14 days, not shown yet. */
  hidden: number
  onShowOlder: () => void
  readOnly: boolean
  onOpenTask: (taskId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: readOnly })
  const headingId = `board-column-${status}`
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/60 p-2",
        isOver && "ring-2 ring-ring"
      )}
    >
      <h3 id={headingId} className="flex items-center gap-2 px-1 text-sm font-medium">
        {status === "stuck" ? <CircleAlertIcon className="size-4 text-destructive" aria-hidden /> : null}
        {TASK_STATUS_LABEL[status]}
        <span className="text-muted-foreground">{tasks.length + hidden}</span>
      </h3>
      {tasks.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          {hidden ? "Nothing finished in the last 14 days" : "No tasks"}
        </p>
      ) : (
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              <BoardCard key={task.id} task={task} readOnly={readOnly} onOpen={() => onOpenTask(task.id)} />
            ))}
          </ul>
        </SortableContext>
      )}
      {hidden ? (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onShowOlder}>
          Show {hidden} older
        </Button>
      ) : null}
    </section>
  )
}

function BoardCard({
  task,
  readOnly,
  onOpen,
}: {
  task: TaskCard
  readOnly: boolean
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: readOnly,
  })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, transition }
    : undefined

  return (
    // The card stays in the column as a faint placeholder while its copy follows the pointer.
    <li ref={setNodeRef} style={style} className={cn(isDragging && "opacity-40")}>
      <button
        type="button"
        onClick={onOpen}
        {...listeners}
        {...attributes}
        // dnd-kit names the card a draggable; it is a button that opens the task.
        role="button"
        aria-roledescription={readOnly ? undefined : "draggable task"}
        className={cn(
          CARD_CLASS,
          "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        )}
      >
        <CardContent task={task} />
      </button>
    </li>
  )
}

function CardContent({ task }: { task: TaskCard }) {
  return (
    <>
      <span className="font-medium break-words">{task.title}</span>
      {task.section ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <FolderIcon className="size-3" aria-hidden />
          {task.section.name}
        </span>
      ) : null}
      {task.labels.length ? (
        <span className="flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </span>
      ) : null}
      {task.status === "stuck" && task.stuckReason ? (
        <span className="text-xs text-destructive">Stuck: {task.stuckReason}</span>
      ) : null}
      {task.handedBack ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <UndoIcon className="size-3" aria-hidden />
          Handed back by {task.handedBack.byName}
        </span>
      ) : null}
      {task.waitingOn || task.snoozedUntil ? (
        <span className="flex flex-wrap gap-1">
          <WaitingOnBadge waitingOn={task.waitingOn} />
          <SnoozedBadge until={task.snoozedUntil} today={todayKey()} />
        </span>
      ) : null}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {task.waiting ? <WaitingBadge /> : null}
        <RepeatMark repeat={task.repeat} />
        <PickedDaysBadge pickedDays={task.pickedDays} status={task.status} />
        <DueDate dueDate={task.dueDate} status={task.status} />
        <StepsCount steps={task.steps} />
        {task.commentCount ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <MessageSquareIcon className="size-3" aria-hidden />
            {task.commentCount}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {task.assignee ? (
          <>
            <PersonAvatar name={task.assignee.name} avatarUrl={task.assignee.avatarUrl} />
            {task.assignee.name}
          </>
        ) : task.formerAssigneeName ? (
          `Nobody (was ${task.formerAssigneeName})`
        ) : (
          "Nobody assigned"
        )}
      </span>
    </>
  )
}
