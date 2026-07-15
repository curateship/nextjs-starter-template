import * as React from "react"

import {
  abandonTask,
  cancelFocusSession,
  completeFocusSession,
  createTask,
  loadProductivity,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  togglePersistentTask,
  updatePreferences,
} from "@/lib/api/productivity"
import {
  createTimer,
  getRemainingSeconds,
  incrementTaskPomodoros,
  pauseTimer,
  resetTimer,
  resolveSelectedTaskId,
  startTimer,
  toggleTask,
  type GuestTask,
  type PomodoroTimer,
  type TimerMode,
} from "@/lib/pomodoro"

const STORAGE_KEY = "pomoder:guest:v1"
const DEFAULT_DURATIONS: Record<TimerMode, number> = { focus: 25, short: 5, long: 15 }

type GuestState = {
  timer: PomodoroTimer
  tasks: GuestTask[]
  autoStart: boolean
  focusSessions: number
  durations: Record<TimerMode, number>
  serverSessionId: string | null
  selectedTaskId: string | null
}

const initialState: GuestState = {
  timer: createTimer("focus", DEFAULT_DURATIONS.focus),
  tasks: [
    { id: "essay-introduction", title: "Draft the essay introduction", completed: true, pomodoros: 1 },
    { id: "pull-request", title: "Review pull request #142", completed: false, pomodoros: 0 },
    { id: "group-sprint", title: "Prep notes for the 6pm group sprint", completed: false, pomodoros: 0 },
  ],
  autoStart: false,
  focusSessions: 0,
  durations: DEFAULT_DURATIONS,
  serverSessionId: null,
  selectedTaskId: null,
}

function canChangeSelectedTask(state: GuestState) {
  return !state.timer.running && state.serverSessionId === null && state.timer.remainingSeconds === state.timer.durationMinutes * 60
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
          const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : initialState.tasks
          const restored = { ...initialState, ...parsed, tasks, durations: parsed.durations || DEFAULT_DURATIONS, serverSessionId: null, selectedTaskId: resolveSelectedTaskId(tasks, parsed.selectedTaskId) }
          setState(restored)
          setRemainingSeconds(getRemainingSeconds(restored.timer))
        }
      } catch { window.localStorage.removeItem(STORAGE_KEY) }
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  React.useEffect(() => {
    if (!hydrated || !authenticated) return
    void loadProductivity().then((data) => {
      const durations = { focus: data.preferences.focusMinutes, short: data.preferences.shortBreakMinutes, long: data.preferences.longBreakMinutes }
      const tasks = data.tasks.filter((task) => ["active", "completed"].includes(task.status)).map((task) => ({ id: task.id, title: task.title, completed: task.status === "completed", pomodoros: task.pomodoroCount }))
      setState((current) => ({
        ...current,
        durations,
        timer: createTimer(current.timer.mode, durations[current.timer.mode]),
        autoStart: data.preferences.autoStart,
        tasks,
        selectedTaskId: resolveSelectedTaskId(tasks, current.selectedTaskId),
        focusSessions: Math.min(4, data.recentStats.find((day) => day.localDate === data.today)?.focusSessions || 0),
        serverSessionId: null,
      }))
    }).catch(() => setSyncError("Your tasks could not be loaded."))
  }, [authenticated, hydrated])

  React.useEffect(() => {
    if (!hydrated || authenticated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [authenticated, hydrated, state])

  React.useEffect(() => {
    const update = (event: Event) => {
      const { durations, autoStart } = (event as CustomEvent<{ durations: Record<TimerMode, number>; autoStart: boolean }>).detail
      setState((current) => ({ ...current, durations, autoStart, timer: createTimer(current.timer.mode, durations[current.timer.mode]), serverSessionId: null }))
      if (authenticated) void updatePreferences({ focusMinutes: durations.focus, shortBreakMinutes: durations.short, longBreakMinutes: durations.long, autoStart }).catch(() => undefined)
    }
    window.addEventListener("pomoder:preferences", update)
    return () => window.removeEventListener("pomoder:preferences", update)
  }, [authenticated])

  React.useEffect(() => {
    if (!state.timer.running) {
      const timeout = window.setTimeout(() => setRemainingSeconds(state.timer.remainingSeconds), 0)
      return () => window.clearTimeout(timeout)
    }
    const tick = () => {
      const nextRemaining = getRemainingSeconds(state.timer)
      setRemainingSeconds(nextRemaining)
      if (nextRemaining === 0) {
        if (authenticated && state.serverSessionId) void completeFocusSession({ sessionId: state.serverSessionId, accumulatedSeconds: state.timer.durationMinutes * 60 }).then((result) => {
          const updatedTask = result?.task
          if (updatedTask) setState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === updatedTask.id ? { ...task, pomodoros: updatedTask.pomodoroCount } : task) }))
        }).catch(() => setSyncError("Your completed focus session could not be saved."))
        setState((current) => {
          const completedFocus = current.timer.mode === "focus"
          const completedFocusSessions = completedFocus ? Math.min(4, current.focusSessions + 1) : current.timer.mode === "long" ? 0 : current.focusSessions
          const nextMode: TimerMode = current.timer.mode === "focus" ? (completedFocusSessions === 4 ? "long" : "short") : "focus"
          const ready = createTimer(nextMode, current.durations[nextMode])
          const timer = current.autoStart ? startTimer(ready) : ready
          if (authenticated && current.autoStart) {
            const taskId = nextMode === "focus" ? resolveSelectedTaskId(current.tasks, current.selectedTaskId) : null
            void startFocusSession({ mode: nextMode, plannedSeconds: timer.durationMinutes * 60, taskId, idempotencyKey: crypto.randomUUID() }).then((session) => { if (session) setState((latest) => ({ ...latest, serverSessionId: session.id })) }).catch(() => setSyncError("Your focus session could not be synced."))
          }
          const tasks = !authenticated && completedFocus && current.selectedTaskId ? incrementTaskPomodoros(current.tasks, current.selectedTaskId) : current.tasks
          return { ...current, tasks, timer, serverSessionId: null, focusSessions: completedFocusSessions }
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
    setState((current) => ({ ...current, tasks: [...current.tasks, { id: temporaryId, title: cleanTitle, completed: false, pomodoros: 0 }] }))
    if (authenticated) void createTask(cleanTitle).then((created) => setState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === temporaryId ? { ...task, id: created.id } : task), selectedTaskId: current.selectedTaskId === temporaryId ? created.id : current.selectedTaskId }))).catch(() => {
      setState((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== temporaryId), selectedTaskId: current.selectedTaskId === temporaryId ? null : current.selectedTaskId }))
      setSyncError("The task could not be created.")
    })
  }, [authenticated])

  const toggleGuestTask = React.useCallback((taskId: string) => {
    if (authenticated) {
      void togglePersistentTask(taskId).then((updated) => setState((current) => {
        const tasks = current.tasks.map((task) => task.id === taskId ? { ...task, completed: updated.status === "completed", pomodoros: updated.pomodoroCount } : task)
        return { ...current, tasks, selectedTaskId: resolveSelectedTaskId(tasks, current.selectedTaskId) }
      })).catch(() => setSyncError("The task could not be updated."))
      return
    }
    setState((current) => {
      const tasks = toggleTask(current.tasks, taskId)
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

  const selectTask = React.useCallback((taskId: string | null) => {
    setState((current) => {
      if (!canChangeSelectedTask(current)) return current
      return { ...current, selectedTaskId: taskId === null ? null : resolveSelectedTaskId(current.tasks, taskId) }
    })
  }, [])

  const setAutoStart = React.useCallback((autoStart: boolean) => {
    setState((current) => {
      if (authenticated) void updatePreferences({ focusMinutes: current.durations.focus, shortBreakMinutes: current.durations.short, longBreakMinutes: current.durations.long, autoStart }).catch(() => undefined)
      return { ...current, autoStart }
    })
  }, [authenticated])

  const setDurations = React.useCallback((durations: Record<TimerMode, number>) => {
    setState((current) => {
      if (authenticated) void updatePreferences({ focusMinutes: durations.focus, shortBreakMinutes: durations.short, longBreakMinutes: durations.long, autoStart: current.autoStart }).catch(() => undefined)
      return { ...current, durations, timer: createTimer(current.timer.mode, durations[current.timer.mode]), serverSessionId: null }
    })
  }, [authenticated])

  const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId && !task.completed) ?? null

  return { ...state, remainingSeconds, selectedTask, canSelectTask: canChangeSelectedTask(state), syncError, selectTask, selectMode, toggleTimer, reset, addTask, toggleTask: toggleGuestTask, removeTask, setAutoStart, setDurations }
}
