/**
 * The task list's browser-side shapes and arithmetic, ported from the old
 * app's lib/pomodoro.ts. A TaskItem is the screen's view of a task row:
 * active or completed, with its finished-focus count and optional estimate.
 */

import { formatShortDay } from "@/lib/format/calendar-day"
import { plural } from "@/lib/format/plural"
import { shiftLocalDate } from "@/lib/pomodoro/focus-history"
import type { TaskStepItem } from "@/lib/pomodoro/task-steps"

export type TaskPriority = "low" | "normal" | "high"

/**
 * What a new-task box says when it is sent with nothing in it, by Enter or by
 * the timer's Add task button, so it names neither.
 */
export const BLANK_TASK_TITLE = "Type what the task is first."

export const taskPriorities: readonly TaskPriority[] = ["low", "normal", "high"]

export type TaskItem = {
  id: string
  title: string
  completed: boolean
  pomodoros: number
  priority: TaskPriority
  estimatedPomodoros: number | null
  /** The day it has to be done by, `yyyy-mm-dd`, or null for no deadline. */
  dueDate: string | null
  /** The repeat rule's picked days as a seven-bit set, or null for no repeat. */
  repeatWeekdays: number | null
  projectId: string | null
  projectName: string | null
  /** The checklist under the task, in order. Always empty for a guest. */
  steps: TaskStepItem[]
  /** Up to three short labels. Always empty for a guest. */
  tags: string[]
}

/**
 * A task row as the server sends it, flattened with its rule's days, its
 * project's name, its steps and its tags. The store and the planned-day list
 * both read it through `taskItemFromServer`.
 */
export type ServerTaskRow = {
  id: string
  title: string
  status: string
  pomodoroCount: number
  priority: string
  estimatedPomodoros: number | null
  dueDate: string | null
  repeatWeekdays: number | null
  projectId: string | null
  projectName: string | null
  steps: TaskStepItem[]
  tags: string[]
}

export function taskItemFromServer(task: ServerTaskRow): TaskItem {
  return {
    id: task.id,
    title: task.title,
    completed: task.status === "completed",
    pomodoros: task.pomodoroCount,
    priority: normalizeTaskPriority(task.priority),
    estimatedPomodoros: normalizeEstimatedPomodoros(task.estimatedPomodoros),
    dueDate: normalizeDueDate(task.dueDate),
    repeatWeekdays: task.repeatWeekdays,
    projectId: task.projectId,
    projectName: task.projectName,
    steps: task.steps,
    tags: task.tags,
  }
}

export function normalizeTaskPriority(value: unknown): TaskPriority {
  return taskPriorities.includes(value as TaskPriority)
    ? (value as TaskPriority)
    : "normal"
}

export function normalizeEstimatedPomodoros(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 20
    ? value
    : null
}

/** A stored due date, or null when it is missing or not a `yyyy-mm-dd`. */
export function normalizeDueDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null
}

/**
 * How close a due date is: "later" is grey, "soon" (tomorrow) amber, "due"
 * (today or past) red. The words always say it too, so the colour is never
 * the only sign.
 */
export type DueTone = "later" | "soon" | "due"

const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
})

/**
 * The mark a due date puts on a task row, against the account's today:
 * "Due Nov 14", "Due Fri" inside the coming week, "Due tomorrow", "Due today",
 * "Due yesterday" and "Overdue since Nov 3".
 */
export function dueDateMark(dueDate: string, today: string): {
  text: string
  tone: DueTone
} {
  if (dueDate < shiftLocalDate(today, -1))
    return { text: `Overdue since ${formatShortDay(dueDate)}`, tone: "due" }
  if (dueDate < today) return { text: "Due yesterday", tone: "due" }
  if (dueDate === today) return { text: "Due today", tone: "due" }
  if (dueDate === shiftLocalDate(today, 1))
    return { text: "Due tomorrow", tone: "soon" }
  if (dueDate <= shiftLocalDate(today, 6))
    return {
      text: `Due ${WEEKDAY_SHORT.format(new Date(`${dueDate}T12:00:00Z`))}`,
      tone: "later",
    }
  return { text: `Due ${formatShortDay(dueDate)}`, tone: "later" }
}

/**
 * Display and storage order: active tasks in the user's chosen order, then
 * completed tasks, each group keeping its previous relative order.
 */
export function orderTasksForDisplay(tasks: TaskItem[]) {
  return [
    ...tasks.filter((task) => !task.completed),
    ...tasks.filter((task) => task.completed),
  ]
}

/**
 * Applies a drag's new active order, or returns null when the order does not
 * name today's active tasks exactly once each — the client-side half of the
 * server's TASK_ORDER_MISMATCH contract.
 */
export function applyActiveTaskOrder(
  tasks: TaskItem[],
  orderedActiveIds: readonly string[]
) {
  const activeIds = tasks.filter((task) => !task.completed).map((task) => task.id)
  const unique = new Set(orderedActiveIds)
  if (
    unique.size !== orderedActiveIds.length ||
    activeIds.length !== unique.size ||
    activeIds.some((id) => !unique.has(id))
  )
    return null
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const orderedActives = orderedActiveIds.map((id) => byId.get(id) as TaskItem)
  return [...orderedActives, ...tasks.filter((task) => task.completed)]
}

export function taskProgressLabel(
  task: Pick<TaskItem, "pomodoros" | "estimatedPomodoros">
) {
  if (task.estimatedPomodoros !== null)
    return `${task.pomodoros}/${task.estimatedPomodoros} ${plural(task.estimatedPomodoros, "session")}`
  return `${task.pomodoros} ${plural(task.pomodoros, "session")}`
}

export function toggleTask(tasks: TaskItem[], taskId: string) {
  return tasks.map((task) =>
    task.id === taskId ? { ...task, completed: !task.completed } : task
  )
}

/** A selected task must exist and still be active, or nothing is selected. */
export function resolveSelectedTaskId(
  tasks: TaskItem[],
  selectedTaskId: unknown
) {
  if (typeof selectedTaskId !== "string") return null
  return tasks.some((task) => task.id === selectedTaskId && !task.completed)
    ? selectedTaskId
    : null
}
