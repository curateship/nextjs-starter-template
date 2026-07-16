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
import { Check, GripVertical, Pencil, X } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { usePomodoro } from "@/hooks/use-pomodoro"
import { taskPriorities, taskProgressLabel, type GuestTask, type TaskPriority } from "@/lib/pomodoro"

type PomodoroApi = ReturnType<typeof usePomodoro>

const priorityLabels: Record<TaskPriority, string> = { low: "Low", normal: "Normal", high: "High" }

export function TodayTaskList({ pomodoro }: { pomodoro: PomodoroApi }) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const activeTasks = pomodoro.tasks.filter((task) => !task.completed)
  const completedTasks = pomodoro.tasks.filter((task) => task.completed)
  const titleOf = (id: unknown) => pomodoro.tasks.find((task) => task.id === id)?.title ?? "task"
  const positionOf = (id: unknown) => activeTasks.findIndex((task) => task.id === id) + 1

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = activeTasks.findIndex((task) => task.id === active.id)
    const newIndex = activeTasks.findIndex((task) => task.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    pomodoro.reorderActiveTasks(arrayMove(activeTasks, oldIndex, newIndex).map((task) => task.id))
  }

  return (
    <div>
      {!activeTasks.length ? <p className="task-selection-empty">No active tasks. Add one below to choose your next focus.</p> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: "To reorder a task, press space or enter on its reorder handle, move it with the arrow keys, then press space or enter again to drop it. Press escape to cancel." },
          announcements: {
            onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}, position ${positionOf(active.id)} of ${activeTasks.length}.`,
            onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is now at position ${positionOf(over.id)} of ${activeTasks.length}.` : undefined),
            onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} dropped at position ${positionOf(over.id)} of ${activeTasks.length}.` : `${titleOf(active.id)} dropped.`),
            onDragCancel: ({ active }) => `Reordering cancelled. ${titleOf(active.id)} returned to its original position.`,
          },
        }}
      >
        <SortableContext items={activeTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {activeTasks.map((task) => (
            <SortableTaskRow key={task.id} task={task} pomodoro={pomodoro} editing={editingId === task.id} onEditingChange={(editing) => setEditingId(editing ? task.id : null)} />
          ))}
        </SortableContext>
      </DndContext>
      {completedTasks.map((task) => (
        <div className="today-task-row completed-row" key={task.id}>
          <button className="task-complete completed" onClick={() => pomodoro.toggleTask(task.id)} aria-label={`Reopen ${task.title}`}><Check aria-hidden="true" /></button>
          <div className="task-focus-choice">
            <span className="completed">{task.title}</span>
            <small>{taskProgressLabel(task)}</small>
          </div>
          <div className="task-row-actions">
            <button className="task-icon-button" onClick={() => pomodoro.removeTask(task.id)} aria-label={`Remove ${task.title}`}><X aria-hidden="true" /></button>
          </div>
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
  task: GuestTask
  pomodoro: PomodoroApi
  editing: boolean
  onEditingChange: (editing: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: editing })

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`today-task-row ${pomodoro.selectedTaskId === task.id ? "selected" : ""} ${isDragging ? "dragging" : ""}`}>
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
          <button ref={setActivatorNodeRef} className="task-drag-handle" {...attributes} {...listeners} aria-label={`Reorder ${task.title}`}>
            <GripVertical aria-hidden="true" />
          </button>
          <button className="task-complete" onClick={() => pomodoro.toggleTask(task.id)} aria-label={`Complete ${task.title}`} />
          <button className="task-focus-choice" disabled={!pomodoro.canSelectTask} aria-pressed={pomodoro.selectedTaskId === task.id} onClick={() => pomodoro.selectTask(task.id)}>
            <span>{task.title}</span>
            {task.priority !== "normal" ? <b className={`task-priority ${task.priority}`}>{priorityLabels[task.priority]}</b> : null}
            <small>{taskProgressLabel(task)}</small>
          </button>
          <div className="task-row-actions">
            <button className="task-icon-button" onClick={() => onEditingChange(true)} aria-label={`Edit ${task.title}`}><Pencil aria-hidden="true" /></button>
            <button className="task-icon-button" onClick={() => pomodoro.removeTask(task.id)} aria-label={`Remove ${task.title}`}><X aria-hidden="true" /></button>
          </div>
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
  task: GuestTask
  onSave: (changes: { title: string; priority: TaskPriority; estimatedPomodoros: number | null }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = React.useState(task.title)
  const [priority, setPriority] = React.useState<TaskPriority>(task.priority)
  const [estimate, setEstimate] = React.useState(task.estimatedPomodoros === null ? "" : String(task.estimatedPomodoros))
  const parsedEstimate = estimate.trim() === "" ? null : Number(estimate)
  const estimateValid = parsedEstimate === null || (Number.isInteger(parsedEstimate) && parsedEstimate >= 1 && parsedEstimate <= 20)
  const titleValid = Boolean(title.trim())

  return (
    <form
      className="task-edit-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!titleValid || !estimateValid) return
        onSave({ title: title.trim(), priority, estimatedPomodoros: parsedEstimate })
      }}
      onKeyDown={(event) => { if (event.key === "Escape") onCancel() }}
    >
      <input type="text" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} aria-label={`Title for ${task.title}`} autoFocus />
      <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
        <SelectTrigger size="default" className="text-xs" aria-label={`Priority for ${task.title}`}>
          <SelectValue />
        </SelectTrigger>
        {/* The content portals to <body>, outside the always-dark shell. */}
        <SelectContent className="dark">
          {taskPriorities.map((value) => <SelectItem key={value} value={value}>{priorityLabels[value]}</SelectItem>)}
        </SelectContent>
      </Select>
      <input type="number" min={1} max={20} step={1} value={estimate} placeholder="Est." onChange={(event) => setEstimate(event.target.value)} aria-label={`Estimated pomodoros for ${task.title}`} aria-invalid={!estimateValid} />
      <button type="submit" className="task-icon-button save" disabled={!titleValid || !estimateValid} aria-label={`Save changes to ${task.title}`}><Check aria-hidden="true" /></button>
      <button type="button" className="task-icon-button" onClick={onCancel} aria-label={`Cancel editing ${task.title}`}><X aria-hidden="true" /></button>
    </form>
  )
}
