import * as React from "react"
import {
  closestCenter,
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
  type CollisionDetection,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ChevronRightIcon,
  CopyIcon,
  EllipsisIcon,
  HourglassIcon,
  ListChecksIcon,
  MessageSquareIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UndoIcon,
} from "lucide-react"

import {
  DueDate,
  LabelChip,
  PersonAvatar,
  PickedDaysBadge,
  PriorityMark,
  RepeatMark,
  ReviewBadge,
  SnoozedBadge,
  StatusDot,
  TintChip,
  WaitingBadge,
  UnreadBadge,
} from "@/components/project/task-bits"
import type { FieldColumn } from "@/components/project/task-list"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import type { TaskCard } from "@/lib/api/project/tasks"
import { plural } from "@/lib/format/plural"
import {
  DUE_MOVED_MANY,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  isTaskStatus,
  type TaskStatus,
  isOpenStatus,
} from "@/lib/project/rules"
import { dueDayOf, todayKey } from "@/lib/project/dates"
import type { DoingWarning } from "@/lib/project/doing-limit"
import { fieldValueText, visibleFieldIds, type FieldRule } from "@/lib/project/task-fields"
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

/** Duplicate and Delete on a card's "..." menu. */
export type CardActions = {
  onDuplicate: (task: TaskCard) => void
  onDelete: (task: TaskCard) => void
  /** Whoever made the task, and the team's owners and admins. */
  canDelete: (task: TaskCard) => boolean
}

/**
 * A column's "+": the screen wraps `button` in its New task dropdown, keyed so
 * only one opens, with `label` as its tooltip.
 */
export type AddTask = (
  key: string,
  status: TaskStatus,
  laneId: string,
  button: React.ReactNode,
  label: string
) => React.ReactNode

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
 *
 * A column drags left or right by its heading to set the order of the
 * columns (Tyler, 14 Oct 2026): on a project page the project's, which
 * everyone on it sees; on My dashboard my own. Grouped by person, moving a column in one row moves it in every row.
 *
 * Each column's "+" opens New task for that column (and that person's row),
 * and pointing at a card shows its "..." menu with Duplicate and Delete
 * (Tyler, 14 Oct 2026). Neither shows on an archived project.
 */
export function TaskBoard({
  tasks,
  openTaskId,
  readOnly,
  onOpenTask,
  onMove,
  onReorder,
  onHandOver,
  lanes,
  doingWarnings = [],
  addTask,
  cardActions,
  statusOrder = TASK_STATUSES,
  onStatusOrder,
  cardOrder = "project",
  showProject = false,
  cardFields,
}: {
  tasks: TaskCard[]
  /** The task open in the panel beside the Board, whose card is outlined. */
  openTaskId?: string
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
  addTask?: AddTask
  cardActions?: CardActions
  /** The columns, left to right. */
  statusOrder?: readonly TaskStatus[]
  /** A column dropped in a new place: the new order. Left out, columns don't drag. */
  onStatusOrder?: (order: TaskStatus[]) => void
  /**
   * "project": the project's own order, set by dragging up or down. "due": by
   * due date, soonest first, with no order of its own, for My dashboard, whose
   * cards come from several projects. Dragging across columns still works.
   */
  cardOrder?: "project" | "due"
  /** Names each card's project, for a Board of several projects. */
  showProject?: boolean
  /**
   * While the Board is filtered to one task type: the fields picked for the
   * List, drawn as lines on each card (Features 16 Oct, part 8), and the
   * type's fields, so one hidden by "shown only when" stays hidden.
   */
  cardFields?: CardFields
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
    const sorted = [...tasks].sort(cardOrder === "due" ? byDue : byPosition)
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
  }, [cardOrder, grouped, rows, today, showOlder, tasks])

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

  // Cards land on cards and columns; a column only on another column in its own row.
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const id = String(args.active.id)
    if (!isColumnDrag(id)) {
      return closestCorners({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => !isColumnDrag(String(c.id))),
      })
    }
    const lane = splitKey(id.slice(COLUMN_DRAG.length)).lane
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => isColumnDrag(String(c.id)) && splitKey(String(c.id).slice(COLUMN_DRAG.length)).lane === lane
      ),
    })
  }, [])

  function handleDragStart(event: DragStartEvent) {
    if (isColumnDrag(String(event.active.id))) return
    setHeld({
      id: String(event.active.id),
      columns: Object.fromEntries(
        Object.entries(columns).map(([key, column]) => [key, column.shown.map((task) => task.id)])
      ),
    })
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    const current = heldRef.current
    if (!over || !current || isColumnDrag(String(active.id))) return
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
    if (isColumnDrag(String(active.id))) {
      if (!over || !onStatusOrder) return
      const from = statusOrder.indexOf(splitKey(String(active.id).slice(COLUMN_DRAG.length)).status)
      const to = statusOrder.indexOf(splitKey(String(over.id).slice(COLUMN_DRAG.length)).status)
      if (from >= 0 && to >= 0 && from !== to) onStatusOrder(arrayMove([...statusOrder], from, to))
      return
    }
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
    if (cardOrder === "due") return
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

  const laneName = (laneId: string) => rows.find((lane) => lane.id === laneId)?.name ?? ""
  const columnsOf = (laneId: string) => (
    <SortableContext
      items={statusOrder.map((status) => COLUMN_DRAG + columnKey(laneId, status))}
      strategy={horizontalListSortingStrategy}
    >
      {statusOrder.map((status) => {
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
          openTaskId={openTaskId}
          compact={grouped}
          showProject={showProject}
          columnDrag={readOnly || !onStatusOrder ? null : COLUMN_DRAG + key}
          addButton={
            addTask
              ? (() => {
                  const label = `Add a task to ${TASK_STATUS_LABEL[status]}${grouped ? ` for ${laneName(laneId)}` : ""}`
                  return addTask(
                    key,
                    status,
                    laneId,
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
                      <PlusIcon className="size-4" />
                    </Button>,
                    label
                  )
                })()
              : null
          }
          cardActions={cardActions}
        />
      )
      })}
    </SortableContext>
  )

  return (
    <CardFieldsContext.Provider value={cardFields ?? null}>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
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
            <div className="flex min-h-0 items-start gap-3 p-3">{columnsOf(ALL_LANE)}</div>
          )}
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <DragOverlay>
          {heldTask ? (
            <div aria-hidden className={cn(CARD_CLASS, "cursor-grabbing shadow-lg")}>
              <CardContent task={heldTask} showProject={showProject} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </CardFieldsContext.Provider>
  )
}

type Held = { id: string; columns: Record<string, string[]> }

const KEY_SEPARATOR = "::"
/** A column's own drag id is its key after this, so it never meets a card's or a drop area's. */
const COLUMN_DRAG = "column-drag|"
const isColumnDrag = (id: string) => id.startsWith(COLUMN_DRAG)
const columnKey = (lane: string, status: TaskStatus) => `${lane}${KEY_SEPARATOR}${status}`
function splitKey(key: string): { lane: string; status: TaskStatus } {
  const at = key.lastIndexOf(KEY_SEPARATOR)
  const status = key.slice(at + KEY_SEPARATOR.length)
  return { lane: key.slice(0, at), status: isTaskStatus(status) ? status : "todo" }
}

/** Soonest due first, with no date last, then by title. */
function byDue(a: TaskCard, b: TaskCard) {
  const day = (task: TaskCard) => dueDayOf(task) ?? "9999-12-31"
  return day(a).localeCompare(day(b)) || a.title.localeCompare(b.title)
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
  const open = tasks.filter((task) => isOpenStatus(task.status))
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
  openTaskId,
  compact,
  showProject,
  columnDrag,
  addButton,
  cardActions,
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
  openTaskId: string | undefined
  /** In a person's row: a shorter empty column. */
  compact: boolean
  showProject: boolean
  /** The column's own drag id, dragged by its heading; null when columns don't move. */
  columnDrag: string | null
  /** The "+" with its New task dropdown, at the heading's right. */
  addButton?: React.ReactNode
  cardActions?: CardActions
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: readOnly })
  const sortable = useSortable({ id: columnDrag ?? `${id}-fixed`, disabled: !columnDrag })
  const headingId = `board-column-${id.replace(/[^\w-]/g, "-")}`
  return (
    <section
      // Right-clicking empty space here starts a New task in this column and row (project-tasks-panel.tsx).
      data-new-status={status}
      data-new-lane={splitKey(id).lane}
      ref={(node) => {
        setNodeRef(node)
        sortable.setNodeRef(node)
      }}
      aria-labelledby={headingId}
      style={
        sortable.transform
          ? { transform: `translate3d(${sortable.transform.x}px, 0, 0)`, transition: sortable.transition }
          : undefined
      }
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-muted/40 p-2",
        // As tall as its cards, with room under them to drop one into an empty column.
        compact ? "min-h-16" : "min-h-56",
        isOver && "ring-2 ring-ring",
        // The column being moved floats over the others as they make room.
        sortable.isDragging && "relative z-10 shadow-lg"
      )}
    >
      <div
        className={cn("flex min-h-7 items-center gap-2", columnDrag && "cursor-grab active:cursor-grabbing")}
        // The heading is the handle; the "+" inside it still clicks, since a drag starts only after 8px.
        {...(columnDrag ? sortable.listeners : {})}
        aria-roledescription={columnDrag ? "movable column" : undefined}
      >
        <h3 id={headingId} className="flex flex-1 items-center gap-2 px-1 text-sm font-medium">
          <StatusDot status={status} />
          {TASK_STATUS_LABEL[status]}
          <span className="text-muted-foreground">{tasks.length + hidden}</span>
        </h3>
        {addButton}
      </div>
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
              <BoardCard
                key={task.id}
                task={task}
                open={task.id === openTaskId}
                readOnly={readOnly}
                onOpen={() => onOpenTask(task.id)}
                actions={cardActions}
                showProject={showProject}
              />
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
  open,
  readOnly,
  onOpen,
  actions,
  showProject,
}: {
  task: TaskCard
  /** Open in the panel beside the Board: outlined in the text colour. */
  open: boolean
  readOnly: boolean
  onOpen: () => void
  actions?: CardActions
  showProject: boolean
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: readOnly,
  })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, transition }
    : undefined

  return (
    // The card stays in the column as a faint placeholder while its copy follows the pointer.
    <li ref={setNodeRef} style={style} data-task-id={task.id} className={cn("group/card relative", isDragging && "opacity-40")}>
      <button
        type="button"
        onClick={onOpen}
        {...listeners}
        {...attributes}
        // dnd-kit names the card a draggable; it is a button that opens the task.
        role="button"
        aria-roledescription={readOnly ? undefined : "draggable task"}
        aria-current={open || undefined}
        className={cn(
          CARD_CLASS,
          "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          open && "border-foreground ring-1 ring-foreground"
        )}
      >
        <CardContent task={task} roomForMenu={Boolean(actions)} showProject={showProject} />
      </button>
      {actions ? (
        // Beside the card's button rather than in it: a button can't hold another.
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`More for "${task.title}"`}
              className={cn(
                "absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                (menuOpen || isDragging) && "opacity-100"
              )}
            >
              <EllipsisIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => actions.onDuplicate(task)}>
              <CopyIcon className="size-4" />
              Duplicate
            </DropdownMenuItem>
            {actions.canDelete(task) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(task)}>
                  <Trash2Icon className="size-4" />
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  )
}

/**
 * A card as Tyler drew it on 13 Oct 2026: the title; the type and tags as
 * small tinted chips; any warning; then one line with the due
 * date, steps, messages and what it waits on, and the person at its end.
 */
function CardContent({
  task,
  roomForMenu = false,
  showProject = false,
}: {
  task: TaskCard
  roomForMenu?: boolean
  showProject?: boolean
}) {
  const chips = task.type || task.priority === "high" || task.labels.length
  const slipping = task.dueMoves >= DUE_MOVED_MANY && isOpenStatus(task.status)
  return (
    <>
      <span
        className={cn(
          "font-medium break-words",
          task.priority === "low" && "text-muted-foreground",
          // Clear of the "..." in the card's corner.
          roomForMenu && "pr-6"
        )}
      >
        {task.title}
      </span>
      {showProject ? <span className="-mt-1 truncate text-xs text-muted-foreground">{task.projectName}</span> : null}
      {chips ? (
        <span className="flex flex-wrap items-center gap-1">
          <PriorityMark priority={task.priority} />
          {task.type ? <TintChip color={task.type.color}>{task.type.name}</TintChip> : null}
          {task.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </span>
      ) : null}
      {slipping ? (
        <span className="flex">
          <TintChip color="amber">Date moved {task.dueMoves} times</TintChip>
        </span>
      ) : null}
      <FieldLines task={task} />
      {task.status === "stuck" && task.stuckReason ? (
        <span className="text-xs text-destructive">Stuck: {task.stuckReason}</span>
      ) : null}
      {task.handedBack ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <UndoIcon className="size-3" aria-hidden />
          Handed back by {task.handedBack.byName}
        </span>
      ) : null}
      {task.waiting || task.review.waiting || task.pickedDays || task.snoozedUntil ? (
        <span className="flex flex-wrap gap-1 empty:hidden">
          {task.waiting ? <WaitingBadge /> : null}
          <ReviewBadge review={task.review} />
          <PickedDaysBadge pickedDays={task.pickedDays} status={task.status} />
          <SnoozedBadge until={task.snoozedUntil} today={todayKey()} />
        </span>
      ) : null}
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          {task.dueDate ? <DueDate dueDate={task.dueDate} dueAt={task.dueAt} status={task.status} /> : null}
          {task.steps.total ? (
            <span className="flex items-center gap-1">
              <ListChecksIcon className="size-3" aria-hidden />
              {task.steps.done}/{task.steps.total}
              <span className="sr-only"> steps done</span>
            </span>
          ) : null}
          {task.commentCount ? (
            <span className="flex items-center gap-1">
              <MessageSquareIcon className="size-3" aria-hidden />
              {task.commentCount}
              <span className="sr-only">{plural(task.commentCount, "comment")}</span>
            </span>
          ) : null}
          <UnreadBadge count={task.unread} />
          <WaitingOnMark waitingOn={task.waitingOn} />
          <RepeatMark repeat={task.repeat} />
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {task.assignee ? (
            <>
              <PersonAvatar name={task.assignee.name} avatarUrl={task.assignee.avatarUrl} className="size-5" />
              <span className="max-w-24 truncate">{task.assignee.name}</span>
            </>
          ) : task.formerAssigneeName ? (
            <span className="max-w-32 truncate">Nobody (was {task.formerAssigneeName})</span>
          ) : (
            "Nobody"
          )}
        </span>
      </span>
    </>
  )
}

type CardFields = { columns: readonly FieldColumn[]; fields: readonly FieldRule[] }

const CardFieldsContext = React.createContext<CardFields | null>(null)

/**
 * "Platform: YouTube" under the chips, one line for each field picked for
 * the List, on cards of the type the Board is filtered to. An empty field,
 * and one hidden by "shown only when", draws nothing. A File field shows its
 * count, never the names. Phones leave the lines off, for room.
 */
function FieldLines({ task }: { task: TaskCard }) {
  const shown = React.useContext(CardFieldsContext)
  if (!shown?.columns.length || task.type?.id === undefined) return null
  const visible = visibleFieldIds(shown.fields, task.fieldValues)
  const lines = shown.columns.flatMap((spec) => {
    if (!visible.has(spec.field.id)) return []
    const text = fieldValueText(spec.field, task.fieldValues[spec.field.id], spec.people)
    return text ? [{ id: spec.field.id, name: spec.field.name, text }] : []
  })
  if (lines.length === 0) return null
  return (
    <span className="grid gap-0.5 text-xs max-sm:hidden">
      {lines.map((line) => (
        <span key={line.id} className="truncate">
          <span className="text-muted-foreground">{line.name}:</span> {line.text}
        </span>
      ))}
    </span>
  )
}

/** "Waiting" with an hourglass while a task it waits on is open, "Ready" once they're all Done. */
function WaitingOnMark({ waitingOn }: { waitingOn: TaskCard["waitingOn"] }) {
  if (!waitingOn) return null
  if (waitingOn.ready) {
    return (
      <span className="flex items-center gap-1">
        <PlayIcon className="size-3" aria-hidden />
        Ready
        <span className="sr-only"> to start</span>
      </span>
    )
  }
  const open = waitingOn.tasks.filter((task) => !task.done)
  return (
    <span className="flex items-center gap-1">
      <HourglassIcon className="size-3" aria-hidden />
      Waiting
      <span className="sr-only">
        {open.length === 1
          ? ` on ${open[0].title ?? "1 task in another project"}`
          : ` on ${open.length} tasks`}
      </span>
    </span>
  )
}
