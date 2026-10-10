import * as React from "react"
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { CircleAlertIcon, MessageSquareIcon, UndoIcon } from "lucide-react"

import {
  DueDate,
  PersonAvatar,
  StepsCount,
  WaitingBadge,
} from "@/components/project/task-bits"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import type { TaskCard } from "@/lib/api/project/tasks"
import { TASK_STATUSES, TASK_STATUS_LABEL, isTaskStatus, type TaskStatus } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/**
 * One column per status. A card drags between columns to change its status;
 * a click opens the task. The task window's Status field does the same job
 * from the keyboard.
 */
export function TaskBoard({
  tasks,
  readOnly,
  onOpenTask,
  onMove,
}: {
  tasks: TaskCard[]
  readOnly: boolean
  onOpenTask: (taskId: string) => void
  onMove: (task: TaskCard, status: TaskStatus) => void
}) {
  // A short drag threshold, so a click on a card still opens it.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  // A fixed id, so the drag library names its hidden help text the same on the
  // server and in the browser. Without it the page fails to hydrate.
  const dndId = React.useId()

  function handleDragEnd(event: DragEndEvent) {
    const status = event.over?.id
    const task = tasks.find((t) => t.id === event.active.id)
    if (task && isTaskStatus(status) && status !== task.status) onMove(task, status)
  }

  return (
    <DndContext id={dndId} sensors={sensors} onDragEnd={handleDragEnd}>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="flex h-full min-h-0 gap-3 p-3">
          {TASK_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={tasks.filter((task) => task.status === status)}
              readOnly={readOnly}
              onOpenTask={onOpenTask}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </DndContext>
  )
}

function BoardColumn({
  status,
  tasks,
  readOnly,
  onOpenTask,
}: {
  status: TaskStatus
  tasks: TaskCard[]
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
        <span className="text-muted-foreground">{tasks.length}</span>
      </h3>
      {tasks.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">No tasks</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <BoardCard key={task.id} task={task} readOnly={readOnly} onOpen={() => onOpenTask(task.id)} />
          ))}
        </ul>
      )}
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: readOnly,
  })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <li ref={setNodeRef} style={style} className={cn(isDragging && "relative z-10 opacity-80")}>
      <button
        type="button"
        onClick={onOpen}
        {...listeners}
        {...attributes}
        // dnd-kit names the card a draggable; it is a button that opens the task.
        role="button"
        aria-roledescription={readOnly ? undefined : "draggable task"}
        className="grid w-full gap-2 rounded-lg border bg-card p-3 text-left text-sm shadow-xs hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="font-medium break-words">{task.title}</span>
        {task.status === "stuck" && task.stuckReason ? (
          <span className="text-xs text-destructive">Stuck: {task.stuckReason}</span>
        ) : null}
        {task.handedBack ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <UndoIcon className="size-3" aria-hidden />
            Handed back by {task.handedBack.byName}
          </span>
        ) : null}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {task.waiting ? <WaitingBadge /> : null}
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
      </button>
    </li>
  )
}
