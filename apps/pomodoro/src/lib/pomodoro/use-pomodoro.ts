import * as React from "react"
import { toast } from "sonner"

import { showErrorToast } from "@/lib/toast/error-toast"
import { findAchievement } from "@/lib/pomodoro/achievements"
import {
  abandonTask,
  cancelFocusSession,
  completeFocusSession,
  createTask,
  loadProductivity,
  pauseFocusSession,
  reorderTasks,
  resumeFocusSession,
  saveFocusSessionNote,
  setTaskRepeatRule,
  startFocusSession,
  togglePersistentTask,
  updatePreferences,
  updateTask,
} from "@/lib/api/pomodoro/productivity"
import {
  createProject as createProjectRequest,
  renameProject as renameProjectRequest,
  setProjectArchived as setProjectArchivedRequest,
} from "@/lib/api/pomodoro/projects"
import { productAuth, subscribeProductAuth } from "@/lib/pomodoro/auth-state"
import { normalizeSessionNote } from "@/lib/pomodoro/session-notes"
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
  normalizeSessionsBeforeLongBreak,
  SESSIONS_BEFORE_LONG_BREAK_DEFAULT,
} from "@/lib/pomodoro/timer-presets"
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

export type ProjectRow = Awaited<
  ReturnType<typeof loadProductivity>
>["projects"][number]

type PomodoroState = {
  timer: PomodoroTimer
  remainingSeconds: number
  tasks: TaskItem[]
  archive: ArchivedTask[]
  projects: ProjectRow[]
  selectedTaskId: string | null
  autoStart: boolean
  cycleFocusSessions: number
  todayFocusSessions: number
  dailyGoalSessions: number
  /** How many focuses this rhythm takes before the long break. */
  sessionsBeforeLongBreak: number
  currentStreak: number
  bestStreak: number
  durations: Record<TimerMode, number>
  serverSessionId: string | null
  /**
   * The focus that just finished, waiting for its one-line note. Set when a
   * focus completes and cleared when the next focus starts, so the prompt is
   * there for the whole break and gone once the work resumes. Never set for a
   * guest, who has no session row to write it on.
   */
  noteSession: { id: string; note: string } | null
  syncError: string
  /**
   * True while the account's tasks, preferences and summary are being
   * fetched, so a screen shows a loading line instead of claiming the list is
   * empty. Starts true because the first load is already owed before the
   * signed-in check has answered. A guest is never loading: the browser
   * snapshot is read synchronously.
   */
  loading: boolean
  /**
   * True when the last load failed. An empty list then means "we do not know"
   * rather than "you have nothing", so the screens hold the empty state back
   * and let the warning line do the talking.
   */
  loadFailed: boolean
  /**
   * The tasks with a tick or a removal still in flight. The row's own
   * checkbox and X do nothing while its id is here, so one press sends one
   * request.
   */
  pendingTaskIds: string[]
}

const initialState: PomodoroState = {
  timer: createTimer("focus", DEFAULT_DURATIONS.focus),
  remainingSeconds: DEFAULT_DURATIONS.focus * 60,
  tasks: [],
  archive: [],
  projects: [],
  selectedTaskId: null,
  autoStart: false,
  cycleFocusSessions: 0,
  todayFocusSessions: 0,
  dailyGoalSessions: 4,
  sessionsBeforeLongBreak: SESSIONS_BEFORE_LONG_BREAK_DEFAULT,
  currentStreak: 0,
  bestStreak: 0,
  durations: DEFAULT_DURATIONS,
  serverSessionId: null,
  noteSession: null,
  syncError: "",
  loading: true,
  loadFailed: false,
  pendingTaskIds: [],
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

/**
 * Takes the warning line down. Called from every request that settles
 * successfully, because a warning left up after the problem has gone trains
 * people to ignore warnings. Checked first so a success while nothing is
 * wrong costs no render.
 */
function clearSyncError() {
  if (state.syncError) setState({ syncError: "" })
}

function markTaskPending(taskId: string) {
  setState({ pendingTaskIds: [...state.pendingTaskIds, taskId] })
}

function releaseTaskPending(taskId: string) {
  setState({
    pendingTaskIds: state.pendingTaskIds.filter((id) => id !== taskId),
  })
}

/** "Idle" means fully stopped: not running, no live session, not paused midway. */
export function timerIsIdle(current: PomodoroState = state) {
  return (
    !current.timer.running &&
    current.serverSessionId === null &&
    current.timer.remainingSeconds === current.timer.durationMinutes * 60
  )
}

/**
 * Which mode follows a finished one. The rhythm says how many focuses earn
 * the long break: four in the classic pattern, two in Deep Work. A count that
 * has somehow overshot its rhythm (the number was lowered mid-cycle) still
 * lands on the long break rather than counting past it for ever.
 */
export function advanceCycle(
  mode: TimerMode,
  cycleFocusSessions: number,
  sessionsBeforeLongBreak = SESSIONS_BEFORE_LONG_BREAK_DEFAULT
) {
  const target = normalizeSessionsBeforeLongBreak(sessionsBeforeLongBreak)
  const completedFocusSessions =
    mode === "focus"
      ? Math.min(target, cycleFocusSessions + 1)
      : mode === "long"
        ? 0
        : cycleFocusSessions
  const nextMode: TimerMode =
    mode === "focus"
      ? completedFocusSessions >= target
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
  // A new focus is the moment the last one stops being the thing you are
  // writing about, so the note prompt goes then — not when the break starts,
  // which with auto-start would be the same instant the prompt appeared.
  if (mode === "focus" && state.noteSession) setState({ noteSession: null })
  void startFocusSession({
    mode,
    plannedSeconds,
    taskId: mode === "focus" ? taskId : null,
    idempotencyKey: crypto.randomUUID(),
    timezone: browserTimezone(),
  })
    .then((session) => {
      clearSyncError()
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
  sessionsBeforeLongBreak: number
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
    sessionsBeforeLongBreak: state.sessionsBeforeLongBreak,
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
            // Repeats and projects are account features: a guest has no
            // rollover to make tomorrow's copy and no project list to pick
            // from, so a guest task always carries neither.
            repeatWeekdays: null,
            projectId: null,
            projectName: null,
          }))
      : []
  )
  const sessionsBeforeLongBreak = normalizeSessionsBeforeLongBreak(
    saved?.sessionsBeforeLongBreak
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
    projects: [],
    selectedTaskId: resolveSelectedTaskId(tasks, saved?.selectedTaskId),
    autoStart: saved?.autoStart === true,
    sessionsBeforeLongBreak,
    cycleFocusSessions: storedCount(
      saved?.cycleFocusSessions,
      sessionsBeforeLongBreak
    ),
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
    loading: false,
    loadFailed: false,
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
  if (!state.loading) setState({ loading: true })
  return loadProductivity(browserTimezone())
    .then((data) => {
      const durations = {
        focus: data.preferences.focusMinutes,
        short: data.preferences.shortBreakMinutes,
        long: data.preferences.longBreakMinutes,
      }
      const sessionsBeforeLongBreak = normalizeSessionsBeforeLongBreak(
        data.preferences.sessionsBeforeLongBreak
      )
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
            repeatWeekdays: task.repeatWeekdays,
            projectId: task.projectId,
            projectName: task.projectName,
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
        projects: data.projects,
        selectedTaskId: resolveSelectedTaskId(tasks, state.selectedTaskId),
        sessionsBeforeLongBreak,
        // Where today's finished focuses leave the cycle. Read against the
        // saved rhythm, so an account on two focuses is on the long break
        // after its second, not its fourth.
        cycleFocusSessions:
          data.summary.todayCompletedSessions % sessionsBeforeLongBreak,
        todayFocusSessions: data.summary.todayCompletedSessions,
        dailyGoalSessions: data.summary.dailyGoalSessions,
        currentStreak: data.summary.currentStreak,
        bestStreak: data.summary.bestStreak,
        syncError: "",
        loadFailed: false,
      })
    })
    .catch(() => {
      setState({
        syncError: "Your tasks and settings could not be loaded.",
        loadFailed: true,
      })
    })
    .finally(() => {
      hydrating = false
      setState({ loading: false })
    })
}

/**
 * A toast for the badges the finished focus just earned. The server answers
 * with the badges it actually recorded, never with the ones already on the
 * account, so a hundredth session that is reported twice congratulates you
 * once.
 *
 * Earning one at a time is the normal case and gets its own toast. Several at
 * once is not: it happens when an account has been imported, or when a new
 * badge ships and an account already passed its rule. A stack of six toasts
 * would bury the screen, so more than two become one line that sends you to
 * the panel.
 */
function announceAchievements(badgeIds: readonly string[]) {
  const badges = badgeIds
    .map(findAchievement)
    .filter((badge): badge is NonNullable<typeof badge> => badge !== null)
  if (!badges.length) return
  if (badges.length > 2) {
    toast.success(`${badges.length} achievements earned. See History.`)
    return
  }
  for (const badge of badges)
    toast.success(`Achievement earned: ${badge.name}`)
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
        announceAchievements(result.newAchievements)
        const updatedTask = result.task
        setState({
          // Offered only once the server has agreed the session is complete,
          // because that is the state the note can be written on. Asking
          // sooner would show a prompt whose first save would be refused.
          noteSession:
            result.session.mode === "focus"
              ? { id: result.session.id, note: result.session.note ?? "" }
              : state.noteSession,
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
          syncError: "",
        })
      })
      .catch(() =>
        setSyncError("Your completed focus session could not be synced.")
      )

  const { nextMode, completedFocusSessions } = advanceCycle(
    current.timer.mode,
    current.cycleFocusSessions,
    current.sessionsBeforeLongBreak
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
    sessionsBeforeLongBreak: state.sessionsBeforeLongBreak,
    autoStart,
  }).then(clearSyncError, () => undefined)
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
  rest: {
    dailyGoalSessions?: number
    sessionsBeforeLongBreak?: number
  } = {}
) {
  const dailyGoalSessions = rest.dailyGoalSessions ?? state.dailyGoalSessions
  // Normalized here rather than trusted: a zero would make the cycle sum below
  // divide by zero, and the number reaching this function comes from a form,
  // from a stored preset, or from a server row.
  const sessionsBeforeLongBreak = normalizeSessionsBeforeLongBreak(
    rest.sessionsBeforeLongBreak ?? state.sessionsBeforeLongBreak
  )
  if (!timerIsIdle()) return false
  // A count from the old rhythm can be past the new rhythm's own target, so a
  // changed number works the position out the way every load does: today's
  // finished focuses against the new number. Anything else would disagree with
  // itself the next time the screen reloaded.
  const cycleFocusSessions =
    sessionsBeforeLongBreak === state.sessionsBeforeLongBreak
      ? state.cycleFocusSessions
      : state.todayFocusSessions % sessionsBeforeLongBreak
  if (!isAuthed()) {
    const timer = createTimer(state.timer.mode, durations[state.timer.mode])
    setState({
      durations,
      autoStart,
      dailyGoalSessions,
      sessionsBeforeLongBreak,
      cycleFocusSessions,
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
    sessionsBeforeLongBreak,
    autoStart,
  }).then(clearSyncError, () =>
    setSyncError("The timer settings could not be saved.")
  )
  const timer = createTimer(state.timer.mode, durations[state.timer.mode])
  setState({
    durations,
    autoStart,
    dailyGoalSessions,
    sessionsBeforeLongBreak,
    cycleFocusSessions,
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
        repeatWeekdays: null,
        projectId: null,
        projectName: null,
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
        syncError: "",
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
  // The row moves on the press, not on the answer, so three ticks in a row
  // land as fast as they are pressed. The answer is still the truth: the
  // status and the done count it carries are written on top when it arrives,
  // so a tick the server disagrees with gets corrected.
  if (state.pendingTaskIds.includes(taskId)) return
  const target = state.tasks.find((task) => task.id === taskId)
  if (!target) return
  const wasCompleted = target.completed
  applyTaskChange(taskId, { completed: !wasCompleted })
  markTaskPending(taskId)
  void togglePersistentTask(taskId, browserTimezone())
    .then(
      (updated) => {
        applyTaskChange(taskId, {
          completed: updated.status === "completed",
          pomodoros: updated.pomodoroCount,
        })
        clearSyncError()
      },
      () => {
        // Only this one row goes back, not the whole list: another row's
        // answer may have landed in the meantime.
        applyTaskChange(taskId, { completed: wasCompleted })
        showErrorToast("The task could not be updated.")
      }
    )
    .finally(() => releaseTaskPending(taskId))
}

/** One row's fields, re-sorted and with the picked task resolved again. */
function applyTaskChange(taskId: string, changes: Partial<TaskItem>) {
  const tasks = orderTasksForDisplay(
    state.tasks.map((task) =>
      task.id === taskId ? { ...task, ...changes } : task
    )
  )
  setState({
    tasks,
    selectedTaskId: resolveSelectedTaskId(tasks, state.selectedTaskId),
  })
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
  if (state.pendingTaskIds.includes(taskId)) return
  const removed = state.tasks.find((task) => task.id === taskId)
  if (!removed) return
  const wasSelected = state.selectedTaskId === taskId
  setState({
    tasks: state.tasks.filter((task) => task.id !== taskId),
    selectedTaskId: wasSelected ? null : state.selectedTaskId,
  })
  markTaskPending(taskId)
  void abandonTask(taskId)
    .then(clearSyncError, () => {
      // The row goes back where the ordering rules put it, and it gets its
      // selection back only if it still held it when it left.
      const tasks = orderTasksForDisplay([...state.tasks, removed])
      setState({
        tasks,
        selectedTaskId: resolveSelectedTaskId(
          tasks,
          wasSelected && state.selectedTaskId === null
            ? taskId
            : state.selectedTaskId
        ),
      })
      showErrorToast("The task could not be removed.")
    })
    .finally(() => releaseTaskPending(taskId))
}

export function updateTaskDetails(
  taskId: string,
  changes: {
    title?: string
    priority?: TaskPriority
    estimatedPomodoros?: number | null
    projectId?: string | null
  }
) {
  const cleanTitle = changes.title?.trim().slice(0, 160)
  if (changes.title !== undefined && !cleanTitle) return Promise.resolve(false)
  const applied =
    changes.title !== undefined ? { ...changes, title: cleanTitle } : changes
  const target = state.tasks.find((task) => task.id === taskId)
  if (!target || target.completed) return Promise.resolve(false)
  // The project's name is shown on the row, so the optimistic update has to
  // carry it too; the id alone would leave the old name on screen.
  const projectName =
    applied.projectId === undefined
      ? undefined
      : (state.projects.find((project) => project.id === applied.projectId)
          ?.name ?? null)
  // The pre-change snapshot for rollback, captured before the optimistic
  // update is queued.
  const previousTasks = state.tasks
  setState({
    tasks: state.tasks.map((task) =>
      task.id === taskId && !task.completed
        ? {
            ...task,
            ...applied,
            ...(projectName === undefined ? {} : { projectName }),
          }
        : task
    ),
  })
  if (!isAuthed()) {
    persistGuest()
    return Promise.resolve(true)
  }
  // Returned, not fired and forgotten, because the repeat rule copies its
  // template from the task row: setting a repeat in the same save has to wait
  // for the new title to be there. The answer says whether it landed, so a
  // failed save does not go on to write a rule from a title nobody saved.
  return updateTask({ taskId, timezone: browserTimezone(), ...applied }).then(
    () => {
      clearSyncError()
      return true
    },
    () => {
      setState({ tasks: previousTasks })
      setSyncError("The task could not be updated.")
      return false
    }
  )
}

/**
 * Switches a task's repeat on, changes its picked days, or switches it off
 * with null. Switching off deletes the rule, which stops future copies and
 * leaves every day it already made alone.
 */
export function setTaskRepeat(taskId: string, weekdays: number | null) {
  const target = state.tasks.find((task) => task.id === taskId)
  if (!target || target.completed || !isAuthed()) return
  const previousTasks = state.tasks
  setState({
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, repeatWeekdays: weekdays } : task
    ),
  })
  void setTaskRepeatRule({
    taskId,
    timezone: browserTimezone(),
    weekdays,
  }).then(clearSyncError, () => {
    setState({ tasks: previousTasks })
    setSyncError("The repeat could not be saved.")
  })
}

/**
 * The order `listProjects` returns: live projects first, each group by name.
 * Applied to every local change as well, so a project created or renamed here
 * sits where it will still be sitting after the next load.
 */
function orderProjects(projects: ProjectRow[]) {
  return [...projects].sort(
    (left, right) =>
      Number(Boolean(left.archivedAt)) - Number(Boolean(right.archivedAt)) ||
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  )
}

export function createProject(name: string) {
  const cleanName = name.trim().slice(0, 60)
  if (!cleanName || !isAuthed()) return Promise.resolve()
  return createProjectRequest(cleanName)
    .then((created) =>
      setState({
        projects: orderProjects([...state.projects, created]),
        syncError: "",
      })
    )
    .catch((error: unknown) =>
      setSyncError(
        String(error).includes("PROJECT_NAME_TAKEN")
          ? `You already have a project called "${cleanName}".`
          : "The project could not be created."
      )
    )
}

export function renameProject(projectId: string, name: string) {
  const cleanName = name.trim().slice(0, 60)
  if (!cleanName || !isAuthed()) return Promise.resolve()
  return renameProjectRequest(projectId, cleanName)
    .then((updated) =>
      setState({
        projects: orderProjects(
          state.projects.map((project) =>
            project.id === projectId ? updated : project
          )
        ),
        tasks: state.tasks.map((task) =>
          task.projectId === projectId
            ? { ...task, projectName: updated.name }
            : task
        ),
        syncError: "",
      })
    )
    .catch((error: unknown) =>
      setSyncError(
        String(error).includes("PROJECT_NAME_TAKEN")
          ? `You already have a project called "${cleanName}".`
          : "The project could not be renamed."
      )
    )
}

/**
 * Archiving takes a project out of the picker but changes no task: a task
 * already in it keeps its project, and History keeps its hours.
 */
export function setProjectArchived(projectId: string, archived: boolean) {
  if (!isAuthed()) return Promise.resolve()
  return setProjectArchivedRequest(projectId, archived)
    .then((updated) =>
      setState({
        projects: orderProjects(
          state.projects.map((project) =>
            project.id === projectId ? updated : project
          )
        ),
        syncError: "",
      })
    )
    .catch((error: unknown) =>
      setSyncError(
        String(error).includes("PROJECT_NAME_TAKEN")
          ? "Another project has taken that name. Rename it first."
          : "The project could not be updated."
      )
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
  void reorderTasks(orderedTaskIds, browserTimezone()).then(
    clearSyncError,
    () => {
      // The server refused the order (someone else changed the list), so
      // roll back and reload the truth — the TASK_ORDER_MISMATCH contract.
      setState({ tasks: previousTasks })
      setSyncError("The new task order could not be saved.")
      void reloadPomodoroData()
    }
  )
}

/**
 * Writes the line about the focus that just finished. Nothing here touches
 * the timer, so saving or skipping never interrupts the break that is already
 * running. An empty line clears a note written by mistake.
 */
export function saveSessionNote(note: string) {
  const target = state.noteSession
  if (!target || !isAuthed()) return Promise.resolve(false)
  const line = normalizeSessionNote(note)
  const previous = target.note
  setState({ noteSession: { ...target, note: line } })
  return saveFocusSessionNote(target.id, line).then(
    () => {
      clearSyncError()
      return true
    },
    () => {
      // Only roll back when the prompt is still showing the same session; a
      // slow save must not overwrite the next focus's prompt.
      if (state.noteSession?.id === target.id)
        setState({ noteSession: { ...target, note: previous } })
      setSyncError("Your note could not be saved.")
      return false
    }
  )
}

/** Puts the prompt away without writing anything. The line already saved stays. */
export function dismissSessionNote() {
  if (state.noteSession) setState({ noteSession: null })
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
    /** True while a tick or a removal on this task is still in flight. */
    taskBusy: (taskId: string) => snapshot.pendingTaskIds.includes(taskId),
    selectMode,
    toggleTimer,
    reset: resetPomodoroTimer,
    setAutoStart,
    applyDurations,
    addTask,
    toggleTask,
    removeTask,
    updateTaskDetails,
    saveSessionNote,
    dismissSessionNote,
    setTaskRepeat,
    createProject,
    renameProject,
    setProjectArchived,
    liveProjects: snapshot.projects.filter((project) => !project.archivedAt),
    reorderActiveTasks,
    selectTask,
  }
}
