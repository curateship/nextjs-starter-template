import * as React from "react"
import { createPortal } from "react-dom"
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { GripVerticalIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import {
  DueChip,
  DueMovesMark,
  HeldTaskGhost,
  PersonChip,
  PickedDaysBadge,
  PriorityChip,
  ProjectChip,
  ReviewBadge,
  SnoozedBadge,
  StatusBadge,
  StatusDot,
  UnreadBadge,
  WaitingBadge,
  WaitingOnBadge,
} from "@/components/project/task-bits"
import { HeadingAddButton, HeadingFoldButton } from "@/components/project/task-list-heading"
import { FOLDING_HEADING_CLASS, foldOnHeadingClick } from "@/lib/project/heading-fold"
import { TaskBulkMenu, type BulkTargets } from "@/components/project/task-bulk-bar"
import {
  AssigneeCellMenu,
  DueCellMenu,
  PriorityCellMenu,
  ProjectCellMenu,
  StatusCellMenu,
  type ProjectChoice,
} from "@/components/project/task-cell-menus"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { MassSelectButton } from "@/components/shared/mass-select"
import {
  Table,
  TableBody,
  TableCell,
  TableGroupRow,
  TableHead,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import type { TaskCard } from "@/lib/api/project/tasks"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { todayKey } from "@/lib/project/dates"
import { HEADING_DROP, type ListDrop } from "@/lib/project/list-drop"
import { TASK_STATUSES, priorityRank, type ProjectColor } from "@/lib/project/rules"
import type { TaskGroup } from "@/lib/project/task-groups"
import { byPosition } from "@/lib/project/task-order"
import { useFoldedHeadings } from "@/lib/project/use-folded-headings"
import { useListDrop } from "@/lib/project/use-list-drop"
import { cn } from "@/lib/utils"

/** "order" is the project's own order, set by dragging; the rest are columns. */
export type TaskColumn =
  | "order"
  | "title"
  | "project"
  | "status"
  | "priority"
  | "assignee"
  | "due"

/** The Project column's chip for a task, and the projects it can move to. */
export type ProjectColumn = {
  of: (task: TaskCard) => { name: string; color: ProjectColor }
  choices?: (task: TaskCard) => ProjectChoice[]
}

const STATUS_ORDER = Object.fromEntries(TASK_STATUSES.map((s, i) => [s, i]))
const NO_TARGETS: BulkTargets = { people: [], projects: [] }

function compare(
  a: TaskCard,
  b: TaskCard,
  column: TaskColumn,
  projectOf: (task: TaskCard) => string
) {
  switch (column) {
    case "project":
      return projectOf(a).localeCompare(projectOf(b))
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    case "priority":
      // High first when sorted up.
      return priorityRank(a.priority) - priorityRank(b.priority)
    case "assignee":
      return (a.assignee?.name ?? "~").localeCompare(b.assignee?.name ?? "~")
    case "due":
      // Tasks with no due date go last whichever way the column is sorted.
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
    case "order":
      return byPosition(a, b)
    default:
      return a.title.localeCompare(b.title)
  }
}

/**
 * Tasks as rows: the project page's List tab, and My dashboard. Rows sort by any
 * column, and ticked rows can be marked Done together.
 *
 * `groupsOf` puts the rows under headings, in `groups` order, from Filter's
 * Group row (`lib/project/task-groups.ts`). With `onDrop` rows drag up or down inside their heading to change the
 * order, or under another heading that `canMove` allows: on a project page
 * that changes what the row is grouped by, on My dashboard its date.
 *
 * The tick boxes and drag handles stay hidden until "Mass select" turns them
 * on (Tyler, 19 Oct 2026, and again 24 Oct 2026). It sits in the header left
 * of the search, in `selectedSlot` beside the "N selected" button (Tyler,
 * 5 Nov 2026: "Move the mass select button to here").
 *
 * Unless `readOnly`, a status dot before each title and the Status, Priority,
 * Assigned to and Due cells each open a dropdown that changes that one thing
 * (Tyler, 19 Oct 2026), from `task-cell-menus.tsx`.
 */
export function TaskList({
  tasks,
  readOnly,
  busy = false,
  onOpenTask,
  showProject = false,
  showAssignee = !showProject,
  emptyText = "No tasks yet.",
  groups,
  groupsOf,
  onRows,
  ordered = false,
  onDrop,
  canMove = sameHeading,
  showsEmpty,
  foldsKey,
  orderLabel = "the project's order",
  bulk = NO_TARGETS,
  selectedSlot,
  onDelete,
  canDelete,
  myUserId,
  addTask,
  projectColumn,
  massSelect,
  rowActions,
}: {
  tasks: TaskCard[]
  readOnly: boolean
  /** A reorder or status change is saving: rows wait to be dragged, so two drags save in order. */
  busy?: boolean
  onOpenTask: (task: TaskCard) => void
  showProject?: boolean
  /**
   * The Assigned to column. Left out, it shows only without the Project
   * column; the Team dashboard's Tasks tab shows both (Tyler, 7 Nov 2026).
   */
  showAssignee?: boolean
  emptyText?: React.ReactNode
  groups?: readonly TaskGroup[]
  groupsOf?: (task: TaskCard) => string[]
  /**
   * Told the tasks' ids in the order the rows show, headings and sort
   * included, each once, so a page can open the first row on arrival.
   */
  onRows?: (ids: string[]) => void
  /** The rows come in an order of their own, in `position`, which the first sort keeps. */
  ordered?: boolean
  /** A row let go inside its heading or under another (`lib/project/list-drop.ts`). Left out, rows don't drag. */
  onDrop?: (drop: ListDrop) => void
  /** Whether a task may be dropped under another heading; left out, rows only reorder. */
  canMove?: (from: string, to: string, task: TaskCard) => boolean
  /** Headings that show even with no rows while rows can be dragged, so a row can be dropped there. */
  showsEmpty?: (key: string) => boolean
  /** Where this browser keeps the headings folded shut; left out, folds last only while the screen is open. */
  foldsKey?: string
  /** What the dragged order is called: "the project's order", or "my order" on My dashboard's Today. */
  orderLabel?: string
  /** The people and projects that Hand to and Move to project offer for ticked rows. */
  bulk?: BulkTargets
  /** Where the "3 selected" button goes, such as the project header; above the table without one. */
  selectedSlot?: HTMLElement | null
  /** A bin in each row's Actions, on the tasks `canDelete` allows; the caller asks first. */
  onDelete?: (task: TaskCard) => void
  canDelete?: (task: TaskCard) => boolean
  /** Taking a task myself from Assigned to needs no note. */
  myUserId?: string
  /**
   * A heading's "+", shown while the heading is pointed at (Tyler, 19 Oct
   * 2026): wraps `button` in a New task dropdown that starts in that group,
   * or null where a group can't be started in, such as Overdue.
   */
  addTask?: (groupKey: string, button: React.ReactNode) => React.ReactNode
  /**
   * With `showProject`, what the Project column's chip shows, and where it
   * moves the task when picked; without it, the project's name in a plain chip.
   */
  projectColumn?: ProjectColumn
  /**
   * Mass select switched from outside, as from My tasks' ⋮ (Tyler, 6 Nov 2026:
   * "move mass select and search under its dropdown"). The header then shows
   * no Mass select button of its own, only "N selected".
   */
  massSelect?: { on: boolean; onToggle: () => void; tick?: string | null }
  /**
   * A row's own buttons, first in its Actions, such as Yes and No on an ask
   * for more time in My tasks' Need your attention tab.
   */
  rowActions?: (task: TaskCard) => React.ReactNode
}) {
  const { sort, direction, toggleSort } = useTableSort<TaskColumn>(
    ordered ? "order" : showProject ? "due" : "status"
  )
  const selection = useSelection()
  useClearSelectionOnListChange(selection.setSelected, tasks.map((t) => t.id).join(","))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const dndId = React.useId()
  const [ownEditing, setOwnEditing] = React.useState(false)
  const editing = massSelect ? massSelect.on : ownEditing
  // Turned off from outside too, the ticks go, as they do from the button.
  const [seenEditing, setSeenEditing] = React.useState(editing)
  if (seenEditing !== editing) {
    setSeenEditing(editing)
    if (!editing) selection.clear()
    // Turned on from a row's right-click, that row starts ticked.
    else if (massSelect?.tick && !selection.selected.has(massSelect.tick)) selection.toggle(massSelect.tick)
  }
  const canEdit = editing && !readOnly
  const canDrag = canEdit && Boolean(onDrop) && sort === "order"

  function toggleEditing() {
    if (massSelect) return massSelect.onToggle()
    if (editing) selection.clear()
    setOwnEditing(!editing)
  }

  const columns: TableHeaderColumn<TaskColumn>[] = [
    // The preset 320px minimum is for a full page; this table also sits in a panel.
    {
      key: "title",
      sortable: false,
      column: "main",
      className: "min-w-32",
      label: (
        <TableSortButton active={sort === "title"} direction={direction} onClick={() => toggleSort("title")}>
          Task
        </TableSortButton>
      ),
    },
    ...(showProject ? [{ key: "project" as const, label: "Project", column: "preview" as const }] : []),
    { key: "status", label: "Status", column: "preview" },
    { key: "priority", label: "Priority", column: "preview" },
    ...(showAssignee ? [{ key: "assignee" as const, label: "Assigned to", column: "preview" as const }] : []),
    { key: "due", label: "Due", column: "preview" },
  ]

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    return [...tasks].sort(
      (a, b) =>
        compare(a, b, sort, (task) => projectColumn?.of(task).name ?? task.projectName) * sign ||
        a.title.localeCompare(b.title)
    )
  }, [direction, projectColumn, sort, tasks])
  // Each row drags by its heading and task together.
  const grouped = React.useMemo(() => {
    const under = (key: string, tasks: TaskCard[]) => tasks.map((task) => ({ id: `${key}|${task.id}`, task }))
    if (!groups || !groupsOf) return [{ key: "all", label: null, rows: under("all", rows) }]
    return groups
      .map((group) => ({
        key: group.key,
        label: group.label as string | null,
        rows: under(group.key, rows.filter((row) => groupsOf(row).includes(group.key))),
      }))
      .filter((group) => group.rows.length > 0)
  }, [groupsOf, groups, rows])
  const drop = useListDrop(grouped, {
    groups,
    onDrop,
    canMove: (from, to, row) => canMove(from, to, row.task),
    // Empty headings only matter as somewhere to drop, so they show only with Mass select on.
    showsEmpty: canDrag ? showsEmpty : undefined,
    taskIdOf: (row) => row.task.id,
  })
  const sections = drop.sections
  const folds = useFoldedHeadings(foldsKey)
  const ids = rows.map((row) => row.id)
  // Select all ticks only the tasks in view, never those under a folded heading.
  // A section row's id is its heading and task together, so the task's own id is taken.
  const shownIds = [
    ...new Set(sections.flatMap((group) => (folds.folded(group.key) ? [] : group.rows.map((row) => row.task.id)))),
  ]
  const rowOrder = shownIds.join(",")
  React.useEffect(() => {
    onRows?.(rowOrder ? rowOrder.split(",") : [])
  }, [rowOrder, onRows])
  const selectedIds = ids.filter((id) => selection.selected.has(id))
  const colSpan = columns.length + (canEdit ? 2 : 1)
  // The "N selected" button, then Mass select, left of the header's search.
  const headerControls = readOnly ? null : (
    <>
      {canEdit && selectedIds.length ? <TaskBulkMenu taskIds={selectedIds} targets={bulk} onDone={selection.clear} /> : null}
      {massSelect ? null : <MassSelectButton on={editing} onToggle={toggleEditing} />}
    </>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {headerControls && selectedSlot ? createPortal(headerControls, selectedSlot) : null}
      {/* Only a list with no header slot at all; a slot not drawn yet (null) waits a moment instead. */}
      {headerControls && selectedSlot === undefined ? (
        <div className="flex items-center justify-end gap-1 border-b px-3 py-2">{headerControls}</div>
      ) : canEdit && onDrop && sort !== "order" ? (
        <div className="flex items-center gap-2 border-b px-3 py-2 text-sm text-muted-foreground">
          Sorted by a column, so rows can't be dragged.
          <Button type="button" variant="ghost" size="sm" onClick={() => toggleSort("order")}>
            Use {orderLabel}
          </Button>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          {...drop.context}
        >
          {/* The first column sits 16px in, where the List tab's word starts, and the
              last 12px in, the header's own padding, so the table lines up with the
              header above it (Tyler, 19 Oct 2026). With Mass select on, the tick box
              column is only as wide as the box, and the cell after it starts 8px
              on, so the drag handle sits close to the box (Tyler, 24 Oct 2026). */}
          <Table
            containerClassName="overflow-visible"
            className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-3 [&_th:first-child]:pl-4 [&_th:last-child]:pr-3 [&_[data-column=select]]:w-8 [&_[data-column=select]]:min-w-8 [&_[data-column=select]+*]:pl-2"
          >
            <SortableTableHeader
              columns={columns}
              sort={sort}
              direction={direction}
              onSort={toggleSort}
              leading={
                canEdit ? (
                  <SelectAllTableHead
                    noun="tasks"
                    disabled={rows.length === 0}
                    checked={selection.selectAllState(shownIds)}
                    onCheckedChange={() => selection.toggleVisible(shownIds)}
                  />
                ) : null
              }
              trailing={<TableHead column="meta">Actions</TableHead>}
            />
            {/* A folded heading's lines, last one included, come from the shell's one table
                line rule in theme.css; a border of its own here sat beside them and read as a
                thick line (Tyler, 30 Oct 2026: "when collapsed the border is too thick"). */}
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-muted-foreground">
                    {emptyText}
                  </TableCell>
                </TableRow>
              ) : (
                sections.map((group) => (
                  <React.Fragment key={group.key}>
                    {group.label !== null ? (
                      <GroupHeading
                        groupKey={group.key}
                        label={group.label}
                        colSpan={colSpan}
                        dropZone={Boolean(drop.held)}
                        onToggle={() => folds.toggle(group.key)}
                      >
                        <span className="text-muted-foreground">{group.rows.length}</span>
                        {readOnly ? null : addTask?.(group.key, <HeadingAddButton label={group.label} />)}
                        <HeadingFoldButton
                          label={group.label}
                          folded={folds.folded(group.key)}
                          onClick={() => folds.toggle(group.key)}
                        />
                      </GroupHeading>
                    ) : null}
                    <SortableContext
                      items={group.rows.map((row) => row.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {(folds.folded(group.key) ? [] : group.rows).map(({ id, task }) => (
                        <TaskRow
                          key={id}
                          dragId={id}
                          task={task}
                          project={showProject ? (projectColumn?.of(task) ?? { name: task.projectName, color: "slate" }) : null}
                          projectChoices={projectColumn?.choices?.(task) ?? null}
                          showAssignee={showAssignee}
                          editable={!readOnly}
                          people={bulk.people}
                          myUserId={myUserId}
                          canSelect={canEdit}
                          canDrag={canDrag}
                          dragLocked={busy}
                          selected={selection.selected.has(task.id)}
                          onToggle={() => selection.toggle(task.id)}
                          onOpen={() => onOpenTask(task)}
                          onDelete={
                            onDelete && !readOnly && (canDelete?.(task) ?? true) ? () => onDelete(task) : undefined
                          }
                          actions={rowActions?.(task)}
                        />
                      ))}
                    </SortableContext>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
          {onDrop ? (
            <DragOverlay dropAnimation={null}>{drop.held ? <HeldTaskGhost task={drop.held.task} /> : null}</DragOverlay>
          ) : null}
        </DndContext>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

function TaskRow({
  dragId,
  task,
  project,
  projectChoices,
  showAssignee,
  editable,
  people,
  myUserId,
  canSelect,
  canDrag,
  dragLocked,
  selected,
  onToggle,
  onOpen,
  onDelete,
  actions,
}: {
  /** The row's heading and task together. */
  dragId: string
  task: TaskCard
  /** The Project column's chip, or null without the column. */
  project: { name: string; color: ProjectColor } | null
  /** Where the chip can move the task; null keeps it a plain chip. */
  projectChoices: ProjectChoice[] | null
  showAssignee: boolean
  /** Each cell opens a dropdown to change it. */
  editable: boolean
  people: BulkTargets["people"]
  myUserId?: string
  canSelect: boolean
  canDrag: boolean
  dragLocked: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete?: () => void
  actions?: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: dragId, disabled: !canDrag || dragLocked })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      // A little tighter than the shell's rows (Tyler, 19 Oct 2026).
      className={cn(
        "group [&>td]:py-1",
        // Its place shows dimmed in the gap while a copy follows the pointer.
        isDragging && "opacity-40"
      )}
      rowAction={onOpen}
    >
      {canSelect ? (
        <TableCell column="select">
          <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${task.title}`} />
        </TableCell>
      ) : null}
      <TableCell column="main" className="min-w-32">
        <span className="flex min-w-0 items-center gap-2">
          {canDrag ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              aria-label={`Drag ${task.title} to change the order`}
              className="-ml-1 flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <GripVerticalIcon className="size-4" aria-hidden />
            </button>
          ) : null}
          {editable ? <StatusCellMenu task={task} look="dot" /> : <StatusDot status={task.status} />}
          <span className={cn("truncate font-medium", task.priority === "low" && "text-muted-foreground")}>
            {task.title}
          </span>
          <UnreadBadge count={task.unread} />
          {task.waiting ? <WaitingBadge /> : null}
          <ReviewBadge review={task.review} />
          <PickedDaysBadge pickedDays={task.pickedDays} status={task.status} />
          {/* With the task's other chips: the Due column is 176px, too narrow for a date and this too. */}
          <DueMovesMark moves={task.dueMoves} status={task.status} />
          <WaitingOnBadge waitingOn={task.waitingOn} />
          <SnoozedBadge until={task.snoozedUntil} today={todayKey()} />
        </span>
      </TableCell>
      {project !== null ? (
        <TableCell column="preview">
          {editable && projectChoices ? (
            <ProjectCellMenu task={task} project={project} choices={projectChoices} />
          ) : (
            <ProjectChip name={project.name} color={project.color} />
          )}
        </TableCell>
      ) : null}
      <TableCell column="preview">
        {editable ? <StatusCellMenu task={task} look="badge" /> : <StatusBadge status={task.status} />}
      </TableCell>
      <TableCell column="preview">
        {editable ? (
          <PriorityCellMenu task={task} />
        ) : (
          <PriorityChip priority={task.priority} />
        )}
      </TableCell>
      {!showAssignee ? null : (
        // Wide enough for a face and a full name, however narrow the panel.
        <TableCell column="preview" className="min-w-40">
          {editable ? (
            <AssigneeCellMenu task={task} people={people} myUserId={myUserId} />
          ) : (
            <PersonChip person={task.assignee} />
          )}
        </TableCell>
      )}
      <TableCell column="preview">
        {editable ? (
          <DueCellMenu task={task} />
        ) : (
          <DueChip dueDate={task.dueDate} dueAt={task.dueAt} status={task.status} />
        )}
      </TableCell>
      <TableCell column="actions">
        {actions}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Open ${task.title}`}
          onClick={onOpen}
        >
          <SettingsIcon className="size-4" />
        </Button>
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${task.title}`}
            onClick={onDelete}
            className="hover:text-destructive"
          >
            <Trash2Icon className="size-4" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  )
}

/**
 * The shell's group heading, its label 16px in like the List's first column.
 * While a row is held, a heading that takes drops is a drop zone too, so an
 * empty one can take it.
 */
function GroupHeading({
  groupKey,
  label,
  colSpan,
  dropZone,
  onToggle,
  children,
}: {
  groupKey: string
  label: string
  colSpan: number
  dropZone: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: `${HEADING_DROP}${groupKey}`, disabled: !dropZone })
  return (
    <TableGroupRow
      ref={setNodeRef}
      colSpan={colSpan}
      inset="1rem"
      label={label}
      data-new-group={groupKey}
      className={FOLDING_HEADING_CLASS}
      onClick={foldOnHeadingClick(onToggle)}
    >
      {children}
    </TableGroupRow>
  )
}

/** Without its own rule, a row only moves inside its heading. */
function sameHeading() {
  return false
}
