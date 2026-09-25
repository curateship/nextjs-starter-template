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
} from "@/lib/api/pomodoro/productivity"
import { productAuth, subscribeProductAuth } from "@/lib/pomodoro/auth-state"
import {
  completionAlertMessage,
  fireCompletionAlert,
} from "@/lib/pomodoro/completion-alerts"
import {
  GUEST_STATE_KEY,
  readGuestJson,
  writeGuestJson,
} from "@/lib/pomodoro/guest-storage"
import {
  applyActiveTaskOrder,
  normalizeEstimatedPomodoros,
  normalizeTaskPriority,
  orderTasksForDisplay,
  resolveSelectedTaskId,
  type TaskItem,
  type TaskPriority,
} from "@/lib/pomodoro/tasks"
import {
  browserTimezone,
  createTimer,
  DEFAULT_DURATIONS,
  getRemainingSeconds,
  pauseTimer,
  resetTimer,
  startTimer,
  type PomodoroTimer,
  type TimerMode,
} from "@/lib/pomodoro/timer"

/**
 * The timer as a module-level engine, with `usePomodoro` as React's view of
 * it — the same shape the screens always used.
 *
 * It started as a per-page hook, the old app's design, and that meant a
 * running timer died the moment you navigated: the countdown, the picked
 * task and the open server session all lived in the page. The header's
 * quick controls need the timer on every page, so the state moved here —
 * one countdown per browser session, one server session, pages and the
 * header all reading the same store. Navigating while a focus runs now
 * keeps it running.
 *
 * Data (tasks, preferences, today's summary) rehydrates on every screen
 * mount so a change made elsewhere shows up; the ticking timer itself is
 * never replaced by a reload.
 *
 * Every server call happens outside a state write — StrictMode runs React
 * updaters twice, and one press of Start once wrote two session rows.
 */

export type ArchivedTask = Awaited<
  ReturnType<typeof loadProductivity>
>["archivedTasks"][number]

type PomodoroState = {
  timer: PomodoroTimer
  remainingSeconds: number
  tasks: TaskItem[]
  archive: ArchivedTask[]
  selectedTaskId: string | null
  autoStart: boolean
  cycleFocusSessions: number
  todayFocusSessions: number
  dailyGoalSessions: number
  currentStreak: number
  bestStreak: number
  durations: Record<TimerMode, number>
  serverSessionId: string | null
  syncError: string
}

const initialState: PomodoroState = {
  timer: createTimer("focus", DEFAULT_DURATIONS.focus),
  remainingSeconds: DEFAULT_DURATIONS.focus * 60,
  tasks: [],
  archive: [],
  selectedTaskId: null,
  autoStart: false,
  cycleFocusSessions: 0,
  todayFocusSessions: 0,
  dailyGoalSessions: 4,
  currentStreak: 0,
  bestStreak: 0,
  durations: DEFAULT_DURATIONS,
  serverSessionId: null,
  syncError: "",
}

let state: PomodoroState = initialState
const listeners = new Set<() => void>()
let ticker: number | null = null
let hydrating = false
let completing = false

function emit() {
  for (const listener of listeners) listener()
}

function setState(next: Partial<PomodoroState>) {
  state = { ...state, ...next }
  if (typeof window !== "undefined") {
    if (state.timer.running && ticker === null)
      ticker = window.setInterval(tick, 250)
    if (!state.timer.running && ticker !== null) {
      window.clearInterval(ticker)
      ticker = null
    }
  }
  emit()
}

function announceRunning(running: boolean) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("pomodoro:timer-running", { detail: { running } })
  )
}

function setSyncError(message: string) {
  setState({ syncError: message })
}

/** "Idle" means fully stopped: not running, no live session, not paused midway. */
export function timerIsIdle(current: PomodoroState = state) {
  return (
    !current.timer.running &&
    current.serverSessionId === null &&
    current.timer.remainingSeconds === current.timer.durationMinutes * 60
  )
}

/** Which mode follows a finished one, per the old app's 4-focus cycle. */
export function advanceCycle(mode: TimerMode, cycleFocusSessions: number) {
  const completedFocusSessions =
    mode === "focus"
      ? Math.min(4, cycleFocusSessions + 1)
      : mode === "long"
        ? 0
        : cycleFocusSessions
  const nextMode: TimerMode =
    mode === "focus"
      ? completedFocusSessions === 4
        ? "long"
        : "short"
      : "focus"
  return { nextMode, completedFocusSessions }
}

function beginServerSession(
  mode: TimerMode,
  plannedSeconds: number,
  taskId: string | null
) {
  if (!isAuthed()) return
  void startFocusSession({
    mode,
    plannedSeconds,
    taskId: mode === "focus" ? taskId : null,
    idempotencyKey: crypto.randomUUID(),
    timezone: browserTimezone(),
  })
    .then((session) => {
      if (session) setState({ serverSessionId: session.id })
    })
    .catch(() => setSyncError("Your focus session could not be synced."))
}

function isAuthed() {
  return productAuth().authenticated
}

type GuestSnapshot = {
  timer: PomodoroTimer
  tasks: TaskItem[]
  autoStart: boolean
  cycleFocusSessions: number
  todayFocusSessions: number
  dailyGoalSessions: number
  dailyProgressDate: string
  durations: Record<TimerMode, number>
  selectedTaskId: string | null
}

function browserLocalDate(timestamp = new Date()) {
  const year = timestamp.getFullYear()
  const month = String(timestamp.getMonth() + 1).padStart(2, "0")
  const day = String(timestamp.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

let guestProgressDate = ""
let guestDailyReset: number | null = null

/** A guest's whole session lives in the browser; ticks are never written. */
function persistGuest() {
  if (isAuthed() || typeof window === "undefined") return
  const snapshot: GuestSnapshot = {
    timer: state.timer,
    tasks: state.tasks,
    autoStart: state.autoStart,
    cycleFocusSessions: state.cycleFocusSessions,
    todayFocusSessions: state.todayFocusSessions,
    dailyGoalSessions: state.dailyGoalSessions,
    dailyProgressDate: guestProgressDate || browserLocalDate(),
    durations: state.durations,
    selectedTaskId: state.selectedTaskId,
  }
  writeGuestJson(GUEST_STATE_KEY, snapshot)
}

function storedCount(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, maximum)
    : 0
}

function hydrateGuest() {
  const saved = readGuestJson<Partial<GuestSnapshot>>(GUEST_STATE_KEY)
  const today = browserLocalDate()
  guestProgressDate = today
  const durations =
    saved?.durations &&
    [saved.durations.focus, saved.durations.short, saved.durations.long].every(
      (value) => typeof value === "number" && value >= 1 && value <= 90
    )
      ? saved.durations
      : DEFAULT_DURATIONS
  const tasks = orderTasksForDisplay(
    Array.isArray(saved?.tasks)
      ? saved.tasks
          .filter(
            (task): task is TaskItem =>
              !!task && typeof task.id === "string" && typeof task.title === "string"
          )
          .map((task) => ({
            id: task.id,
            title: String(task.title).slice(0, 160),
            completed: task.completed === true,
            pomodoros: storedCount(task.pomodoros, 100),
            priority: normalizeTaskPriority(task.priority),
            estimatedPomodoros: normalizeEstimatedPomodoros(
              task.estimatedPomodoros
            ),
          }))
      : []
  )
  const sameDay = saved?.dailyProgressDate === today
  const savedTimer = saved?.timer
  const timer: PomodoroTimer =
    savedTimer &&
    ["focus", "short", "long"].includes(savedTimer.mode) &&
    typeof savedTimer.durationMinutes === "number"
      ? {
          mode: savedTimer.mode,
          durationMinutes: savedTimer.durationMinutes,
          remainingSeconds: storedCount(
            savedTimer.remainingSeconds,
            savedTimer.durationMinutes * 60
          ),
          running: savedTimer.running === true,
          targetTimestamp:
            typeof savedTimer.targetTimestamp === "number"
              ? savedTimer.targetTimestamp
              : null,
        }
      : createTimer("focus", durations.focus)
  setState({
    timer,
    remainingSeconds: getRemainingSeconds(timer),
    tasks,
    archive: [],
    selectedTaskId: resolveSelectedTaskId(tasks, saved?.selectedTaskId),
    autoStart: saved?.autoStart === true,
    cycleFocusSessions: storedCount(saved?.cycleFocusSessions, 4),
    todayFocusSessions: sameDay ? storedCount(saved?.todayFocusSessions) : 0,
    dailyGoalSessions:
      typeof saved?.dailyGoalSessions === "number" &&
      Number.isInteger(saved.dailyGoalSessions) &&
      saved.dailyGoalSessions >= 1 &&
      saved.dailyGoalSessions <= 20
        ? saved.dailyGoalSessions
        : 4,
    durations,
    serverSessionId: null,
  })
  announceRunning(timer.running)
  // A guest's "today" resets at the browser's own midnight.
  if (guestDailyReset === null)
    guestDailyReset = window.setInterval(() => {
      if (isAuthed()) return
      const now = browserLocalDate()
      if (guestProgressDate !== now) {
        guestProgressDate = now
        setState({ todayFocusSessions: 0 })
        persistGuest()
      }
    }, 60_000)
}

/** Fresh tasks, preferences and summary; the ticking timer is left alone. */
export function reloadPomodoroData() {
  if (typeof window === "undefined" || hydrating) return Promise.resolve()
  if (!productAuth().known) return Promise.resolve()
  if (!isAuthed()) {
    hydrateGuest()
    return Promise.resolve()
  }
  hydrating = true
  return loadProductivity(browserTimezone())
    .then((data) => {
      const durations = {
        focus: data.preferences.focusMinutes,
        short: data.preferences.shortBreakMinutes,
        long: data.preferences.longBreakMinutes,
      }
      const tasks = orderTasksForDisplay(
        data.tasks
          .filter((task) => ["active", "completed"].includes(task.status))
          .map((task) => ({
            id: task.id,
            title: task.title,
            completed: task.status === "completed",
            pomodoros: task.pomodoroCount,
            priority: normalizeTaskPriority(task.priority),
            estimatedPomodoros: normalizeEstimatedPomodoros(
              task.estimatedPomodoros
            ),
          }))
      )
      const idle = timerIsIdle()
      const timer = idle
        ? createTimer(state.timer.mode, durations[state.timer.mode])
        : state.timer
      setState({
        durations,
        timer,
        remainingSeconds: idle
          ? timer.remainingSeconds
          : state.remainingSeconds,
        autoStart: data.preferences.autoStart,
        tasks,
        archive: data.archivedTasks,
        selectedTaskId: resolveSelectedTaskId(tasks, state.selectedTaskId),
        cycleFocusSessions: data.summary.todayCompletedSessions % 4,
        todayFocusSessions: data.summary.todayCompletedSessions,
        dailyGoalSessions: data.summary.dailyGoalSessions,
        currentStreak: data.summary.currentStreak,
        bestStreak: data.summary.bestStreak,
      })
    })
    .catch(() => setSyncError("Your tasks and settings could not be loaded."))
    .finally(() => {
      hydrating = false
    })
}

function handleCompletion() {
  if (completing) return
  completing = true
  const current = state

  // One chime and notification per finished countdown, gated on the
  // wall-clock end moment so double ticks cannot fire it twice.
  if (current.timer.targetTimestamp !== null)
    fireCompletionAlert(
      `${current.timer.mode}:${current.timer.targetTimestamp}`,
      completionAlertMessage(current.timer.mode)
    )

  if (!isAuthed() && current.timer.mode === "focus") {
    // A guest's finished focus counts locally: today's total and the
    // picked task's own count.
    const selected = resolveSelectedTaskId(current.tasks, current.selectedTaskId)
    setState({
      todayFocusSessions: current.todayFocusSessions + 1,
      tasks: selected
        ? current.tasks.map((task) =>
            task.id === selected && !task.completed
              ? { ...task, pomodoros: task.pomodoros + 1 }
              : task
          )
        : current.tasks,
    })
  }
  if (current.serverSessionId)
    void completeFocusSession({
      sessionId: current.serverSessionId,
      accumulatedSeconds: current.timer.durationMinutes * 60,
      timezone: browserTimezone(),
    })
      .then((result) => {
        if (!result) return
        const updatedTask = result.task
        setState({
          tasks: updatedTask
            ? state.tasks.map((task) =>
                task.id === updatedTask.id
                  ? { ...task, pomodoros: updatedTask.pomodoroCount }
                  : task
              )
            : state.tasks,
          todayFocusSessions: result.summary.todayCompletedSessions,
          dailyGoalSessions: result.summary.dailyGoalSessions,
          currentStreak: result.summary.currentStreak,
          bestStreak: result.summary.bestStreak,
        })
      })
      .catch(() =>
        setSyncError("Your completed focus session could not be synced.")
      )

  const { nextMode, completedFocusSessions } = advanceCycle(
    current.timer.mode,
    current.cycleFocusSessions
  )
  const ready = createTimer(nextMode, current.durations[nextMode])
  const timer = current.autoStart ? startTimer(ready) : ready
  if (current.autoStart)
    beginServerSession(
      nextMode,
      timer.durationMinutes * 60,
      resolveSelectedTaskId(current.tasks, current.selectedTaskId)
    )

  setState({
    timer,
    remainingSeconds: timer.remainingSeconds,
    serverSessionId: null,
    cycleFocusSessions: completedFocusSessions,
  })
  announceRunning(timer.running)
  persistGuest()
  completing = false
}

function tick() {
  const nextRemaining = getRemainingSeconds(state.timer)
  if (nextRemaining !== state.remainingSeconds)
    setState({ remainingSeconds: nextRemaining })
  if (nextRemaining === 0 && state.timer.running) handleCompletion()
}

export function selectMode(mode: TimerMode) {
  if (isAuthed() && state.serverSessionId)
    void cancelFocusSession(state.serverSessionId).catch(() => undefined)
  const timer = createTimer(mode, state.durations[mode])
  setState({
    timer,
    remainingSeconds: timer.remainingSeconds,
    serverSessionId: null,
  })
  announceRunning(false)
  persistGuest()
}

export function toggleTimer() {
  const current = state
  if (current.timer.running) {
    const next = pauseTimer(current.timer)
    if (isAuthed() && current.serverSessionId)
      void pauseFocusSession({
        sessionId: current.serverSessionId,
        accumulatedSeconds:
          current.timer.durationMinutes * 60 - next.remainingSeconds,
      }).catch(() => undefined)
    setState({ timer: next, remainingSeconds: next.remainingSeconds })
    announceRunning(false)
    persistGuest()
    return
  }
  const next = startTimer(current.timer)
  if (isAuthed() && current.serverSessionId) {
    void resumeFocusSession({
      sessionId: current.serverSessionId,
      remainingSeconds: current.timer.remainingSeconds,
    }).catch(() => setSyncError("Your focus session could not be synced."))
  } else {
    beginServerSession(
      current.timer.mode,
      current.timer.durationMinutes * 60,
      resolveSelectedTaskId(current.tasks, current.selectedTaskId)
    )
  }
  setState({ timer: next, remainingSeconds: next.remainingSeconds })
  announceRunning(true)
  persistGuest()
}

export function resetPomodoroTimer() {
  if (isAuthed() && state.serverSessionId)
    void cancelFocusSession(state.serverSessionId).catch(() => undefined)
  const timer = resetTimer(state.timer)
  setState({
    timer,
    remainingSeconds: timer.remainingSeconds,
    serverSessionId: null,
  })
  announceRunning(false)
  persistGuest()
}

export function setAutoStart(autoStart: boolean) {
  if (!isAuthed()) {
    setState({ autoStart })
    persistGuest()
    return
  }
  void updatePreferences({
    focusMinutes: state.durations.focus,
    shortBreakMinutes: state.durations.short,
    longBreakMinutes: state.durations.long,
    dailyGoalSessions: state.dailyGoalSessions,
    autoStart,
  }).catch(() => undefined)
  setState({ autoStart })
}

/**
 * The quick controls' duration steppers and preset buttons. Applies only
 * while the timer is fully idle, returning false otherwise — the caller
 * shows the note.
 */
export function applyDurations(
  durations: Record<TimerMode, number>,
  autoStart: boolean,
  dailyGoalSessions = state.dailyGoalSessions
) {
  if (!timerIsIdle()) return false
  if (!isAuthed()) {
    const timer = createTimer(state.timer.mode, durations[state.timer.mode])
    setState({
      durations,
      autoStart,
      dailyGoalSessions,
      timer,
      remainingSeconds: timer.remainingSeconds,
      serverSessionId: null,
    })
    persistGuest()
    return true
  }
  void updatePreferences({
    focusMinutes: durations.focus,
    shortBreakMinutes: durations.short,
    longBreakMinutes: durations.long,
    dailyGoalSessions,
    autoStart,
  }).catch(() => setSyncError("The timer settings could not be saved."))
  const timer = createTimer(state.timer.mode, durations[state.timer.mode])
  setState({
    durations,
    autoStart,
    dailyGoalSessions,
    timer,
    remainingSeconds: timer.remainingSeconds,
    serverSessionId: null,
  })
  return true
}

export function addTask(title: string) {
  const cleanTitle = title.trim().slice(0, 160)
  if (!cleanTitle) return
  const temporaryId = crypto.randomUUID()
  setState({
    tasks: orderTasksForDisplay([
      ...state.tasks,
      {
        id: temporaryId,
        title: cleanTitle,
        completed: false,
        pomodoros: 0,
        priority: "normal",
        estimatedPomodoros: null,
      },
    ]),
  })
  if (!isAuthed()) {
    persistGuest()
    return
  }
  void createTask(cleanTitle, browserTimezone())
    .then((created) =>
      setState({
        tasks: state.tasks.map((task) =>
          task.id === temporaryId ? { ...task, id: created.id } : task
        ),
        selectedTaskId:
          state.selectedTaskId === temporaryId
            ? created.id
            : state.selectedTaskId,
      })
    )
    .catch(() => {
      setState({
        tasks: state.tasks.filter((task) => task.id !== temporaryId),
        selectedTaskId:
          state.selectedTaskId === temporaryId ? null : state.selectedTaskId,
      })
      setSyncError("The task could not be created.")
    })
}

export function toggleTask(taskId: string) {
  if (!isAuthed()) {
    const tasks = orderTasksForDisplay(
      state.tasks.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      )
    )
    setState({
      tasks,
      selectedTaskId: resolveSelectedTaskId(tasks, state.selectedTaskId),
    })
    persistGuest()
    return
  }
  void togglePersistentTask(taskId, browserTimezone())
    .then((updated) => {
      const tasks = orderTasksForDisplay(
        state.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                completed: updated.status === "completed",
                pomodoros: updated.pomodoroCount,
              }
            : task
        )
      )
      setState({
        tasks,
        selectedTaskId: resolveSelectedTaskId(tasks, state.selectedTaskId),
      })
    })
    .catch(() => setSyncError("The task could not be updated."))
}

export function removeTask(taskId: string) {
  if (!isAuthed()) {
    setState({
      tasks: state.tasks.filter((task) => task.id !== taskId),
      selectedTaskId:
        state.selectedTaskId === taskId ? null : state.selectedTaskId,
    })
    persistGuest()
    return
  }
  void abandonTask(taskId)
    .then(() =>
      setState({
        tasks: state.tasks.filter((task) => task.id !== taskId),
        selectedTaskId:
          state.selectedTaskId === taskId ? null : state.selectedTaskId,
      })
    )
    .catch(() => setSyncError("The task could not be removed."))
}

export function updateTaskDetails(
  taskId: string,
  changes: {
    title?: string
    priority?: TaskPriority
    estimatedPomodoros?: number | null
  }
) {
  const cleanTitle = changes.title?.trim().slice(0, 160)
  if (changes.title !== undefined && !cleanTitle) return
  const applied =
    changes.title !== undefined ? { ...changes, title: cleanTitle } : changes
  const target = state.tasks.find((task) => task.id === taskId)
  if (!target || target.completed) return
  // The pre-change snapshot for rollback, captured before the optimistic
  // update is queued.
  const previousTasks = state.tasks
  setState({
    tasks: state.tasks.map((task) =>
      task.id === taskId && !task.completed ? { ...task, ...applied } : task
    ),
  })
  if (!isAuthed()) {
    persistGuest()
    return
  }
  void updateTask({ taskId, timezone: browserTimezone(), ...applied }).catch(
    () => {
      setState({ tasks: previousTasks })
      setSyncError("The task could not be updated.")
    }
  )
}

export function reorderActiveTasks(orderedTaskIds: string[]) {
  const next = applyActiveTaskOrder(state.tasks, orderedTaskIds)
  if (!next) return
  const previousTasks = state.tasks
  setState({ tasks: next })
  if (!isAuthed()) {
    persistGuest()
    return
  }
  void reorderTasks(orderedTaskIds, browserTimezone()).catch(() => {
    // The server refused the order (someone else changed the list), so
    // roll back and reload the truth — the TASK_ORDER_MISMATCH contract.
    setState({ tasks: previousTasks })
    setSyncError("The new task order could not be saved.")
    void reloadPomodoroData()
  })
}

export function selectTask(taskId: string | null) {
  if (!timerIsIdle()) return
  setState({
    selectedTaskId:
      taskId === null ? null : resolveSelectedTaskId(state.tasks, taskId),
  })
  persistGuest()
}

// Signing in (or out) swaps the data source underneath the engine.
if (typeof window !== "undefined")
  subscribeProductAuth(() => {
    void reloadPomodoroData()
  })

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function pomodoroEngineState() {
  return state
}

const serverSnapshot = initialState

export function usePomodoro() {
  const snapshot = React.useSyncExternalStore(
    subscribe,
    pomodoroEngineState,
    () => serverSnapshot
  )
  // Every consumer mount refreshes the data; the running timer is untouched.
  React.useEffect(() => {
    void reloadPomodoroData()
  }, [])

  const timerIdle = timerIsIdle(snapshot)
  const selectedTask =
    snapshot.tasks.find(
      (task) => task.id === snapshot.selectedTaskId && !task.completed
    ) ?? null

  return {
    ...snapshot,
    selectedTask,
    canSelectTask: timerIdle,
    timerIdle,
    selectMode,
    toggleTimer,
    reset: resetPomodoroTimer,
    setAutoStart,
    applyDurations,
    addTask,
    toggleTask,
    removeTask,
    updateTaskDetails,
    reorderActiveTasks,
    selectTask,
  }
}
