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
import {
  CheckIcon,
  GripVerticalIcon,
  Loader2Icon,
  PlusIcon,
  RepeatIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { showErrorToast } from "@/lib/toast/error-toast"
import { focusRing } from "@/lib/layout/focus-ring"
import { PAUSE_TO_CHOOSE_REASON } from "@/lib/pomodoro/disabled-reasons"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import type { usePomodoro } from "@/lib/pomodoro/use-pomodoro"
import {
  BLANK_TASK_TITLE,
  taskPriorities,
  taskProgressLabel,
  type TaskItem,
  type TaskPriority,
} from "@/lib/pomodoro/tasks"
import {
  describeWeekdaySet,
  EVERY_DAY,
  toggleWeekdayInSet,
  weekdayInitials,
  weekdayNames,
  weekdaySetHas,
  WEEKDAYS_MON_TO_FRI,
} from "@/lib/pomodoro/task-repeats"

type PomodoroApi = ReturnType<typeof usePomodoro>

const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
}

const NO_PROJECT = "none"
const repeatChoices = ["never", "daily", "weekdays", "custom"] as const
type RepeatChoice = (typeof repeatChoices)[number]

const repeatChoiceLabels: Record<RepeatChoice, string> = {
  never: "No repeat",
  daily: "Every day",
  weekdays: "Mon to Fri",
  custom: "Chosen days",
}

/** Which of the four options a stored weekday set is showing as. */
function repeatChoiceOf(weekdays: number | null): RepeatChoice {
  if (weekdays === null) return "never"
  if (weekdays === EVERY_DAY) return "daily"
  if (weekdays === WEEKDAYS_MON_TO_FRI) return "weekdays"
  return "custom"
}

const GUEST_REPEAT_REASON =
  "Repeating a task needs an account, because the copy is made on the server each morning."
const GUEST_PROJECT_REASON =
  "Projects need an account, because they are saved with your focus history."

/**
 * Today's tasks, ported from the old app's task-plan-list, and the one list
 * both the timer and the Tasks page draw: drag to reorder by mouse, touch or
 * keyboard with dnd-kit (announced to screen readers), inline edit with
 * priority and a 1-20 estimate, complete/reopen, remove, and picking the focus
 * task while the timer is idle. Completed tasks sit in their own group under a
 * "Done today" heading.
 *
 * `reorderable` is the one thing the timer turns off: its card has no room for
 * a drag handle, and the Tasks page is where the day is planned. Everything
 * else, down to the row, is shared, so a fix to one list is a fix to both.
 */
export function TodayTaskList({
  pomodoro,
  reorderable = true,
}: {
  pomodoro: PomodoroApi
  reorderable?: boolean
}) {
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

  const editingProps = (task: TaskItem) => ({
    editing: editingId === task.id,
    onEditingChange: (editing: boolean) =>
      setEditingId(editing ? task.id : null),
  })

  return (
    <div className="flex flex-col gap-2">
      {/* A loading list and an empty list mean opposite things, so the card
          never claims you have nothing while it is still fetching. */}
      {pomodoro.loading && !pomodoro.tasks.length ? (
        <LoadingRow label="Loading your tasks…" className="py-4" />
      ) : null}
      {!pomodoro.loading && !pomodoro.loadFailed && !activeTasks.length ? (
        <p className="py-2 text-sm text-muted-foreground">
          No active tasks. Add one below to choose your next focus.
        </p>
      ) : null}
      {reorderable ? (
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
                {...editingProps(task)}
              />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        activeTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            pomodoro={pomodoro}
            {...editingProps(task)}
          />
        ))
      )}
      {completedTasks.length ? (
        <section
          aria-labelledby="done-today-heading"
          className="flex flex-col gap-2 pt-2"
        >
          <h3
            id="done-today-heading"
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
          >
            Done today · {completedTasks.length}
          </h3>
          {completedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              pomodoro={pomodoro}
              editing={false}
              onEditingChange={() => undefined}
            />
          ))}
        </section>
      ) : null}
    </div>
  )
}

/**
 * The box under either list that adds a task. Shared, so the timer and the
 * Tasks page refuse a blank title the same way: nothing is sent, the text
 * stays, the box is marked and the toast says why.
 */
export function NewTaskForm({ pomodoro }: { pomodoro: PomodoroApi }) {
  const [title, setTitle] = React.useState("")
  // Set by a blank submit and cleared by the next keystroke. The box keeps
  // whatever was in it either way.
  const [invalid, setInvalid] = React.useState(false)

  return (
    <form
      className="relative"
      onSubmit={(event) => {
        event.preventDefault()
        if (!pomodoro.addTask(title)) {
          setInvalid(true)
          showErrorToast(BLANK_TASK_TITLE)
          return
        }
        setTitle("")
      }}
    >
      <PlusIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={title}
        onChange={(event) => {
          setTitle(event.target.value)
          setInvalid(false)
        }}
        aria-invalid={invalid || undefined}
        maxLength={160}
        placeholder="Add a task, press Enter…"
        aria-label="New task"
        className="pl-9"
      />
    </form>
  )
}

function SortableTaskRow(props: {
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
  } = useSortable({ id: props.task.id, disabled: props.editing })

  return (
    <TaskRow
      {...props}
      rowRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "z-10 opacity-80 shadow-lg")}
      dragHandle={
        // 28px, the rulebook's small control, so a keyboard landing on it
        // can see where it is.
        <button
          ref={setActivatorNodeRef}
          className={cn(
            "grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
            focusRing
          )}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${props.task.title}`}
        >
          <GripVerticalIcon className="size-4" aria-hidden="true" />
        </button>
      }
    />
  )
}

/**
 * One task, wherever it is listed. An active row can be picked as the focus
 * task and edited; a completed one is struck through and can only be reopened
 * or removed, because the server refuses edits to a finished task. Both carry
 * the same repeat, project and priority marks.
 */
function TaskRow({
  task,
  pomodoro,
  editing,
  onEditingChange,
  dragHandle,
  rowRef,
  style,
  className,
}: {
  task: TaskItem
  pomodoro: PomodoroApi
  editing: boolean
  onEditingChange: (editing: boolean) => void
  dragHandle?: React.ReactNode
  rowRef?: (node: HTMLElement | null) => void
  style?: React.CSSProperties
  className?: string
}) {
  const selected = pomodoro.selectedTaskId === task.id
  const busy = pomodoro.taskBusy(task.id)

  return (
    <div
      ref={rowRef}
      style={style}
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-lg border px-2",
        task.completed ? "bg-card/50" : "bg-card",
        selected && "border-l-2 border-l-primary",
        className
      )}
    >
      {editing ? (
        <TaskEditForm
          task={task}
          projects={pomodoro.liveProjects}
          onCancel={() => onEditingChange(false)}
          onSave={async ({ repeatWeekdays, ...changes }) => {
            // The repeat is its own rule row, so it is its own request, and it
            // runs after the task update because the rule copies its title,
            // priority, estimate and project from the task row. A save that
            // failed writes no rule, or the rule would hold a title the task
            // never got.
            //
            // The row closes only once both have landed. Either failure has
            // already raised the error toast, and the row stays open with the
            // typed changes still in it, so Save can simply be pressed again.
            const saved = await pomodoro.updateTaskDetails(task.id, changes)
            if (!saved) return
            if (
              repeatWeekdays !== task.repeatWeekdays &&
              !(await pomodoro.setTaskRepeat(task.id, repeatWeekdays))
            )
              return
            onEditingChange(false)
          }}
        />
      ) : (
        <>
          {dragHandle}
          <Checkbox
            checked={task.completed}
            disabled={busy}
            onCheckedChange={() => pomodoro.toggleTask(task.id)}
            aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}
          />
          {task.completed ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 py-2">
              <span className="truncate text-sm text-muted-foreground line-through">
                {task.title}
              </span>
              <TaskMarks task={task} />
            </span>
          ) : (
            <DisabledReason
              className="min-w-0 flex-1"
              disabled={!pomodoro.canSelectTask}
              reason={PAUSE_TO_CHOOSE_REASON}
            >
              <button
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 text-left",
                  focusRing
                )}
                disabled={!pomodoro.canSelectTask}
                aria-pressed={selected}
                // Tapping the chosen task again clears it, which is the only
                // way to focus on nothing.
                onClick={() => pomodoro.selectTask(selected ? null : task.id)}
              >
                <span className="truncate text-sm">{task.title}</span>
                <TaskMarks task={task} />
              </button>
            </DisabledReason>
          )}
          {task.completed ? null : (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEditingChange(true)}
              aria-label={`Edit ${task.title}`}
            >
              <SettingsIcon aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
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

/** The repeat, project and priority marks and the done count, after a title. */
function TaskMarks({ task }: { task: TaskItem }) {
  return (
    <>
      {/* The repeat rule is in the row's own words rather than a tooltip on
          a bare icon, which nothing could focus. */}
      {task.repeatWeekdays !== null ? (
        <>
          <RepeatIcon
            className="size-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">
            . Repeats {describeWeekdaySet(task.repeatWeekdays)}
          </span>
        </>
      ) : null}
      {task.projectName ? (
        <b className="max-w-28 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {task.projectName}
        </b>
      ) : null}
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
    </>
  )
}

function TaskEditForm({
  task,
  projects,
  onSave,
  onCancel,
}: {
  task: TaskItem
  projects: PomodoroApi["liveProjects"]
  onSave: (changes: {
    title: string
    priority: TaskPriority
    estimatedPomodoros: number | null
    projectId: string | null
    repeatWeekdays: number | null
  }) => Promise<void>
  onCancel: () => void
}) {
  const { authenticated } = useProductAuth()
  const [saving, setSaving] = React.useState(false)
  // Shown only once a save has been tried, so a field being emptied on the
  // way to new words is not marked as a mistake mid-edit.
  const [attempted, setAttempted] = React.useState(false)
  const [title, setTitle] = React.useState(task.title)
  const [priority, setPriority] = React.useState<TaskPriority>(task.priority)
  const [projectId, setProjectId] = React.useState(task.projectId)
  const [estimate, setEstimate] = React.useState(
    task.estimatedPomodoros === null ? "" : String(task.estimatedPomodoros)
  )
  const [repeatChoice, setRepeatChoice] = React.useState<RepeatChoice>(
    repeatChoiceOf(task.repeatWeekdays)
  )
  // Kept apart from the choice so ticking days off down to none, then picking
  // Mon to Fri, does not lose what was there. The choice decides what is sent.
  const [pickedDays, setPickedDays] = React.useState(
    task.repeatWeekdays ?? WEEKDAYS_MON_TO_FRI
  )
  const parsedEstimate = estimate.trim() === "" ? null : Number(estimate)
  const estimateValid =
    parsedEstimate === null ||
    (Number.isInteger(parsedEstimate) &&
      parsedEstimate >= 1 &&
      parsedEstimate <= 20)
  const titleValid = Boolean(title.trim())
  // A rule with no day picked would repeat on no day, which the database
  // refuses. Save stays reachable; the day row carries the explanation.
  const daysValid = repeatChoice !== "custom" || pickedDays > 0
  const repeatWeekdays =
    repeatChoice === "never"
      ? null
      : repeatChoice === "daily"
        ? EVERY_DAY
        : repeatChoice === "weekdays"
          ? WEEKDAYS_MON_TO_FRI
          : pickedDays
  const projectsAvailable = authenticated && projects.length > 0

  return (
    <form
      className="flex flex-1 flex-col gap-2 py-1.5"
      onSubmit={async (event) => {
        event.preventDefault()
        setAttempted(true)
        if (saving) return
        if (!titleValid) {
          showErrorToast("A task needs a title before it can be saved.")
          return
        }
        if (!estimateValid || !daysValid) return
        setSaving(true)
        await onSave({
          title: title.trim(),
          priority,
          estimatedPomodoros: parsedEstimate,
          projectId,
          repeatWeekdays,
        })
        // A successful save unmounts this form; on a failure it is still
        // here and goes back to waiting for another press.
        setSaving(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel()
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          required
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label={`Title for ${task.title}`}
          aria-invalid={attempted && !titleValid ? true : undefined}
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
          disabled={saving || !estimateValid || !daysValid}
          aria-label={
            saving
              ? `Saving changes to ${task.title}`
              : `Save changes to ${task.title}`
          }
        >
          {saving ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <CheckIcon aria-hidden="true" />
          )}
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
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DisabledReason reason={GUEST_REPEAT_REASON} disabled={!authenticated}>
          <Select
            value={repeatChoice}
            disabled={!authenticated}
            onValueChange={(value) => setRepeatChoice(value as RepeatChoice)}
          >
            <SelectTrigger
              className="text-xs"
              aria-label={`Repeat for ${task.title}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {repeatChoices.map((value) => (
                <SelectItem key={value} value={value}>
                  {repeatChoiceLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DisabledReason>
        <DisabledReason
          reason={
            authenticated
              ? "Add a project below before a task can go in one."
              : GUEST_PROJECT_REASON
          }
          disabled={!projectsAvailable}
        >
          <Select
            value={projectId ?? NO_PROJECT}
            disabled={!projectsAvailable}
            onValueChange={(value) =>
              setProjectId(value === NO_PROJECT ? null : value)
            }
          >
            <SelectTrigger
              className="text-xs"
              aria-label={`Project for ${task.title}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DisabledReason>
        {repeatChoice === "custom" ? (
          <div
            role="group"
            aria-label={`Days ${task.title} repeats on`}
            className="flex items-center gap-1"
          >
            {weekdayInitials.map((initial, weekday) => {
              const picked = weekdaySetHas(pickedDays, weekday)
              return (
                <Button
                  key={weekdayNames[weekday]}
                  type="button"
                  size="icon-sm"
                  variant={picked ? "default" : "outline"}
                  aria-pressed={picked}
                  aria-label={weekdayNames[weekday]}
                  onClick={() =>
                    setPickedDays(toggleWeekdayInSet(pickedDays, weekday))
                  }
                >
                  <span aria-hidden="true" className="text-[10px]">
                    {initial}
                  </span>
                </Button>
              )
            })}
          </div>
        ) : null}
        {!daysValid ? (
          <small role="alert" className="text-xs text-destructive">
            Pick at least one day.
          </small>
        ) : null}
      </div>
    </form>
  )
}
