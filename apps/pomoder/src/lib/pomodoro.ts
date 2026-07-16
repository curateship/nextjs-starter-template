export type TimerMode = "focus" | "short" | "long"

export type PomodoroTimer = {
  mode: TimerMode
  durationMinutes: number
  remainingSeconds: number
  running: boolean
  targetTimestamp: number | null
}

export type TaskPriority = "low" | "normal" | "high"

export const taskPriorities: readonly TaskPriority[] = ["low", "normal", "high"]

export type GuestTask = {
  id: string
  title: string
  completed: boolean
  pomodoros: number
  priority: TaskPriority
  estimatedPomodoros: number | null
}

export function normalizeTaskPriority(value: unknown): TaskPriority {
  return taskPriorities.includes(value as TaskPriority) ? (value as TaskPriority) : "normal"
}

export function normalizeEstimatedPomodoros(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20 ? value : null
}

export function normalizeGuestTasks(value: unknown): GuestTask[] | null {
  if (!Array.isArray(value)) return null
  const tasks: GuestTask[] = []
  for (const entry of value) {
    const task = entry as Partial<GuestTask> | null
    if (!task || typeof task.id !== "string" || typeof task.title !== "string") continue
    tasks.push({
      id: task.id,
      title: task.title.slice(0, 160),
      completed: task.completed === true,
      pomodoros: typeof task.pomodoros === "number" && Number.isInteger(task.pomodoros) && task.pomodoros >= 0 ? task.pomodoros : 0,
      priority: normalizeTaskPriority(task.priority),
      estimatedPomodoros: normalizeEstimatedPomodoros(task.estimatedPomodoros),
    })
  }
  return tasks
}

// Display and storage order: active tasks in the user's chosen order, then
// completed tasks, each group keeping its previous relative order.
export function orderTasksForDisplay(tasks: GuestTask[]) {
  return [...tasks.filter((task) => !task.completed), ...tasks.filter((task) => task.completed)]
}

export function applyActiveTaskOrder(tasks: GuestTask[], orderedActiveIds: readonly string[]) {
  const activeIds = tasks.filter((task) => !task.completed).map((task) => task.id)
  const unique = new Set(orderedActiveIds)
  if (unique.size !== orderedActiveIds.length || activeIds.length !== unique.size || activeIds.some((id) => !unique.has(id))) return null
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const orderedActives = orderedActiveIds.map((id) => byId.get(id) as GuestTask)
  return [...orderedActives, ...tasks.filter((task) => task.completed)]
}

export function taskProgressLabel(task: Pick<GuestTask, "pomodoros" | "estimatedPomodoros">) {
  if (task.estimatedPomodoros !== null) return `${task.pomodoros}/${task.estimatedPomodoros} pomos`
  return `${task.pomodoros} ${task.pomodoros === 1 ? "pomo" : "pomos"}`
}

export function normalizeDailyGoalSessions(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20 ? value : 4
}

export function createTimer(mode: TimerMode, durationMinutes: number): PomodoroTimer {
  return {
    mode,
    durationMinutes,
    remainingSeconds: durationMinutes * 60,
    running: false,
    targetTimestamp: null,
  }
}

export function getRemainingSeconds(timer: PomodoroTimer, timestamp = Date.now()) {
  if (!timer.running || timer.targetTimestamp === null) return timer.remainingSeconds
  return Math.max(0, Math.ceil((timer.targetTimestamp - timestamp) / 1000))
}

export function startTimer(timer: PomodoroTimer, timestamp = Date.now()): PomodoroTimer {
  const remainingSeconds = getRemainingSeconds(timer, timestamp)
  return {
    ...timer,
    running: true,
    remainingSeconds,
    targetTimestamp: timestamp + remainingSeconds * 1000,
  }
}

export function pauseTimer(timer: PomodoroTimer, timestamp = Date.now()): PomodoroTimer {
  return {
    ...timer,
    running: false,
    remainingSeconds: getRemainingSeconds(timer, timestamp),
    targetTimestamp: null,
  }
}

export function resetTimer(timer: PomodoroTimer): PomodoroTimer {
  return createTimer(timer.mode, timer.durationMinutes)
}

export function toggleTask(tasks: GuestTask[], taskId: string) {
  return tasks.map((task) =>
    task.id === taskId ? { ...task, completed: !task.completed } : task
  )
}

export function resolveSelectedTaskId(tasks: GuestTask[], selectedTaskId: unknown) {
  if (typeof selectedTaskId !== "string") return null
  return tasks.some((task) => task.id === selectedTaskId && !task.completed) ? selectedTaskId : null
}

export function incrementTaskPomodoros(tasks: GuestTask[], taskId: string) {
  return tasks.map((task) => task.id === taskId && !task.completed ? { ...task, pomodoros: task.pomodoros + 1 } : task)
}
