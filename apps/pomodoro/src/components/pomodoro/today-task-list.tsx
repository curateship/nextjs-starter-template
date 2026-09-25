import * as React from "react"
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CheckIcon, GripVerticalIcon, SettingsIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { usePomodoro } from "@/lib/pomodoro/use-pomodoro"
import {
  taskPriorities,
  taskProgressLabel,
  type TaskItem,
  type TaskPriority,
} from "@/lib/pomodoro/tasks"

type PomodoroApi = ReturnType<typeof usePomodoro>

const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
}

/**
 * Today's tasks, ported from the old app's task-plan-list: drag to reorder
 * by mouse, touch or keyboard with dnd-kit (announced to screen readers),
 * inline edit with priority and a 1-20 estimate, complete/reopen, remove,
 * and picking the focus task while the timer is idle. Completed tasks group
 * below the active ones.
 */
export function TodayTaskList({ pomodoro }: { pomodoro: PomodoroApi }) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const activeTasks = pomodoro.tasks.filter((task) => !task.completed)
  const completedTasks = pomodoro.tasks.filter((task) => task.completed)
  const titleOf = (id: unknown) =>
    pomodoro.tasks.find((task) => task.id === id)?.title ?? "task"
  const positionOf = (id: unknown) =>
    activeTasks.findIndex((task) => task.id === id) + 1

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = activeTasks.findIndex((task) => task.id === active.id)
    const newIndex = activeTasks.findIndex((task) => task.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    pomodoro.reorderActiveTasks(
      arrayMove(activeTasks, oldIndex, newIndex).map((task) => task.id)
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {!activeTasks.length ? (
        <p className="py-2 text-sm text-muted-foreground">
          No active tasks. Add one below to choose your next focus.
        </p>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "To reorder a task, press space or enter on its reorder handle, move it with the arrow keys, then press space or enter again to drop it. Press escape to cancel.",
          },
          announcements: {
            onDragStart: ({ active }) =>
              `Picked up ${titleOf(active.id)}, position ${positionOf(active.id)} of ${activeTasks.length}.`,
            onDragOver: ({ active, over }) =>
              over
                ? `${titleOf(active.id)} is now at position ${positionOf(over.id)} of ${activeTasks.length}.`
                : undefined,
            onDragEnd: ({ active, over }) =>
              over
                ? `${titleOf(active.id)} dropped at position ${positionOf(over.id)} of ${activeTasks.length}.`
                : `${titleOf(active.id)} dropped.`,
            onDragCancel: ({ active }) =>
              `Reordering cancelled. ${titleOf(active.id)} returned to its original position.`,
          },
        }}
      >
        <SortableContext
          items={activeTasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {activeTasks.map((task) => (
            <SortableTaskRow
              key={task.id}
              task={task}
              pomodoro={pomodoro}
              editing={editingId === task.id}
              onEditingChange={(editing) =>
                setEditingId(editing ? task.id : null)
              }
            />
          ))}
        </SortableContext>
      </DndContext>
      {completedTasks.map((task) => (
        <div
          key={task.id}
          className="flex min-h-11 items-center gap-3 rounded-lg border bg-card/50 px-3"
        >
          <Checkbox
            checked
            onCheckedChange={() => pomodoro.toggleTask(task.id)}
            aria-label={`Reopen ${task.title}`}
          />
          <span className="flex-1 truncate text-sm text-muted-foreground line-through">
            {task.title}
          </span>
          <small className="font-mono text-[10px] text-muted-foreground">
            {taskProgressLabel(task)}
          </small>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => pomodoro.removeTask(task.id)}
            aria-label={`Remove ${task.title}`}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  )
}

function SortableTaskRow({
  task,
  pomodoro,
  editing,
  onEditingChange,
}: {
  task: TaskItem
  pomodoro: PomodoroApi
  editing: boolean
  onEditingChange: (editing: boolean) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: editing })
  const selected = pomodoro.selectedTaskId === task.id

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-lg border bg-card px-2",
        selected && "border-l-2 border-l-primary",
        isDragging && "z-10 opacity-80 shadow-lg"
      )}
    >
      {editing ? (
        <TaskEditForm
          task={task}
          onCancel={() => onEditingChange(false)}
          onSave={(changes) => {
            pomodoro.updateTaskDetails(task.id, changes)
            onEditingChange(false)
          }}
        />
      ) : (
        <>
          <button
            ref={setActivatorNodeRef}
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${task.title}`}
          >
            <GripVerticalIcon className="size-4" aria-hidden="true" />
          </button>
          <Checkbox
            checked={false}
            onCheckedChange={() => pomodoro.toggleTask(task.id)}
            aria-label={`Complete ${task.title}`}
          />
          <button
            className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left disabled:cursor-default"
            disabled={!pomodoro.canSelectTask}
            aria-pressed={selected}
            onClick={() => pomodoro.selectTask(task.id)}
          >
            <span className="truncate text-sm">{task.title}</span>
            {task.priority !== "normal" ? (
              <b
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide",
                  task.priority === "high"
                    ? "text-[var(--p-accent-2)]"
                    : "text-muted-foreground"
                )}
              >
                {priorityLabels[task.priority]}
              </b>
            ) : null}
            <small className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
              {taskProgressLabel(task)}
            </small>
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEditingChange(true)}
            aria-label={`Edit ${task.title}`}
          >
            <SettingsIcon aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => pomodoro.removeTask(task.id)}
            aria-label={`Remove ${task.title}`}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  )
}

function TaskEditForm({
  task,
  onSave,
  onCancel,
}: {
  task: TaskItem
  onSave: (changes: {
    title: string
    priority: TaskPriority
    estimatedPomodoros: number | null
  }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = React.useState(task.title)
  const [priority, setPriority] = React.useState<TaskPriority>(task.priority)
  const [estimate, setEstimate] = React.useState(
    task.estimatedPomodoros === null ? "" : String(task.estimatedPomodoros)
  )
  const parsedEstimate = estimate.trim() === "" ? null : Number(estimate)
  const estimateValid =
    parsedEstimate === null ||
    (Number.isInteger(parsedEstimate) &&
      parsedEstimate >= 1 &&
      parsedEstimate <= 20)
  const titleValid = Boolean(title.trim())

  return (
    <form
      className="flex flex-1 items-center gap-2 py-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!titleValid || !estimateValid) return
        onSave({
          title: title.trim(),
          priority,
          estimatedPomodoros: parsedEstimate,
        })
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel()
      }}
    >
      <Input
        required
        maxLength={160}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label={`Title for ${task.title}`}
        autoFocus
        className="flex-1"
      />
      <Select
        value={priority}
        onValueChange={(value) => setPriority(value as TaskPriority)}
      >
        <SelectTrigger className="text-xs" aria-label={`Priority for ${task.title}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {taskPriorities.map((value) => (
            <SelectItem key={value} value={value}>
              {priorityLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="number"
        min={1}
        max={20}
        step={1}
        value={estimate}
        placeholder="Est."
        onChange={(event) => setEstimate(event.target.value)}
        aria-label={`Estimated pomodoros for ${task.title}`}
        aria-invalid={!estimateValid}
        className="w-16"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={!titleValid || !estimateValid}
        aria-label={`Save changes to ${task.title}`}
      >
        <CheckIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onCancel}
        aria-label={`Cancel editing ${task.title}`}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </form>
  )
}
