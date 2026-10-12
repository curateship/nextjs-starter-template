import * as React from "react"
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { useRouter } from "@tanstack/react-router"
import { CheckIcon, GripVerticalIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import {
  DueDate,
  LabelChip,
  PersonAvatar,
  PickedDaysBadge,
  ReviewBadge,
  SnoozedBadge,
  StatusBadge,
  WaitingBadge,
  WaitingOnBadge,
} from "@/components/project/task-bits"
import { TaskBulkBar, type BulkTargets } from "@/components/project/task-bulk-bar"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table"
import { markTasksDone, type TaskCard } from "@/lib/api/project/tasks"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { todayKey } from "@/lib/project/dates"
import { TASK_STATUSES } from "@/lib/project/rules"
import { byPosition } from "@/lib/project/task-order"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** "order" is the project's own order, set by dragging; the rest are columns. */
export type TaskColumn = "order" | "title" | "project" | "status" | "assignee" | "due" | "steps"

const STATUS_ORDER = Object.fromEntries(TASK_STATUSES.map((s, i) => [s, i]))

function compare(a: TaskCard, b: TaskCard, column: TaskColumn) {
  switch (column) {
    case "project":
      return a.projectName.localeCompare(b.projectName)
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    case "assignee":
      return (a.assignee?.name ?? "~").localeCompare(b.assignee?.name ?? "~")
    case "due":
      // Tasks with no due date go last whichever way the column is sorted.
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
    case "steps":
      return a.steps.total - b.steps.total
    case "order":
      return byPosition(a, b)
    default:
      return a.title.localeCompare(b.title)
  }
}

export type TaskGroup = { key: string; label: string }

/**
 * Tasks as rows: the project page's List tab, and My dashboard. Rows sort by any
 * column, and ticked rows can be marked Done together.
 *
 * `groupOf` puts the rows under headings, in `groups` order. With `onReorder`
 * the rows start in the project's own order and drag up or down inside their
 * heading to change it, for everyone on the project.
 */
export function TaskList({
  tasks,
  readOnly,
  onOpenTask,
  showProject = false,
  emptyText = "No tasks yet.",
  groups,
  groupOf,
  showEmptyGroups = false,
  onReorder,
  orderLabel = "the project's order",
  bulk,
}: {
  tasks: TaskCard[]
  readOnly: boolean
  onOpenTask: (task: TaskCard) => void
  showProject?: boolean
  emptyText?: string
  groups?: readonly TaskGroup[]
  groupOf?: (task: TaskCard) => string
  showEmptyGroups?: boolean
  onReorder?: (taskIds: string[]) => void
  /** What the dragged order is called: "the project's order", or "my order" on My dashboard's Today. */
  orderLabel?: string
  /** Status, Hand to, Due date and Move to project for ticked rows. */
  bulk?: BulkTargets
}) {
  const router = useRouter()
  const { sort, direction, toggleSort } = useTableSort<TaskColumn>(
    onReorder ? "order" : showProject ? "due" : "status"
  )
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  useClearSelectionOnListChange(selection.setSelected, tasks.map((t) => t.id).join(","))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const dndId = React.useId()
  const canDrag = Boolean(onReorder) && sort === "order" && !readOnly

  const columns: SortableColumn<TaskColumn>[] = [
    // The preset 320px minimum is for a full page; this table also sits in a panel.
    { key: "title", label: "Task", column: "main", className: "min-w-32" },
    ...(showProject ? [{ key: "project" as const, label: "Project", column: "preview" as const }] : []),
    { key: "status", label: "Status", column: "preview" },
    ...(showProject ? [] : [{ key: "assignee" as const, label: "Assigned to", column: "preview" as const }]),
    { key: "due", label: "Due", column: "preview" },
    { key: "steps", label: "Steps", column: "preview" },
  ]

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    return [...tasks].sort(
      (a, b) => compare(a, b, sort) * sign || a.title.localeCompare(b.title)
    )
  }, [direction, sort, tasks])
  const sections = React.useMemo(() => {
    if (!groups || !groupOf) return [{ key: "all", label: null, rows }]
    return groups
      .map((group) => ({
        key: group.key,
        label: group.label as string | null,
        rows: rows.filter((row) => groupOf(row) === group.key),
      }))
      .filter((group) => showEmptyGroups || group.rows.length > 0)
  }, [groupOf, groups, rows, showEmptyGroups])
  const ids = rows.map((row) => row.id)
  const selectedIds = ids.filter((id) => selection.selected.has(id))
  const colSpan = columns.length + 2

  async function markDone() {
    let result = { done: [] as string[], kept: [] as string[] }
    const ok = await run(async () => {
      result = await markTasksDone(selectedIds)
    })
    if (!ok) return
    const line = describeBulkResult({
      done: result.done.length,
      kept: result.kept.length,
      one: "task",
      many: "tasks",
      verb: "marked Done",
    })
    if (result.kept.length) showErrorToast(line)
    else toast.success(line)
    selection.clear()
    await router.invalidate()
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id
    if (!onReorder || overId === undefined || overId === event.active.id) return
    const group = sections.find((g) => g.rows.some((row) => row.id === event.active.id))
    // A row moves inside its own heading; its section changes in the task.
    if (!group || !group.rows.some((row) => row.id === overId)) return
    const groupIds = group.rows.map((row) => row.id)
    onReorder(
      arrayMove(groupIds, groupIds.indexOf(String(event.active.id)), groupIds.indexOf(String(overId)))
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedIds.length && !readOnly ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => void markDone()}>
            <CheckIcon className="size-4" />
            Mark Done ({selectedIds.length})
          </DashboardToolbarButton>
          {bulk ? (
            <TaskBulkBar taskIds={selectedIds} targets={bulk} onDone={selection.clear} />
          ) : null}
          <DashboardToolbarButton type="button" variant="ghost" onClick={selection.clear}>
            Clear selection
          </DashboardToolbarButton>
        </div>
      ) : onReorder && sort !== "order" ? (
        <div className="flex items-center gap-2 border-b px-3 py-2 text-sm text-muted-foreground">
          Sorted by a column, so rows can't be dragged.
          <Button type="button" variant="ghost" size="sm" onClick={() => toggleSort("order")}>
            Use {orderLabel}
          </Button>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Table containerClassName="overflow-visible">
            <SortableTableHeader
              columns={columns}
              sort={sort}
              direction={direction}
              onSort={toggleSort}
              leading={
                <SelectAllTableHead
                  noun="tasks"
                  disabled={readOnly || rows.length === 0}
                  checked={selection.selectAllState(ids)}
                  onCheckedChange={() => selection.toggleVisible(ids)}
                />
              }
              trailing={<TableHead column="meta">Actions</TableHead>}
            />
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
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={colSpan} className="py-1.5 text-xs font-medium">
                          {/* Held at the left edge, so a table scrolled sideways still names its group. */}
                          <span className="sticky left-5">
                            {group.label}
                            <span className="ml-2 text-muted-foreground">{group.rows.length}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {group.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={colSpan} className="text-xs text-muted-foreground">
                          <span className="sticky left-5">No tasks in this section.</span>
                        </TableCell>
                      </TableRow>
                    ) : null}
                    <SortableContext
                      items={group.rows.map((row) => row.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {group.rows.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          showProject={showProject}
                          readOnly={readOnly}
                          canDrag={canDrag}
                          selected={selection.selected.has(task.id)}
                          onToggle={() => selection.toggle(task.id)}
                          onOpen={() => onOpenTask(task)}
                        />
                      ))}
                    </SortableContext>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </DndContext>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

function TaskRow({
  task,
  showProject,
  readOnly,
  canDrag,
  selected,
  onToggle,
  onOpen,
}: {
  task: TaskCard
  showProject: boolean
  readOnly: boolean
  canDrag: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: !canDrag })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn("group", isDragging && "relative z-10 bg-background")}
      rowAction={onOpen}
    >
      <TableCell column="select">
        <Checkbox
          checked={selected}
          disabled={readOnly}
          onCheckedChange={onToggle}
          aria-label={`Select ${task.title}`}
        />
      </TableCell>
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
          <span className="truncate font-medium">{task.title}</span>
          {task.waiting ? <WaitingBadge /> : null}
          <ReviewBadge review={task.review} />
          <PickedDaysBadge pickedDays={task.pickedDays} status={task.status} />
          <WaitingOnBadge waitingOn={task.waitingOn} />
          <SnoozedBadge until={task.snoozedUntil} today={todayKey()} />
          {task.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </span>
      </TableCell>
      {showProject ? <TableCell column="preview">{task.projectName}</TableCell> : null}
      <TableCell column="preview">
        <StatusBadge status={task.status} />
      </TableCell>
      {showProject ? null : (
        <TableCell column="preview">
          {task.assignee ? (
            <span className="flex items-center gap-2">
              <PersonAvatar name={task.assignee.name} avatarUrl={task.assignee.avatarUrl} />
              {task.assignee.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Nobody</span>
          )}
        </TableCell>
      )}
      <TableCell column="preview">
        <DueDate dueDate={task.dueDate} status={task.status} />
      </TableCell>
      <TableCell column="preview">
        {task.steps.total ? `${task.steps.done} of ${task.steps.total}` : null}
      </TableCell>
      <TableCell column="actions">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Open ${task.title}`}
          onClick={onOpen}
        >
          <SettingsIcon className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}
