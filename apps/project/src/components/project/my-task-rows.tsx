import * as React from "react"
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
import { useRouter } from "@tanstack/react-router"
import { CheckIcon, ChevronRightIcon, HourglassIcon, ListChecksIcon, PlayIcon } from "lucide-react"

import {
  DueDate,
  HeldTaskGhost,
  LabelChip,
  PickedDaysBadge,
  PriorityMark,
  ReviewBadge,
  SnoozedBadge,
  StatusDot,
  TintChip,
  UnreadBadge,
  WaitingBadge,
} from "@/components/project/task-bits"
import { RowClock } from "@/components/project/task-clock"
import { HeadingAddButton, HeadingFoldButton } from "@/components/project/task-list-heading"
import { TaskBulkBar, type BulkTargets } from "@/components/project/task-bulk-bar"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { changeTasks, type BulkOutcome, type TaskCard } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { pauseTaskClock } from "@/lib/api/project/clock"
import { reportBulkOutcome } from "@/lib/project/bulk-outcome"
import { todayKey } from "@/lib/project/dates"
import { HEADING_DROP, type ListDrop } from "@/lib/project/list-drop"
import { canMove, takesDrops } from "@/lib/project/my-task-order"
import { MY_TASK_FOLDS_KEY } from "@/lib/project/panel-keys"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { DUE_MOVED_MANY, TASK_STATUS_LABEL } from "@/lib/project/rules"
import { useFoldedHeadings } from "@/lib/project/use-folded-headings"
import { useListDrop } from "@/lib/project/use-list-drop"
import { cn } from "@/lib/utils"

export type RowGroup = { key: string; label: string }

/** The dot before each group's name on My dashboard's List. */
const GROUP_DOT: Record<string, string> = {
  waiting: "bg-amber-500",
  overdue: "bg-red-500",
  today: "bg-orange-500",
  week: "bg-blue-500",
  later: "bg-violet-500",
  picked: "bg-foreground",
  done: "bg-green-500",
  none: "bg-muted-foreground/40",
}

/**
 * My tasks on My dashboard, as Tyler drew them on 13 Oct 2026: one row a
 * task under small capital headings (OVERDUE, THIS WEEK, NO DATE), each row a
 * round tick box, the title with the project and its chips under it, then the
 * due date, steps, status and an arrow. Clicking a row opens the task. Ticked
 * rows can be marked Done, handed over, dated or given a status together.
 * With `onDrop`, rows drag up or down to set my own order, or into another
 * heading (`lib/project/my-task-order.ts`).
 */
export function MyTaskRows({
  tasks,
  openTaskId,
  groups,
  groupOf,
  onOpenTask,
  onDrop,
  bulk,
  emptyText,
  addTask,
}: {
  tasks: TaskCard[]
  /** The task open in the right panel, whose row is marked. */
  openTaskId?: string
  groups?: readonly RowGroup[]
  groupOf?: (task: TaskCard) => string
  onOpenTask: (task: TaskCard) => void
  /** A row let go inside its heading or under another. Left out, rows don't drag. */
  onDrop?: (drop: ListDrop) => void
  bulk: BulkTargets
  emptyText: string
  /** A heading's "+": wraps `button` in a New task that lands under that heading, or null where none can. */
  addTask?: (groupKey: string, button: React.ReactNode) => React.ReactNode
}) {
  const router = useRouter()
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  useClearSelectionOnListChange(selection.setSelected, tasks.map((t) => t.id).join(","))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const dndId = React.useId()
  const ids = tasks.map((task) => task.id)
  const selectedIds = ids.filter((id) => selection.selected.has(id))

  const grouped = React.useMemo(() => {
    if (!groups || !groupOf) return [{ key: "all", label: null as string | null, rows: tasks }]
    return groups
      .map((group) => ({
        key: group.key,
        label: group.label as string | null,
        rows: tasks.filter((task) => groupOf(task) === group.key),
      }))
      .filter((group) => group.rows.length > 0)
  }, [groupOf, groups, tasks])
  const drop = useListDrop(grouped, { groups, onDrop, canMove, showsEmpty: takesDrops })
  const sections = drop.sections
  const folds = useFoldedHeadings(MY_TASK_FOLDS_KEY)

  /** The row's own Pause, for a clock left running (Task panel task 01, part 6). */
  async function pauseClock(task: TaskCard) {
    if (await run(() => pauseTaskClock(task.id))) await router.invalidate()
  }

  /** Each task is marked Done on its own, so one with a field still to fill is refused alone and named. */
  async function markDone() {
    let outcome: BulkOutcome = { changed: [], refused: [] }
    const ok = await run(async () => {
      outcome = await changeTasks({
        taskIds: selectedIds,
        change: { kind: "status", status: "done", stuckReason: null },
      })
    })
    if (!ok) return
    reportBulkOutcome(outcome, "marked Done")
    selection.clear()
    await router.invalidate()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedIds.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => void markDone()}>
            <CheckIcon className="size-4" />
            Mark Done ({selectedIds.length})
          </DashboardToolbarButton>
          <TaskBulkBar taskIds={selectedIds} targets={bulk} onDone={selection.clear} />
          <DashboardToolbarButton type="button" variant="ghost" onClick={selection.clear}>
            Clear selection
          </DashboardToolbarButton>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {tasks.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} {...drop.context}>
            {sections.map((section) => (
              <section key={section.key} aria-label={section.label ?? undefined}>
                {section.label !== null ? (
                  <GroupHeading groupKey={section.key} dropZone={Boolean(drop.held)}>
                    <span aria-hidden className={cn("size-2 rounded-full", GROUP_DOT[section.key] ?? GROUP_DOT.none)} />
                    {section.label}
                    <span className="font-normal text-muted-foreground">{section.rows.length}</span>
                    {addTask?.(section.key, <HeadingAddButton label={section.label} />)}
                    <HeadingFoldButton
                      label={section.label}
                      folded={folds.folded(section.key)}
                      onClick={() => folds.toggle(section.key)}
                    />
                  </GroupHeading>
                ) : null}
                <SortableContext items={section.rows.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                  <ul>
                    {(folds.folded(section.key) ? [] : section.rows).map((task) => (
                      <Row
                        key={task.id}
                        task={task}
                        canDrag={Boolean(onDrop) && !busy}
                        open={task.id === openTaskId}
                        selected={selection.selected.has(task.id)}
                        onToggle={() => selection.toggle(task.id)}
                        onOpen={() => onOpenTask(task)}
                        onPauseClock={() => void pauseClock(task)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </section>
            ))}
            <DragOverlay dropAnimation={null}>{drop.held ? <HeldTaskGhost task={drop.held} /> : null}</DragOverlay>
          </DndContext>
        )}
      </ScrollArea>
    </div>
  )
}

/** A heading; while a row is held, one with no rows still takes it, at its top. */
function GroupHeading({
  groupKey,
  dropZone,
  children,
}: {
  groupKey: string
  dropZone: boolean
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: `${HEADING_DROP}${groupKey}`, disabled: !dropZone })
  return (
    <h3
      ref={setNodeRef}
      className="group/table-group flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium tracking-wide uppercase"
    >
      {children}
    </h3>
  )
}

function Row({
  task,
  open,
  canDrag,
  selected,
  onToggle,
  onOpen,
  onPauseClock,
}: {
  task: TaskCard
  open: boolean
  canDrag: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onPauseClock: () => void
}) {
  // The rows slide apart for the held one, whose place shows dimmed while a copy follows the pointer.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canDrag,
  })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined
  const slipping = task.dueMoves >= DUE_MOVED_MANY && task.status !== "done"

  return (
    <li
      ref={setNodeRef}
      style={style}
      // Read by a right-click, which opens the task's Duplicate and Delete.
      data-task-id={task.id}
      className={cn(
        "flex items-center gap-3 border-b px-4 py-3 hover:bg-muted/40",
        // Open beside the list: a bar down its left edge, as the Board outlines its card.
        open && "bg-muted/60 shadow-[inset_2px_0_0_var(--foreground)]",
        isDragging && "opacity-40"
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        aria-label={`Select ${task.title}`}
        className="size-5 rounded-full"
      />
      {/* The rest of the row is one button that opens the task, and with my
          own order the handle that drags it. */}
      <button
        type="button"
        onClick={onOpen}
        aria-current={open || undefined}
        {...(canDrag ? { ...listeners, ...attributes, role: "button", "aria-roledescription": "draggable task" } : {})}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="grid min-w-0 flex-1 gap-1">
          <span className={cn("truncate font-medium", task.priority === "low" && "text-muted-foreground")}>
            {task.title}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span className="truncate">{task.projectName}</span>
            <PriorityMark priority={task.priority} />
            {task.type ? <TintChip color={task.type.color}>{task.type.name}</TintChip> : null}
            {task.labels.map((label) => (
              <LabelChip key={label.id} label={label} />
            ))}
            {slipping ? <TintChip color="amber">Date moved {task.dueMoves} times</TintChip> : null}
            <WaitingOnChip waitingOn={task.waitingOn} />
            {task.waiting ? <WaitingBadge /> : null}
            <ReviewBadge review={task.review} />
            <PickedDaysBadge pickedDays={task.pickedDays} status={task.status} />
            <SnoozedBadge until={task.snoozedUntil} today={todayKey()} />
            <UnreadBadge count={task.unread} />
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-sm">
          {task.dueDate ? (
            <DueDate dueDate={task.dueDate} dueAt={task.dueAt} status={task.status} className="max-sm:hidden" />
          ) : null}
          {task.steps.total ? (
            <span className="flex items-center gap-1 text-muted-foreground max-sm:hidden">
              <ListChecksIcon className="size-4" aria-hidden />
              {task.steps.done}/{task.steps.total}
              <span className="sr-only"> steps done</span>
            </span>
          ) : null}
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted px-2 text-xs font-medium">
            <StatusDot status={task.status} />
            {TASK_STATUS_LABEL[task.status]}
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
        </span>
      </button>
      {/* Beside the row's button, not in it, so Pause never opens the task. */}
      <RowClock task={task} onPause={onPauseClock} />
    </li>
  )
}

/** "Waiting on 1 task" as a grey chip, or "Ready to start" once they're all Done. */
function WaitingOnChip({ waitingOn }: { waitingOn: TaskCard["waitingOn"] }) {
  if (!waitingOn) return null
  if (waitingOn.ready) {
    return (
      <TintChip color="green">
        <PlayIcon className="mr-1 inline size-3" aria-hidden />
        Ready to start
      </TintChip>
    )
  }
  const open = waitingOn.tasks.filter((task) => !task.done).length
  return (
    <TintChip color="slate">
      <HourglassIcon className="mr-1 inline size-3" aria-hidden />
      Waiting on {open} {open === 1 ? "task" : "tasks"}
    </TintChip>
  )
}
