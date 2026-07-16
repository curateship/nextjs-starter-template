import * as React from "react"

import {
  abandonTask,
  cancelFocusSession,
  completeFocusSession,
  createTask,
  loadProductivity,
  pauseFocusSession,
  reorderTasks,
  resumeFocusSession,
  startFocusSession,
  togglePersistentTask,
  updatePreferences,
  updateTask,
} from "@/lib/api/productivity"
import { completionAlertMessage, fireCompletionAlert } from "@/lib/completion-alerts"
import {
  applyActiveTaskOrder,
  createTimer,
  getRemainingSeconds,
  incrementTaskPomodoros,
  normalizeDailyGoalSessions,
  normalizeEstimatedPomodoros,
  normalizeGuestTasks,
  normalizeTaskPriority,
  orderTasksForDisplay,
  pauseTimer,
  resetTimer,
  resolveSelectedTaskId,
  startTimer,
  toggleTask,
  type GuestTask,
  type PomodoroTimer,
  type TaskPriority,
  type TimerMode,
} from "@/lib/pomodoro"

const STORAGE_KEY = "pomoder:guest:v1"
const DEFAULT_DURATIONS: Record<TimerMode, number> = { focus: 25, short: 5, long: 15 }

type GuestState = {
  timer: PomodoroTimer
  tasks: GuestTask[]
  autoStart: boolean
  cycleFocusSessions: number
  todayFocusSessions: number
  dailyGoalSessions: number
  dailyProgressDate: string
  durations: Record<TimerMode, number>
  serverSessionId: string | null
  selectedTaskId: string | null
}

const initialState: GuestState = {
  timer: createTimer("focus", DEFAULT_DURATIONS.focus),
  tasks: [
    { id: "pull-request", title: "Review pull request #142", completed: false, pomodoros: 0, priority: "normal", estimatedPomodoros: null },
    { id: "group-sprint", title: "Prep notes for the 6pm group sprint", completed: false, pomodoros: 0, priority: "normal", estimatedPomodoros: null },
    { id: "essay-introduction", title: "Draft the essay introduction", completed: true, pomodoros: 1, priority: "normal", estimatedPomodoros: null },
  ],
  autoStart: false,
  cycleFocusSessions: 0,
  todayFocusSessions: 0,
  dailyGoalSessions: 4,
  dailyProgressDate: "",
  durations: DEFAULT_DURATIONS,
  serverSessionId: null,
  selectedTaskId: null,
}

function canChangeSelectedTask(state: GuestState) {
  return !state.timer.running && state.serverSessionId === null && state.timer.remainingSeconds === state.timer.durationMinutes * 60
}

function browserLocalDate(timestamp = new Date()) {
  const year = timestamp.getFullYear()
  const month = String(timestamp.getMonth() + 1).padStart(2, "0")
  const day = String(timestamp.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function storedSessionCount(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? Math.min(value, maximum) : 0
}

export function usePomodoro(authenticated = false) {
  const [state, setState] = React.useState(initialState)
  const [remainingSeconds, setRemainingSeconds] = React.useState(initialState.timer.remainingSeconds)
  const [hydrated, setHydrated] = React.useState(false)
  const [syncError, setSyncError] = React.useState("")

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<GuestState>
          const tasks = orderTasksForDisplay(normalizeGuestTasks(parsed.tasks) ?? initialState.tasks)
          const today = browserLocalDate()
          const sameDay = parsed.dailyProgressDate === today
          const restored = { ...initialState, ...parsed, tasks, durations: parsed.durations || DEFAULT_DURATIONS, cycleFocusSessions: storedSessionCount(parsed.cycleFocusSessions, 4), todayFocusSessions: sameDay ? storedSessionCount(parsed.todayFocusSessions) : 0, dailyGoalSessions: normalizeDailyGoalSessions(parsed.dailyGoalSessions), dailyProgressDate: today, serverSessionId: null, selectedTaskId: resolveSelectedTaskId(tasks, parsed.selectedTaskId) }
          setState(restored)
          setRemainingSeconds(getRemainingSeconds(restored.timer))
        } else setState((current) => ({ ...current, dailyProgressDate: browserLocalDate() }))
      } catch { window.localStorage.removeItem(STORAGE_KEY) }
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  React.useEffect(() => {
    if (!hydrated || !authenticated) return
    void loadProductivity().then((data) => {
      const durations = { focus: data.preferences.focusMinutes, short: data.preferences.shortBreakMinutes, long: data.preferences.longBreakMinutes }
      const tasks = orderTasksForDisplay(data.tasks.filter((task) => ["active", "completed"].includes(task.status)).map((task) => ({ id: task.id, title: task.title, completed: task.status === "completed", pomodoros: task.pomodoroCount, priority: normalizeTaskPriority(task.priority), estimatedPomodoros: normalizeEstimatedPomodoros(task.estimatedPomodoros) })))
      setState((current) => ({
        ...current,
        durations,
        timer: createTimer(current.timer.mode, durations[current.timer.mode]),
        autoStart: data.preferences.autoStart,
        tasks,
        selectedTaskId: resolveSelectedTaskId(tasks, current.selectedTaskId),
        cycleFocusSessions: data.summary.todayCompletedSessions % 4,
        todayFocusSessions: data.summary.todayCompletedSessions,
        dailyGoalSessions: data.summary.dailyGoalSessions,
        dailyProgressDate: data.today,
        serverSessionId: null,
      }))
    }).catch(() => setSyncError("Your tasks could not be loaded."))
  }, [authenticated, hydrated])

  React.useEffect(() => {
    if (!hydrated || authenticated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [authenticated, hydrated, state])

  React.useEffect(() => {
    if (!hydrated || authenticated) return
    const resetExpiredProgress = () => setState((current) => {
      const today = browserLocalDate()
      return current.dailyProgressDate === today ? current : { ...current, todayFocusSessions: 0, dailyProgressDate: today }
    })
    const interval = window.setInterval(resetExpiredProgress, 60_000)
    return () => window.clearInterval(interval)
  }, [authenticated, hydrated])

  React.useEffect(() => {
    const update = (event: Event) => {
      const { durations, autoStart } = (event as CustomEvent<{ durations: Record<TimerMode, number>; autoStart: boolean }>).detail
      if (authenticated) void updatePreferences({ focusMinutes: durations.focus, shortBreakMinutes: durations.short, longBreakMinutes: durations.long, dailyGoalSessions: state.dailyGoalSessions, autoStart }).catch(() => undefined)
      setState((current) => ({ ...current, durations, autoStart, timer: createTimer(current.timer.mode, durations[current.timer.mode]), serverSessionId: null }))
    }
    window.addEventListener("pomoder:preferences", update)
    return () => window.removeEventListener("pomoder:preferences", update)
  }, [authenticated, state.dailyGoalSessions])

  React.useEffect(() => {
    if (!state.timer.running) {
      const timeout = window.setTimeout(() => setRemainingSeconds(state.timer.remainingSeconds), 0)
      return () => window.clearTimeout(timeout)
    }
    const tick = () => {
      const nextRemaining = getRemainingSeconds(state.timer)
      setRemainingSeconds(nextRemaining)
      if (nextRemaining === 0) {
        if (state.timer.targetTimestamp !== null) fireCompletionAlert(`${state.timer.mode}:${state.timer.targetTimestamp}`, completionAlertMessage(state.timer.mode))
        if (authenticated && state.serverSessionId) void completeFocusSession({ sessionId: state.serverSessionId, accumulatedSeconds: state.timer.durationMinutes * 60 }).then((result) => {
          if (!result) return
          const updatedTask = result.task
          setState((current) => ({
            ...current,
            tasks: updatedTask ? current.tasks.map((task) => task.id === updatedTask.id ? { ...task, pomodoros: updatedTask.pomodoroCount } : task) : current.tasks,
            todayFocusSessions: result.summary.todayCompletedSessions,
            dailyGoalSessions: result.summary.dailyGoalSessions,
            dailyProgressDate: result.today,
          }))
        }).catch(() => setSyncError("Your completed focus session could not be synced."))
        setState((current) => {
          const completedFocus = current.timer.mode === "focus"
          const completedFocusSessions = completedFocus ? Math.min(4, current.cycleFocusSessions + 1) : current.timer.mode === "long" ? 0 : current.cycleFocusSessions
          const nextMode: TimerMode = current.timer.mode === "focus" ? (completedFocusSessions === 4 ? "long" : "short") : "focus"
          const ready = createTimer(nextMode, current.durations[nextMode])
          const timer = current.autoStart ? startTimer(ready) : ready
          if (authenticated && current.autoStart) {
            const taskId = nextMode === "focus" ? resolveSelectedTaskId(current.tasks, current.selectedTaskId) : null
            void startFocusSession({ mode: nextMode, plannedSeconds: timer.durationMinutes * 60, taskId, idempotencyKey: crypto.randomUUID() }).then((session) => { if (session) setState((latest) => ({ ...latest, serverSessionId: session.id })) }).catch(() => setSyncError("Your focus session could not be synced."))
          }
          const tasks = !authenticated && completedFocus && current.selectedTaskId ? incrementTaskPomodoros(current.tasks, current.selectedTaskId) : current.tasks
          const nextState = { ...current, tasks, timer, serverSessionId: null, cycleFocusSessions: completedFocusSessions }
          if (authenticated) return nextState
          const progressDate = browserLocalDate()
          const previousToday = current.dailyProgressDate === progressDate ? current.todayFocusSessions : 0
          return { ...nextState, todayFocusSessions: completedFocus ? previousToday + 1 : previousToday, dailyProgressDate: progressDate }
        })
      }
    }
    tick()
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [authenticated, state.serverSessionId, state.timer])

  const selectMode = React.useCallback((mode: TimerMode) => {
    setState((current) => {
      if (authenticated && current.serverSessionId) void cancelFocusSession(current.serverSessionId).catch(() => undefined)
      return { ...current, timer: createTimer(mode, current.durations[mode]), serverSessionId: null }
    })
  }, [authenticated])

  const toggleTimer = React.useCallback(() => {
    setState((current) => {
      if (current.timer.running) {
        const next = pauseTimer(current.timer)
        if (authenticated && current.serverSessionId) void pauseFocusSession({ sessionId: current.serverSessionId, accumulatedSeconds: current.timer.durationMinutes * 60 - next.remainingSeconds }).catch(() => undefined)
        return { ...current, timer: next }
      }
      const next = startTimer(current.timer)
      if (authenticated) {
        const request = current.serverSessionId
          ? resumeFocusSession({ sessionId: current.serverSessionId, remainingSeconds: current.timer.remainingSeconds })
          : startFocusSession({ mode: current.timer.mode, plannedSeconds: current.timer.durationMinutes * 60, taskId: current.timer.mode === "focus" ? resolveSelectedTaskId(current.tasks, current.selectedTaskId) : null, idempotencyKey: crypto.randomUUID() })
        void request.then((session) => { if (session) setState((latest) => ({ ...latest, serverSessionId: session.id })) }).catch(() => setSyncError("Your focus session could not be synced."))
      }
      return { ...current, timer: next }
    })
  }, [authenticated])

  const reset = React.useCallback(() => setState((current) => {
    if (authenticated && current.serverSessionId) void cancelFocusSession(current.serverSessionId).catch(() => undefined)
    return { ...current, timer: resetTimer(current.timer), serverSessionId: null }
  }), [authenticated])

  const addTask = React.useCallback((title: string) => {
    const cleanTitle = title.trim().slice(0, 160)
    if (!cleanTitle) return
    const temporaryId = crypto.randomUUID()
    setState((current) => ({ ...current, tasks: orderTasksForDisplay([...current.tasks, { id: temporaryId, title: cleanTitle, completed: false, pomodoros: 0, priority: "normal", estimatedPomodoros: null }]) }))
    if (authenticated) void createTask(cleanTitle).then((created) => setState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === temporaryId ? { ...task, id: created.id } : task), selectedTaskId: current.selectedTaskId === temporaryId ? created.id : current.selectedTaskId }))).catch(() => {
      setState((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== temporaryId), selectedTaskId: current.selectedTaskId === temporaryId ? null : current.selectedTaskId }))
      setSyncError("The task could not be created.")
    })
  }, [authenticated])

  const toggleGuestTask = React.useCallback((taskId: string) => {
    if (authenticated) {
      void togglePersistentTask(taskId).then((updated) => setState((current) => {
        const tasks = orderTasksForDisplay(current.tasks.map((task) => task.id === taskId ? { ...task, completed: updated.status === "completed", pomodoros: updated.pomodoroCount } : task))
        return { ...current, tasks, selectedTaskId: resolveSelectedTaskId(tasks, current.selectedTaskId) }
      })).catch(() => setSyncError("The task could not be updated."))
      return
    }
    setState((current) => {
      const tasks = orderTasksForDisplay(toggleTask(current.tasks, taskId))
      return { ...current, tasks, selectedTaskId: resolveSelectedTaskId(tasks, current.selectedTaskId) }
    })
  }, [authenticated])

  const removeTask = React.useCallback((taskId: string) => {
    const remove = () => setState((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== taskId), selectedTaskId: current.selectedTaskId === taskId ? null : current.selectedTaskId }))
    if (authenticated) {
      void abandonTask(taskId).then(remove).catch(() => setSyncError("The task could not be removed."))
      return
    }
    remove()
  }, [authenticated])

  // These two read the rendered state directly so the pre-change snapshot for
  // rollback is captured before the optimistic update is queued.
  const updateTaskDetails = (taskId: string, changes: { title?: string; priority?: TaskPriority; estimatedPomodoros?: number | null }) => {
    const cleanTitle = changes.title?.trim().slice(0, 160)
    if (changes.title !== undefined && !cleanTitle) return
    const applied = changes.title !== undefined ? { ...changes, title: cleanTitle } : changes
    const target = state.tasks.find((task) => task.id === taskId)
    if (!target || target.completed) return
    const previousTasks = state.tasks
    setState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId && !task.completed ? { ...task, ...applied } : task) }))
    if (authenticated) void updateTask({ taskId, ...applied }).catch(() => {
      setState((current) => ({ ...current, tasks: previousTasks }))
      setSyncError("The task could not be updated.")
    })
  }

  const reorderActiveTasks = (orderedTaskIds: string[]) => {
    const next = applyActiveTaskOrder(state.tasks, orderedTaskIds)
    if (!next) return
    const previousTasks = state.tasks
    setState((current) => ({ ...current, tasks: applyActiveTaskOrder(current.tasks, orderedTaskIds) ?? current.tasks }))
    if (authenticated) void reorderTasks(orderedTaskIds).catch(() => {
      setState((current) => ({ ...current, tasks: previousTasks }))
      setSyncError("The new task order could not be saved.")
    })
  }

  const selectTask = React.useCallback((taskId: string | null) => {
    setState((current) => {
      if (!canChangeSelectedTask(current)) return current
      return { ...current, selectedTaskId: taskId === null ? null : resolveSelectedTaskId(current.tasks, taskId) }
    })
  }, [])

  const setAutoStart = React.useCallback((autoStart: boolean) => {
    setState((current) => {
      if (authenticated) void updatePreferences({ focusMinutes: current.durations.focus, shortBreakMinutes: current.durations.short, longBreakMinutes: current.durations.long, dailyGoalSessions: current.dailyGoalSessions, autoStart }).catch(() => undefined)
      return { ...current, autoStart }
    })
  }, [authenticated])

  const setDurations = React.useCallback((durations: Record<TimerMode, number>, dailyGoalSessions?: number) => {
    const goal = dailyGoalSessions ?? state.dailyGoalSessions
    setState((current) => ({ ...current, durations, dailyGoalSessions: goal, timer: createTimer(current.timer.mode, durations[current.timer.mode]), serverSessionId: null }))
    return authenticated ? updatePreferences({ focusMinutes: durations.focus, shortBreakMinutes: durations.short, longBreakMinutes: durations.long, dailyGoalSessions: goal, autoStart: state.autoStart }) : Promise.resolve()
  }, [authenticated, state.autoStart, state.dailyGoalSessions])

  const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId && !task.completed) ?? null

  return { ...state, remainingSeconds, selectedTask, canSelectTask: canChangeSelectedTask(state), syncError, selectTask, selectMode, toggleTimer, reset, addTask, toggleTask: toggleGuestTask, removeTask, updateTaskDetails, reorderActiveTasks, setAutoStart, setDurations }
}
