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
  pauseTimer,
  resetTimer,
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
}

export function usePomodoro(authenticated = false) {
  const [state, setState] = React.useState(initialState)
  const [remainingSeconds, setRemainingSeconds] = React.useState(initialState.timer.remainingSeconds)
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<GuestState>
          const restored = { ...initialState, ...parsed, durations: parsed.durations || DEFAULT_DURATIONS, serverSessionId: null }
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
      setState((current) => ({
        ...current,
        durations,
        timer: createTimer(current.timer.mode, durations[current.timer.mode]),
        autoStart: data.preferences.autoStart,
        tasks: data.tasks.filter((task) => ["active", "completed"].includes(task.status)).map((task) => ({ id: task.id, title: task.title, completed: task.status === "completed", pomodoros: task.pomodoroCount })),
        focusSessions: Math.min(4, data.recentStats.find((day) => day.localDate === data.today)?.focusSessions || 0),
        serverSessionId: null,
      }))
    }).catch(() => undefined)
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
        if (authenticated && state.serverSessionId) void completeFocusSession({ sessionId: state.serverSessionId, accumulatedSeconds: state.timer.durationMinutes * 60 }).catch(() => undefined)
        setState((current) => {
          const completedFocusSessions = current.timer.mode === "focus" ? Math.min(4, current.focusSessions + 1) : current.timer.mode === "long" ? 0 : current.focusSessions
          const nextMode: TimerMode = current.timer.mode === "focus" ? (completedFocusSessions === 4 ? "long" : "short") : "focus"
          const ready = createTimer(nextMode, current.durations[nextMode])
          const timer = current.autoStart ? startTimer(ready) : ready
          if (authenticated && current.autoStart) {
            void startFocusSession({ mode: nextMode, plannedSeconds: timer.durationMinutes * 60, taskId: null, idempotencyKey: crypto.randomUUID() }).then((session) => { if (session) setState((latest) => ({ ...latest, serverSessionId: session.id })) }).catch(() => undefined)
          }
          return { ...current, timer, serverSessionId: null, focusSessions: completedFocusSessions }
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
          : startFocusSession({ mode: current.timer.mode, plannedSeconds: current.timer.durationMinutes * 60, taskId: null, idempotencyKey: crypto.randomUUID() })
        void request.then((session) => { if (session) setState((latest) => ({ ...latest, serverSessionId: session.id })) }).catch(() => undefined)
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
    if (authenticated) void createTask(cleanTitle).then((created) => setState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === temporaryId ? { ...task, id: created.id } : task) }))).catch(() => setState((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== temporaryId) })))
  }, [authenticated])

  const toggleGuestTask = React.useCallback((taskId: string) => {
    setState((current) => ({ ...current, tasks: toggleTask(current.tasks, taskId) }))
    if (authenticated) void togglePersistentTask(taskId).catch(() => setState((current) => ({ ...current, tasks: toggleTask(current.tasks, taskId) })))
  }, [authenticated])

  const removeTask = React.useCallback((taskId: string) => {
    setState((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== taskId) }))
    if (authenticated) void abandonTask(taskId).catch(() => undefined)
  }, [authenticated])

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

  return { ...state, remainingSeconds, selectMode, toggleTimer, reset, addTask, toggleTask: toggleGuestTask, removeTask, setAutoStart, setDurations }
}
