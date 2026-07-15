export type TimerMode = "focus" | "short" | "long"

export type PomodoroTimer = {
  mode: TimerMode
  durationMinutes: number
  remainingSeconds: number
  running: boolean
  targetTimestamp: number | null
}

export type GuestTask = {
  id: string
  title: string
  completed: boolean
  pomodoros: number
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
