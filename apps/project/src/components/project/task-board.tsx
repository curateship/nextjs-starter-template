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
import {
  ChevronRightIcon,
  CircleAlertIcon,
  FolderIcon,
  MessageSquareIcon,
  TriangleAlertIcon,
  UndoIcon,
} from "lucide-react"

import {
  DueDate,
  DueMovesMark,
  LabelChip,
  PersonAvatar,
  PickedDaysBadge,
  PriorityMark,
  RepeatMark,
  ReviewBadge,
  SnoozedBadge,
  StepsCount,
  WaitingBadge,
  WaitingOnBadge,
  TypeChip,
} from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import type { TaskCard } from "@/lib/api/project/tasks"
import { plural } from "@/lib/format/plural"
import { TASK_STATUSES, TASK_STATUS_LABEL, isTaskStatus, type TaskStatus } from "@/lib/project/rules"
import { todayKey } from "@/lib/project/dates"
import type { DoingWarning } from "@/lib/project/doing-limit"
import { splitRecentDone } from "@/lib/project/task-filters"
import { byPosition } from "@/lib/project/task-order"
import { cn } from "@/lib/utils"

/** A row of the Board: everyone's tasks, or one person's when grouped. */
export type BoardLane = {
  /** A person's id, `NOBODY_LANE`, or `ALL_LANE` when the Board isn't grouped. */
  id: string
  name: string
  avatarUrl?: string
}

export const ALL_LANE = "all"
export const NOBODY_LANE = "nobody"

/**
 * One column per status. A card drags up or down inside its column to set the
 * project's order, which everyone on it sees, and across to another column to
 * change its status, landing where it is let go. A click opens the task. The
 * Done column shows tasks finished in the last 14 days, with the rest behind
 * "Show older".
 *
 * Grouped by person, each member gets a row of the four columns, plus
 * "Nobody assigned", so who is stuck and who is idle shows at once. Dragging
 * within a row is the same as above; dragging to another row asks the screen
 * to hand the task over, which asks first. Rows fold.
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
  onHandOver,
  lanes,
  doingWarnings = [],
}: {
  tasks: TaskCard[]
  readOnly: boolean
  /** Grouped by person: a row per person, in this order. Left out, one row. */
  lanes?: BoardLane[]
  /** "Leo has 4 in Doing (limit 3)", under the Doing column's heading or in Leo's row. */
  doingWarnings?: DoingWarning[]
  onOpenTask: (taskId: string) => void
  /** The task, its new status, and the new column's tasks in their new order. */
  onMove: (task: TaskCard, status: TaskStatus, taskIds: string[]) => void
  /** The column's tasks in their new order. */
  onReorder: (taskIds: string[]) => void
  /** Dropped in another person's row: hand it to them (null for nobody), into this column. */
  onHandOver?: (task: TaskCard, personId: string | null, status: TaskStatus, taskIds: string[]) => void
}) {
  // A short drag threshold, so a click on a card still opens it.
  // No keyboard dragging: Enter on a card opens it, as a button should.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  // A fixed id, so the drag library names its hidden help text the same on the
  // server and in the browser. Without it the page fails to hydrate.
  const dndId = React.useId()
  const [showOlder, setShowOlder] = React.useState(false)
  const [folded, setFolded] = React.useState<ReadonlySet<string>>(() => new Set())
  const [today] = React.useState(() => new Date())
  const rows = React.useMemo(() => lanes ?? [{ id: ALL_LANE, name: "" }], [lanes])
  const grouped = Boolean(lanes)

  const columns = React.useMemo(() => {
    const sorted = [...tasks].sort(byPosition)
    const result: Record<string, { shown: TaskCard[]; hidden: number }> = {}
    for (const lane of rows) {
      const mine = grouped ? sorted.filter((task) => laneOf(task) === lane.id) : sorted
      const done = splitRecentDone(
        mine.filter((task) => task.status === "done"),
        today
      )
      for (const status of TASK_STATUSES) {
        result[columnKey(lane.id, status)] =
          status === "done"
            ? {
                shown: showOlder ? [...done.recent, ...done.older] : done.recent,
                hidden: showOlder ? 0 : done.older.length,
              }
            : { shown: mine.filter((task) => task.status === status), hidden: 0 }
      }
    }
    return result
  }, [grouped, rows, today, showOlder, tasks])

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
        Object.entries(columns).map(([key, column]) => [key, column.shown.map((task) => task.id)])
      ),
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
    const key = columnOf(state.columns, active.id)
    if (!key) return
    const { lane, status } = splitKey(key)
    let ids = state.columns[key]
    const from = ids.indexOf(task.id)
    const to = ids.indexOf(String(over.id))
    if (to >= 0 && to !== from) ids = arrayMove(ids, from, to)
    if (grouped && lane !== laneOf(task)) {
      onHandOver?.(task, lane === NOBODY_LANE ? null : lane, status, ids)
      return
    }
    if (status !== task.status) {
      onMove(task, status, ids)
      return
    }
    const before = columns[key].shown.map((t) => t.id)
    if (ids.some((id, index) => id !== before[index])) onReorder(ids)
  }

  function toggleFold(laneId: string) {
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(laneId)) next.delete(laneId)
      else next.add(laneId)
      return next
    })
  }

  const columnsOf = (laneId: string) =>
    TASK_STATUSES.map((status) => {
      const key = columnKey(laneId, status)
      return (
        <BoardColumn
          key={key}
          id={key}
          status={status}
          tasks={held ? held.columns[key].flatMap((id) => byId.get(id) ?? []) : columns[key].shown}
          hidden={columns[key].hidden}
          warnings={
            status === "doing" && !grouped ? doingWarnings.map((warning) => warning.text) : []
          }
          onShowOlder={() => setShowOlder(true)}
          readOnly={readOnly}
          onOpenTask={onOpenTask}
          compact={grouped}
        />
      )
    })

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
        {grouped ? (
          // As wide as a row's four columns, so each row's frame runs past the panel's edge with them.
          <div className="grid w-max min-w-full gap-3 p-3">
            {rows.map((lane) => (
              <LaneRow
                key={lane.id}
                lane={lane}
                counts={laneCounts(tasks.filter((task) => laneOf(task) === lane.id))}
                warning={doingWarnings.find((warning) => warning.personId === lane.id)?.text}
                open={!folded.has(lane.id)}
                onToggle={() => toggleFold(lane.id)}
              >
                {columnsOf(lane.id)}
              </LaneRow>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-0 gap-3 p-3">{columnsOf(ALL_LANE)}</div>
        )}
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

type Held = { id: string; columns: Record<string, string[]> }

const KEY_SEPARATOR = "::"
const columnKey = (lane: string, status: TaskStatus) => `${lane}${KEY_SEPARATOR}${status}`
function splitKey(key: string): { lane: string; status: TaskStatus } {
  const at = key.lastIndexOf(KEY_SEPARATOR)
  const status = key.slice(at + KEY_SEPARATOR.length)
  return { lane: key.slice(0, at), status: isTaskStatus(status) ? status : "todo" }
}

/** The row a task sits in when grouped: its person's, or "Nobody assigned". */
function laneOf(task: TaskCard) {
  return task.assignee?.id ?? NOBODY_LANE
}

/** The column a card is in, or the column itself when the pointer is over its empty space. */
function columnOf(columns: Record<string, string[]>, id: UniqueIdentifier) {
  const key = String(id)
  if (key in columns) return key
  return Object.keys(columns).find((column) => columns[column].includes(key)) ?? null
}

/** "2 Doing · 1 Stuck", the row's summary while folded and beside its name. */
function laneCounts(tasks: TaskCard[]) {
  const open = tasks.filter((task) => task.status !== "done")
  const doing = open.filter((task) => task.status === "doing").length
  const stuck = open.filter((task) => task.status === "stuck").length
  if (open.length === 0) return "Nothing open"
  return [
    `${open.length} open`,
    doing ? `${doing} Doing` : "nothing in Doing",
    stuck ? `${stuck} Stuck` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** One person's row: their name and counts, then the four columns, folding shut on its header. */
function LaneRow({
  lane,
  counts,
  warning,
  open,
  onToggle,
  children,
}: {
  lane: BoardLane
  counts: string
  warning: string | undefined
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const bodyId = `board-lane-${lane.id}`
  return (
    <section aria-label={lane.name} className="grid gap-2 rounded-lg border p-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRightIcon
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          aria-hidden
        />
        {lane.id === NOBODY_LANE ? null : <PersonAvatar name={lane.name} avatarUrl={lane.avatarUrl} />}
        <span className="truncate font-medium">{lane.name}</span>
        <span className="truncate text-muted-foreground">{counts}</span>
      </button>
      {warning ? (
        <p className="flex items-start gap-1.5 px-1 text-xs text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
          {warning}
        </p>
      ) : null}
      {open ? (
        <div id={bodyId} className="flex gap-3">
          {children}
        </div>
      ) : null}
    </section>
  )
}

const CARD_CLASS = "grid w-full gap-2 rounded-lg border bg-card p-3 text-left text-sm shadow-xs"

function BoardColumn({
  id,
  status,
  tasks,
  hidden,
  warnings,
  onShowOlder,
  readOnly,
  onOpenTask,
  compact,
}: {
  /** The column's drop id: its row and status. */
  id: string
  status: TaskStatus
  tasks: TaskCard[]
  /** Done tasks older than 14 days, not shown yet. */
  hidden: number
  /** People over the project's Doing limit. A warning only: nothing is blocked. */
  warnings: string[]
  onShowOlder: () => void
  readOnly: boolean
  onOpenTask: (taskId: string) => void
  /** In a person's row: no full height to fill. */
  compact: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: readOnly })
  const headingId = `board-column-${id.replace(/[^\w-]/g, "-")}`
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/60 p-2",
        compact && "min-h-16",
        isOver && "ring-2 ring-ring"
      )}
    >
      <h3 id={headingId} className="flex items-center gap-2 px-1 text-sm font-medium">
        {status === "stuck" ? <CircleAlertIcon className="size-4 text-destructive" aria-hidden /> : null}
        {TASK_STATUS_LABEL[status]}
        <span className="text-muted-foreground">{tasks.length + hidden}</span>
      </h3>
      {warnings.length ? (
        <ul className="grid gap-1 px-1" aria-label="Over the Doing limit">
          {warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5 text-xs text-destructive">
              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
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
      <span className={cn("font-medium break-words", task.priority === "low" && "text-muted-foreground")}>
        {task.title}
      </span>
      {task.type || task.priority !== "normal" ? (
        <span className="flex flex-wrap items-center gap-1">
          <PriorityMark priority={task.priority} />
          <TypeChip type={task.type} />
        </span>
      ) : null}
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
        <ReviewBadge review={task.review} />
        <RepeatMark repeat={task.repeat} />
        <PickedDaysBadge pickedDays={task.pickedDays} status={task.status} />
        <DueDate dueDate={task.dueDate} status={task.status} />
        <DueMovesMark moves={task.dueMoves} status={task.status} />
        <StepsCount steps={task.steps} />
        {task.commentCount ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <MessageSquareIcon className="size-3" aria-hidden />
            {task.commentCount}
            <span className="sr-only">{plural(task.commentCount, "comment")}</span>
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
