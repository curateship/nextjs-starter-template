/**
 * The task list's browser-side shapes and arithmetic, ported from the old
 * app's lib/pomodoro.ts. A TaskItem is the screen's view of a task row:
 * active or completed, with its finished-focus count and optional estimate.
 */

export type TaskPriority = "low" | "normal" | "high"

export const taskPriorities: readonly TaskPriority[] = ["low", "normal", "high"]

export type TaskItem = {
  id: string
  title: string
  completed: boolean
  pomodoros: number
  priority: TaskPriority
  estimatedPomodoros: number | null
  /** The repeat rule's picked days as a seven-bit set, or null for no repeat. */
  repeatWeekdays: number | null
  projectId: string | null
  projectName: string | null
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
    return `${task.pomodoros}/${task.estimatedPomodoros} pomos`
  return `${task.pomodoros} ${task.pomodoros === 1 ? "pomo" : "pomos"}`
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
