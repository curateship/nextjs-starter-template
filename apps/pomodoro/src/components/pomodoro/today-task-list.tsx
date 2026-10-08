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
  GripVerticalIcon,
  ListChecksIcon,
  Loader2Icon,
  PlusIcon,
  RepeatIcon,
  XIcon,
} from "lucide-react"

import { SettingsWindow } from "@/components/pomodoro/settings-window"
import {
  TaskStepList,
  TaskStepsToggle,
} from "@/components/pomodoro/task-steps"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import { focusRing } from "@/lib/layout/focus-ring"
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
  MAX_TASK_TAGS,
  normalizeTagName,
  sameTags,
  TAG_NAME_MAX_LENGTH,
} from "@/lib/pomodoro/task-tags"
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
  "Repeating a task needs an account, because the task is added for you each morning."
const GUEST_PROJECT_REASON =
  "Projects need an account, because they are saved with your focus history."
const GUEST_TAG_REASON =
  "Tags need an account, because History filters your saved sessions by them."

/**
 * Today's tasks, ported from the old app's task-plan-list, and the one list
 * both the timer and the Tasks page draw: drag to reorder by mouse, touch or
 * keyboard with dnd-kit (announced to screen readers), editing in the
 * settings window, complete/reopen, remove, and picking the focus task while
 * the timer is idle. Completed tasks sit in their own group under a "Done
 * today" heading.
 *
 * The two lists draw the same row, drag handle included, so a fix to one list
 * is a fix to both. Tyler asked for dragging on the timer too on 7 Oct 2026.
 * Only a tag filter turns it off. The timer passes `flat`, which takes away
 * the row's own frame and fill and nothing else.
 */
export function TodayTaskList({
  pomodoro,
  tagFilter = null,
  flat = false,
}: {
  pomodoro: PomodoroApi
  /** Shows only the tasks carrying this tag. Dragging is off while it is set. */
  tagFilter?: string | null
  /**
   * Rows without their own frame or fill, for the timer's Tasks card, which
   * is drawn that way. The chosen task keeps its orange bar on the left.
   */
  flat?: boolean
}) {
  const rowClass = flat ? "border-transparent bg-transparent" : undefined
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const activeTasks = pomodoro.tasks.filter((task) => !task.completed)
  const matches = (task: TaskItem) => !tagFilter || task.tags.includes(tagFilter)
  const shownActive = activeTasks.filter(matches)
  const completedTasks = pomodoro.tasks.filter(
    (task) => task.completed && matches(task)
  )
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
    // No space between front-page rows and a 34px row, so they sit 34px
    // apart. Tyler asked for them closer than the design's 44px.
    <div className={cn("flex flex-col", flat ? "gap-0" : "gap-2")}>
      {/* A loading list and an empty list mean opposite things, so the card
          never claims you have nothing while it is still fetching. */}
      {pomodoro.loading && !pomodoro.tasks.length ? (
        <LoadingRow label="Loading your tasks…" className="py-4" />
      ) : null}
      {!pomodoro.loading && !pomodoro.loadFailed && !shownActive.length ? (
        // Inset in a flat card, so the line starts under the card's heading.
        <p className={cn("py-2 text-sm text-muted-foreground", flat && "px-3")}>
          {tagFilter
            ? `No active tasks tagged ${tagFilter}.`
            : "No active tasks. Add one below to choose your next focus."}
        </p>
      ) : null}
      {/* A drag has to name every active task, so a filtered list, which
          shows only some of them, is never draggable. */}
      {!tagFilter ? (
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
                className={rowClass}
                flat={flat}
                {...editingProps(task)}
              />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        shownActive.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            pomodoro={pomodoro}
            className={rowClass}
            flat={flat}
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
              className={rowClass}
              flat={flat}
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
export function NewTaskForm({
  onAdd,
  label = "New task",
  bare = false,
}: {
  /** False when the title was blank and nothing was sent. */
  onAdd: (title: string) => boolean
  label?: string
  /**
   * No frame or fill at rest, for a card that already draws a divider above
   * the box (the timer's Tasks card). Keyboard focus still draws the ring.
   * An Add task button sits at the right end, because a frameless box gives
   * no other sign that it takes a click.
   */
  bare?: boolean
}) {
  const [title, setTitle] = React.useState("")
  // Set by a blank submit and cleared by the next keystroke. The box keeps
  // whatever was in it either way.
  const [invalid, setInvalid] = React.useState(false)

  return (
    <form
      className={cn("relative", bare && "flex items-center gap-2")}
      onSubmit={(event) => {
        event.preventDefault()
        if (!onAdd(title)) {
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
        aria-label={label}
        className={cn(
          "pl-9",
          bare &&
            "border-transparent bg-transparent shadow-none dark:bg-transparent"
        )}
      />
      {/* Never greyed out while the box is empty: pressing it then marks the
          box and says why, the same as Enter does. */}
      {bare ? <Button type="submit">Add task</Button> : null}
    </form>
  )
}

function SortableTaskRow(props: {
  task: TaskItem
  pomodoro: PomodoroApi
  editing: boolean
  onEditingChange: (editing: boolean) => void
  className?: string
  flat?: boolean
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
      // A flat row takes the card fill while it is lifted, so it reads as the
      // thing being carried.
      className={cn(
        props.className,
        isDragging && "z-10 bg-card opacity-80 shadow-lg"
      )}
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
  flat = false,
}: {
  task: TaskItem
  pomodoro: PomodoroApi
  editing: boolean
  onEditingChange: (editing: boolean) => void
  dragHandle?: React.ReactNode
  rowRef?: (node: HTMLElement | null) => void
  style?: React.CSSProperties
  className?: string
  /** The front page's drawing: a round tick, a larger title, the project as a pill. */
  flat?: boolean
}) {
  const selected = pomodoro.selectedTaskId === task.id
  const busy = pomodoro.taskBusy(task.id)
  const { authenticated } = useProductAuth()
  const [stepsOpen, setStepsOpen] = React.useState(false)
  // A guest has no steps to keep, and a finished task with none has nothing
  // to open.
  const showSteps = authenticated && (!task.completed || task.steps.length > 0)

  return (
    <TaskRowFrame
      rowRef={rowRef}
      style={style}
      compact={flat}
      className={cn(
        task.completed ? "bg-card/50" : "bg-card",
        className,
        // After the caller's classes, so a flat row keeps the orange bar.
        selected && "border-l-2 border-l-primary"
      )}
      steps={
        stepsOpen && showSteps ? (
          <TaskStepList
            taskId={task.id}
            taskTitle={task.title}
            steps={task.steps}
            readOnly={task.completed}
            onStepsChange={(update) => pomodoro.setTaskSteps(task.id, update)}
            onClose={() => setStepsOpen(false)}
          />
        ) : null
      }
    >
      {dragHandle}
      <Checkbox
        checked={task.completed}
        disabled={busy}
        onCheckedChange={() => pomodoro.toggleTask(task.id)}
        aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}
        className={cn(
          flat &&
            "mx-1 size-5 rounded-full border-[1.5px] border-muted-foreground/60 dark:bg-transparent"
        )}
      />
      {task.completed ? (
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            flat ? "py-0.5" : "py-2"
          )}
        >
          <span
            className={cn(
              "truncate text-muted-foreground line-through",
              flat ? "text-[15px]" : "text-sm"
            )}
          >
            {task.title}
          </span>
          <TaskMarks task={task} flat={flat} />
        </span>
      ) : (
        <button
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left",
            // Less padding on the front page, so the rows sit closer.
            flat ? "py-0.5" : "py-2",
            focusRing
          )}
          disabled={!pomodoro.canSelectTask}
          aria-pressed={selected}
          // Tapping the chosen task again clears it, which is the only
          // way to focus on nothing.
          onClick={() => pomodoro.selectTask(selected ? null : task.id)}
        >
          <span className={cn("truncate", flat ? "text-[15px]" : "text-sm")}>
            {task.title}
          </span>
          <TaskMarks task={task} flat={flat} />
        </button>
      )}
      {showSteps ? (
        <TaskStepsToggle
          taskTitle={task.title}
          steps={task.steps}
          expanded={stepsOpen}
          onToggle={() => setStepsOpen((open) => !open)}
        />
      ) : null}
      {task.completed ? null : (
        <SettingsWindow
          label={`Edit ${task.title}`}
          open={editing}
          onOpenChange={onEditingChange}
        >
          <TaskEditForm
            task={task}
            projects={pomodoro.liveProjects}
            tagNames={pomodoro.tagNames}
            onAddSteps={
              showSteps && !task.steps.length
                ? () => {
                    onEditingChange(false)
                    setStepsOpen(true)
                  }
                : undefined
            }
            onCancel={() => onEditingChange(false)}
            onSave={async ({ repeatWeekdays, tags, ...changes }) => {
              // The repeat is its own rule row, so it is its own request, and it
              // runs after the task update because the rule copies its title,
              // priority, estimate and project from the task row. A save that
              // failed writes no rule, or the rule would hold a title the task
              // never got.
              //
              // The window closes only once all three have landed. Any failure
              // has already raised the error toast, and the window stays open
              // with the typed changes in it, so Save can be pressed again.
              const saved = await pomodoro.updateTaskDetails(task.id, changes)
              if (!saved) return
              if (
                repeatWeekdays !== task.repeatWeekdays &&
                !(await pomodoro.setTaskRepeat(task.id, repeatWeekdays))
              )
                return
              if (
                !sameTags(tags, task.tags) &&
                !(await pomodoro.setTaskTags(task.id, tags))
              )
                return
              onEditingChange(false)
            }}
          />
        </SettingsWindow>
      )}
      <RemoveTaskButton
        task={task}
        disabled={busy}
        onRemove={() => pomodoro.removeTask(task.id)}
      />
    </TaskRowFrame>
  )
}

/**
 * The bordered box every task row sits in: the row's own line, and under it
 * the steps when they are open. Shared by today's list and a day planned
 * ahead, so the two rows are the same shape.
 */
export function TaskRowFrame({
  rowRef,
  style,
  className,
  steps,
  compact = false,
  children,
}: {
  rowRef?: (node: HTMLElement | null) => void
  style?: React.CSSProperties
  className?: string
  /** The front page's shorter row. */
  compact?: boolean
  steps?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      ref={rowRef}
      style={style}
      className={cn(
        "flex flex-col rounded-lg border transition-colors",
        className,
        // After the caller's classes: a light wash under the pointer, on
        // flat and boxed rows alike.
        "hover:bg-foreground/5"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-2",
          compact ? "min-h-8" : "min-h-9"
        )}
      >
        {children}
      </div>
      {steps}
    </div>
  )
}


/**
 * The X on a task row, which asks before it removes. Tyler asked for the
 * question on 7 Oct 2026: one stray tap used to take a task off the list with
 * no way back. The answer says what is kept, so the question is not scarier
 * than the action.
 */
export function RemoveTaskButton({
  task,
  disabled = false,
  onRemove,
}: {
  task: TaskItem
  disabled?: boolean
  onRemove: () => void
}) {
  const [asking, setAsking] = React.useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        onClick={() => setAsking(true)}
        aria-label={`Remove ${task.title}`}
      >
        <XIcon aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Remove this task?"
        description={
          <>
            {`"${task.title}" comes off your list. Any focus you finished on it stays in History.`}
            {task.repeatWeekdays !== null
              ? " It still comes back on its next repeat day."
              : ""}
          </>
        }
        confirmLabel="Remove task"
        onConfirm={() => {
          setAsking(false)
          onRemove()
        }}
      />
    </>
  )
}

/**
 * The repeat, tag, project and priority marks and the done count, after a
 * title. Tags are the quietest of them, so they never compete with the title.
 */
export function TaskMarks({
  task,
  flat = false,
}: {
  task: TaskItem
  /** The front page's drawing: "in" and the project as a tinted pill, the count in pomos. */
  flat?: boolean
}) {
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
      {task.tags.map((tag) => (
        <span
          key={tag}
          className="hidden max-w-20 truncate text-[10px] text-muted-foreground sm:inline"
        >
          <span className="sr-only">. Tagged </span>#{tag}
        </span>
      ))}
      {task.projectName && flat ? (
        <ProjectPill name={task.projectName} />
      ) : task.projectName ? (
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
        {flat ? pomoLabel(task) : taskProgressLabel(task)}
      </small>
    </>
  )
}

/** "1 pomo", "0 pomos", "1/3 pomos": the front page's count. */
function pomoLabel(task: TaskItem) {
  if (task.estimatedPomodoros !== null)
    return `${task.pomodoros}/${task.estimatedPomodoros} ${plural(task.estimatedPomodoros, "pomo")}`
  return `${task.pomodoros} ${plural(task.pomodoros, "pomo")}`
}

/**
 * Five tints, picked from the project's name so one project keeps its colour
 * on every row and every visit. The same five as the Projects cards.
 */
const PROJECT_TONES = [
  "bg-sky-400/15 text-sky-700 dark:text-sky-300",
  "bg-amber-400/15 text-amber-700 dark:text-amber-300",
  "bg-emerald-400/15 text-emerald-700 dark:text-emerald-300",
  "bg-violet-400/15 text-violet-700 dark:text-violet-300",
  "bg-[color:var(--p-accent)]/15 text-[var(--p-accent)]",
]

function ProjectPill({ name }: { name: string }) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return (
    // Hidden on a phone, the same as tags, so the title keeps the room.
    <>
      <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
        in
      </span>
      <span
        className={cn(
          "hidden min-w-0 sm:inline-flex max-w-40 shrink items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm",
          PROJECT_TONES[hash % PROJECT_TONES.length]
        )}
      >
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
        <span className="truncate">{name}</span>
      </span>
      {/* A phone still names the project to a screen reader. */}
      <span className="sr-only sm:hidden">. In {name}</span>
    </>
  )
}

/**
 * A task's editor, inside the window its settings button opens. A day
 * planned ahead passes
 * `allowRepeat={false}`: a repeat is made by the morning's rollover from
 * today's copy, so it is set on the day itself.
 */
export function TaskEditForm({
  task,
  projects,
  tagNames,
  allowRepeat = true,
  onAddSteps,
  onSave,
  onCancel,
}: {
  task: TaskItem
  projects: PomodoroApi["liveProjects"]
  /** The tags the picker offers. */
  tagNames: readonly string[]
  allowRepeat?: boolean
  /**
   * Shown as "Add steps" while the task has none. On a phone the row hides
   * its empty steps button, so this is where the first step starts.
   */
  onAddSteps?: () => void
  onSave: (changes: {
    title: string
    priority: TaskPriority
    estimatedPomodoros: number | null
    projectId: string | null
    repeatWeekdays: number | null
    tags: string[]
  }) => Promise<void>
  onCancel: () => void
}) {
  const { authenticated } = useProductAuth()
  const id = React.useId()
  const [tags, setTags] = React.useState(task.tags)
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
      className="flex flex-col gap-4"
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
          tags,
        })
        // A successful save closes the window and unmounts this form; on a
        // failure it is still here and goes back to waiting for another press.
        setSaving(false)
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>Title</Label>
        <Input
          id={`${id}-title`}
          required
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={attempted && !titleValid ? true : undefined}
          autoFocus
        />
      </div>
      <div className="flex gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-priority`}>Priority</Label>
          <Select
            value={priority}
            onValueChange={(value) => setPriority(value as TaskPriority)}
          >
            <SelectTrigger id={`${id}-priority`} className="text-xs">
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
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-estimate`}>Estimate</Label>
          <Input
            id={`${id}-estimate`}
            type="number"
            min={1}
            max={20}
            step={1}
            value={estimate}
            placeholder="Sessions"
            onChange={(event) => setEstimate(event.target.value)}
            aria-invalid={!estimateValid || undefined}
            className="w-20"
          />
        </div>
      </div>
      {allowRepeat ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-repeat`}>Repeat</Label>
          <DisabledReason
            className="w-fit"
            reason={GUEST_REPEAT_REASON}
            disabled={!authenticated}
          >
            <Select
              value={repeatChoice}
              disabled={!authenticated}
              onValueChange={(value) => setRepeatChoice(value as RepeatChoice)}
            >
              <SelectTrigger id={`${id}-repeat`} className="text-xs">
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
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-project`}>Project</Label>
        <DisabledReason
          className="w-fit"
          reason={
            authenticated
              ? "Add a project on the Tasks page before a task can go in one."
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
            <SelectTrigger id={`${id}-project`} className="text-xs">
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
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-tag`}>Tags</Label>
        <TagEditor
          inputId={`${id}-tag`}
          taskTitle={task.title}
          tags={tags}
          tagNames={tagNames}
          disabled={!authenticated}
          onChange={setTags}
        />
      </div>
      <div className="flex items-center gap-2">
        {onAddSteps ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-auto"
            onClick={onAddSteps}
          >
            <ListChecksIcon aria-hidden="true" />
            Add steps
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(!onAddSteps && "ml-auto")}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={saving || !estimateValid || !daysValid}
          aria-label={`Save changes to ${task.title}`}
        >
          {saving ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : null}
          Save changes
        </Button>
      </div>
    </form>
  )
}

/**
 * A task's tags inside its editor: the ones it has, each with a remove
 * button, and a box that adds one. Enter adds what was typed; the tags the
 * account used lately are offered as buttons under the box while typing.
 * Nothing is saved until the editor's own Save.
 */
function TagEditor({
  inputId,
  taskTitle,
  tags,
  tagNames,
  disabled,
  onChange,
}: {
  inputId: string
  taskTitle: string
  tags: string[]
  tagNames: readonly string[]
  disabled: boolean
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = React.useState("")
  const full = tags.length >= MAX_TASK_TAGS
  const needle = normalizeTagName(draft)
  const suggestions = tagNames
    .filter((name) => !tags.includes(name) && (!needle || name.startsWith(needle)))
    .slice(0, 5)
  const add = (name: string) => {
    const clean = normalizeTagName(name)
    if (!clean || full) return
    if (!tags.includes(clean)) onChange([...tags, clean])
    setDraft("")
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-7 items-center gap-0.5 rounded-md border pl-2 text-xs text-muted-foreground"
        >
          #{tag}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onChange(tags.filter((one) => one !== tag))}
            aria-label={`Remove the tag ${tag} from ${taskTitle}`}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </span>
      ))}
      {full ? (
        <small className="text-xs text-muted-foreground">
          {MAX_TASK_TAGS} tags is the most a task holds.
        </small>
      ) : (
        <DisabledReason reason={GUEST_TAG_REASON} disabled={disabled}>
          <Input
            id={inputId}
            value={draft}
            disabled={disabled}
            maxLength={TAG_NAME_MAX_LENGTH}
            placeholder="Add a tag…"
            aria-label={`Add a tag to ${taskTitle}`}
            onChange={(event) => setDraft(event.target.value)}
            // Enter here adds the tag rather than saving the whole task.
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              add(draft)
            }}
            className="h-7 w-32 text-xs"
          />
        </DisabledReason>
      )}
      {!full && !disabled
        ? suggestions.map((name) => (
            <Button
              key={name}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => add(name)}
              aria-label={`Tag ${taskTitle} ${name}`}
            >
              #{name}
            </Button>
          ))
        : null}
    </div>
  )
}
