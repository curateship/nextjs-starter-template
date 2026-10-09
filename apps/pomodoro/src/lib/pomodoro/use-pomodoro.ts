import * as React from "react"

import type { TimerDefaults } from "@/lib/pomodoro/media-pair"
import { showErrorToast } from "@/lib/toast/error-toast"
import { announceAchievements } from "@/lib/pomodoro/achievement-toast"
import { announceGoalReached } from "@/lib/pomodoro/goal-toast"
import {
  abandonTask,
  cancelFocusSession,
  completeFocusSession,
  createTask,
  loadLiveSession,
  loadProductivity,
  pauseFocusSession,
  reorderTasks,
  resumeFocusSession,
  saveFocusSessionNote,
  saveTaskTags as saveTaskTagsRequest,
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
  setProjectPublic as setProjectPublicRequest,
} from "@/lib/api/pomodoro/projects"
import { productAuth, subscribeProductAuth } from "@/lib/pomodoro/auth-state"
import type { ProjectTarget } from "@/lib/pomodoro/project-targets"
import type { TaskStepItem } from "@/lib/pomodoro/task-steps"
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
  taskItemFromServer,
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
import { dailyGoalLimitReason } from "@/lib/pomodoro/disabled-reasons"

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

export type ProjectTargetProgress = Awaited<
  ReturnType<typeof loadProductivity>
>["projectTargets"][number]

type PomodoroState = {
  timer: PomodoroTimer
  remainingSeconds: number
  tasks: TaskItem[]
  archive: ArchivedTask[]
  /** Days exist before the oldest archive day loaded with the page. */
  archiveHasOlder: boolean
  projects: ProjectRow[]
  /** Each live project with a target, and its focus so far this period. */
  projectTargets: ProjectTargetProgress[]
  /** How many active tasks each of the next six days holds. */
  plannedDays: { plannedDate: string; count: number }[]
  /** The tags the picker offers: the ones used in the last 30 days. */
  tagNames: string[]
  /** The account's today, as the server worked it out. */
  today: string | null
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
  archiveHasOlder: false,
  projects: [],
  projectTargets: [],
  plannedDays: [],
  tagNames: [],
  today: null,
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
/**
 * When the last load landed, so a second consumer mounting on the same
 * navigation does not fetch the same rows again.
 *
 * Only a load that worked sets this. A failed one leaves it alone, so the
 * next screen retries straight away instead of sitting on a failure for the
 * length of the window.
 */
let lastLoadedAt = 0
let completing = false

// ---------------------------------------------------------------------------
// One timer across devices. See workspace/docs/timer-across-devices.md.
// ---------------------------------------------------------------------------

/** How often an open, visible page asks for the account's live session. */
const LIVE_SYNC_MS = 5_000
/** The server's clock minus this browser's, from the last answer. */
let clockOffsetMs = 0
/**
 * Bumped by every press that changes the timer. A live-session answer that
 * left before the press is thrown away, so a slow poll can never undo what
 * somebody just did on this device.
 */
let timerActionSeq = 0
/** A start is on its way to the server and its session id is not known yet. */
let startPending = false
let syncing = false
let liveSyncTimer: number | null = null

type LiveSessionAnswer = Awaited<ReturnType<typeof loadLiveSession>>
type LiveSession = NonNullable<LiveSessionAnswer["session"]>

function noteServerClock(serverNow: number, sentAt: number) {
  clockOffsetMs = serverNow - (sentAt + Date.now()) / 2
}

/** The local timer a live session draws as, on this browser's clock. */
function timerFromLive(session: LiveSession): PomodoroTimer {
  const durationMinutes = session.plannedSeconds / 60
  if (session.status === "running" && session.targetEndsAt) {
    const targetTimestamp =
      new Date(session.targetEndsAt).getTime() - clockOffsetMs
    return {
      mode: session.mode,
      durationMinutes,
      running: true,
      targetTimestamp,
      remainingSeconds: Math.max(
        0,
        Math.ceil((targetTimestamp - Date.now()) / 1000)
      ),
    }
  }
  return {
    mode: session.mode,
    durationMinutes,
    running: false,
    targetTimestamp: null,
    remainingSeconds: Math.max(
      1,
      session.plannedSeconds - session.accumulatedSeconds
    ),
  }
}

/**
 * Puts the server's live session on this page, unless the page already shows
 * it to within a second and a half, so a poll that agrees redraws nothing.
 */
function adoptLiveSession(session: LiveSession) {
  const timer = timerFromLive(session)
  const current = state.timer
  const agrees =
    state.serverSessionId === session.id &&
    current.running === timer.running &&
    current.mode === timer.mode &&
    (timer.running
      ? Math.abs((current.targetTimestamp ?? 0) - (timer.targetTimestamp ?? 0)) <
        1_500
      : Math.abs(current.remainingSeconds - timer.remainingSeconds) <= 1)
  if (agrees) return
  const selectedTaskId =
    session.mode === "focus" &&
    session.taskId &&
    state.tasks.some((task) => task.id === session.taskId)
      ? session.taskId
      : state.selectedTaskId
  setState({
    timer,
    remainingSeconds: getRemainingSeconds(timer),
    serverSessionId: session.id,
    selectedTaskId,
  })
  announceRunning(timer.running)
}

/**
 * Reads the account's live session and brings this page into line with it.
 * A session that ended on another device moves this page on the same way:
 * to the next phase when it finished, back to the start of the same phase
 * when it was cancelled.
 */
export function syncLiveSession() {
  if (typeof window === "undefined" || !isAuthed()) return Promise.resolve()
  if (syncing || completing || startPending) return Promise.resolve()
  syncing = true
  const seq = timerActionSeq
  const known = state.serverSessionId
  const sentAt = Date.now()
  return loadLiveSession(known)
    .then(({ session, ending, serverNow }) => {
      noteServerClock(serverNow, sentAt)
      if (seq !== timerActionSeq || completing || startPending) return
      if (session) {
        adoptLiveSession(session)
        return
      }
      if (!known || state.serverSessionId !== known) return
      const finished = ending?.status === "completed"
      const { nextMode, completedFocusSessions } = finished
        ? advanceCycle(
            ending.mode as TimerMode,
            state.cycleFocusSessions,
            state.sessionsBeforeLongBreak
          )
        : {
            nextMode: state.timer.mode,
            completedFocusSessions: state.cycleFocusSessions,
          }
      const timer = createTimer(nextMode, state.durations[nextMode])
      setState({
        timer,
        remainingSeconds: timer.remainingSeconds,
        serverSessionId: null,
        cycleFocusSessions: completedFocusSessions,
      })
      announceRunning(false)
      // Today's count and streak moved on the other device.
      if (finished) void reloadPomodoroData()
    })
    .catch(() => undefined)
    .finally(() => {
      syncing = false
    })
}

function syncWhenVisible() {
  if (document.visibilityState === "visible") void syncLiveSession()
}

/** Asks every few seconds while a screen is mounted, and on coming back. */
function startLiveSync() {
  if (typeof window === "undefined" || liveSyncTimer !== null) return
  liveSyncTimer = window.setInterval(syncWhenVisible, LIVE_SYNC_MS)
  document.addEventListener("visibilitychange", syncWhenVisible)
  window.addEventListener("focus", syncWhenVisible)
}

function stopLiveSync() {
  if (liveSyncTimer === null) return
  window.clearInterval(liveSyncTimer)
  liveSyncTimer = null
  document.removeEventListener("visibilitychange", syncWhenVisible)
  window.removeEventListener("focus", syncWhenVisible)
}

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

/**
 * Tells the rest of the page the timer started or stopped. Every caller runs
 * after `setState`, so the mode read here is the one that is now running,
 * which the sound needs: it plays only during a focus.
 */
function announceRunning(running: boolean) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("pomodoro:timer-running", {
      detail: { running, mode: state.timer.mode },
    })
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
  startPending = true
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
    .catch(() => setSyncError("Your focus session could not be saved to your account."))
    .finally(() => {
      startPending = false
    })
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

/**
 * The timer an admin set new accounts to start with, handed over by the page
 * that has it, before a guest's state is read. A guest who already changed
 * their timer keeps their own.
 */
let guestStartingTimer: TimerDefaults | null = null

export function setGuestStartingTimer(defaults: TimerDefaults | null) {
  guestStartingTimer = defaults
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
      : guestStartingTimer
        ? {
            focus: guestStartingTimer.focusMinutes,
            short: guestStartingTimer.shortBreakMinutes,
            long: guestStartingTimer.longBreakMinutes,
          }
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
            steps: [],
            tags: [],
          }))
      : []
  )
  const sessionsBeforeLongBreak = normalizeSessionsBeforeLongBreak(
    saved?.sessionsBeforeLongBreak ?? guestStartingTimer?.sessionsBeforeLongBreak
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
    archiveHasOlder: false,
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
        : (guestStartingTimer?.dailyGoalSessions ?? 4),
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

/**
 * How long a finished load counts as current, for the mount refresh only.
 *
 * Five seconds. Long enough to cover one navigation — the header's quick
 * controls and the page under them both mount and both ask — and short enough
 * that a change made in another tab is back before you have finished switching
 * to this one. Nothing the timer itself writes waits on this: those writes go
 * straight into the store.
 */
export const RELOAD_FRESH_MS = 5_000

/**
 * Fresh tasks, preferences and summary; the ticking timer is left alone.
 *
 * `maxAgeMs` makes the call a refresh rather than a demand: a load that
 * finished less than that long ago is left alone. Only the mount refresh
 * passes it. Every explicit caller — a saved setting, a rejected reorder, the
 * guest import — passes nothing and always reloads, because each of those
 * knows the rows just changed.
 */
export function reloadPomodoroData({
  maxAgeMs,
}: { maxAgeMs?: number } = {}) {
  if (typeof window === "undefined" || hydrating) return Promise.resolve()
  if (maxAgeMs !== undefined && Date.now() - lastLoadedAt < maxAgeMs)
    return Promise.resolve()
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
          .map(taskItemFromServer)
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
        archiveHasOlder: data.archiveHasOlder,
        projects: data.projects,
        projectTargets: data.projectTargets,
        plannedDays: data.plannedDays,
        tagNames: data.tagNames,
        today: data.today,
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
      lastLoadedAt = Date.now()
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
      // A focus started on another device, or before this page reloaded,
      // comes back from the server rather than from this browser.
      void syncLiveSession()
    })
}


function handleCompletion() {
  if (completing) return
  completing = true
  timerActionSeq += 1
  const current = state

  // One chime and notification per finished countdown, gated on the
  // wall-clock end moment so double ticks cannot fire it twice.
  if (current.timer.targetTimestamp !== null)
    fireCompletionAlert(
      `${current.timer.mode}:${current.timer.targetTimestamp}`,
      completionAlertMessage(current.timer.mode),
      current.timer.mode
    )

  if (!isAuthed() && current.timer.mode === "focus") {
    // A guest's finished focus counts locally: today's total and the
    // picked task's own count.
    const selected = resolveSelectedTaskId(current.tasks, current.selectedTaskId)
    announceGoalReached(
      current.todayFocusSessions,
      current.todayFocusSessions + 1,
      current.dailyGoalSessions
    )
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
        // Another device recorded this session first. It is counted once,
        // there, and this page catches up on the count.
        if (!result) {
          void reloadPomodoroData()
          return
        }
        announceAchievements(result.newAchievements)
        if (result.session.mode === "focus")
          announceGoalReached(
            current.todayFocusSessions,
            result.summary.todayCompletedSessions,
            result.summary.dailyGoalSessions
          )
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
        setSyncError("Your completed focus session could not be saved to your account.")
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
  timerActionSeq += 1
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
  timerActionSeq += 1
  const current = state
  if (current.timer.running) {
    const next = pauseTimer(current.timer)
    if (isAuthed() && current.serverSessionId)
      settleLiveAction(pauseFocusSession(current.serverSessionId))
    setState({ timer: next, remainingSeconds: next.remainingSeconds })
    announceRunning(false)
    persistGuest()
    return
  }
  const next = startTimer(current.timer)
  if (isAuthed() && current.serverSessionId) {
    settleLiveAction(resumeFocusSession(current.serverSessionId))
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
  timerActionSeq += 1
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

/**
 * Leaving a break early, from the Skip break button the main pill turns into
 * while a short or long break is on. The break is thrown away rather than
 * finished, so there is no chime and nothing is recorded: the only thing it
 * would have earned is the focus that comes next, and skipping goes straight
 * there. A skipped short break keeps the focuses already counted towards the
 * long break, and a skipped long break ends the cycle the same as sitting
 * through it would. Auto-start decides whether the focus is already running
 * when it appears, the same as it does when a break runs out on its own.
 */
export function skipBreak() {
  const current = state
  if (current.timer.mode === "focus") return
  timerActionSeq += 1
  if (isAuthed() && current.serverSessionId)
    void cancelFocusSession(current.serverSessionId).catch(() => undefined)
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
}

/**
 * The server's answer to this page's own pause or resume. It carries the time
 * worked out on the server's clock, which this page adopts. No session means
 * another device acted first, so the page reads the live session instead.
 */
function settleLiveAction(
  request: Promise<{ session: LiveSession | null; serverNow: number }>
) {
  const sentAt = Date.now()
  // Called right after the press bumped the counter, so this is the press's
  // own number. A later press makes this answer out of date.
  const seq = timerActionSeq
  void request
    .then(({ session, serverNow }) => {
      noteServerClock(serverNow, sentAt)
      clearSyncError()
      if (seq !== timerActionSeq) return
      if (session && state.serverSessionId === session.id)
        adoptLiveSession(session)
      else if (!session) void syncLiveSession()
    })
    .catch(() =>
      setSyncError("Your focus session could not be saved to your account.")
    )
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

export const DAILY_GOAL_MIN = 1
export const DAILY_GOAL_MAX = 20
/** Why the goal's + or − stops, read from the two limits above. */
export const DAILY_GOAL_LIMIT_REASON = dailyGoalLimitReason(
  DAILY_GOAL_MIN,
  DAILY_GOAL_MAX
)

/**
 * The daily session goal, from the small edit button on the goal bar or
 * from Settings → Timer. It changes nothing about the countdown, only what
 * the bar is measured against, so it saves while the timer runs, the same
 * as auto-start does. Out-of-range numbers are clamped rather than
 * refused, because the only way in is a stepper that cannot leave the
 * range anyway.
 */
export function setDailyGoal(sessions: number) {
  if (!Number.isFinite(sessions)) return
  const dailyGoalSessions = Math.min(
    DAILY_GOAL_MAX,
    Math.max(DAILY_GOAL_MIN, Math.round(sessions))
  )
  if (dailyGoalSessions === state.dailyGoalSessions) return
  if (!isAuthed()) {
    setState({ dailyGoalSessions })
    persistGuest()
    return
  }
  void updatePreferences({
    focusMinutes: state.durations.focus,
    shortBreakMinutes: state.durations.short,
    longBreakMinutes: state.durations.long,
    dailyGoalSessions,
    sessionsBeforeLongBreak: state.sessionsBeforeLongBreak,
    autoStart: state.autoStart,
  }).then(clearSyncError, () =>
    setSyncError("The daily goal could not be saved.")
  )
  setState({ dailyGoalSessions })
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

/**
 * Adds a task to today. Returns false, sending nothing, when the title is
 * blank, so the form can keep what was typed and say what it needs.
 */
export function addTask(title: string) {
  const cleanTitle = title.trim().slice(0, 160)
  if (!cleanTitle) return false
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
        steps: [],
        tags: [],
      },
    ]),
  })
  if (!isAuthed()) {
    persistGuest()
    return true
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
  return true
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
      // The edit row stays open with the typed changes still in it, so the
      // toast is the whole report; the row itself snaps back underneath.
      setState({ tasks: previousTasks })
      showErrorToast("Your changes to the task could not be saved.")
      return false
    }
  )
}

/**
 * Switches a task's repeat on, changes its picked days, or switches it off
 * with null. Switching off deletes the rule, which stops future copies and
 * leaves every day it already made alone.
 */
export function setTaskRepeat(
  taskId: string,
  weekdays: number | null
): Promise<boolean> {
  const target = state.tasks.find((task) => task.id === taskId)
  if (!target || target.completed || !isAuthed()) return Promise.resolve(false)
  const previousTasks = state.tasks
  setState({
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, repeatWeekdays: weekdays } : task
    ),
  })
  return setTaskRepeatRule({
    taskId,
    timezone: browserTimezone(),
    weekdays,
  }).then(
    () => {
      clearSyncError()
      return true
    },
    () => {
      setState({ tasks: previousTasks })
      showErrorToast("The task was saved, but its repeat could not be.")
      return false
    }
  )
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

/**
 * What became of a new project. `nameProblem` is a refusal about the name
 * itself, which the form shows beside the box it was typed in. Any other
 * failure has already been reported with the error toast.
 */
export type CreateProjectResult =
  | { created: true }
  | { created: false; nameProblem?: string }

export function createProject(name: string): Promise<CreateProjectResult> {
  const cleanName = name.trim().slice(0, 60)
  if (!cleanName)
    return Promise.resolve({
      created: false,
      nameProblem: "Type a name for the project first.",
    })
  if (!isAuthed()) return Promise.resolve({ created: false })
  return createProjectRequest(cleanName).then(
    (created): CreateProjectResult => {
      setState({
        projects: orderProjects([...state.projects, created]),
        syncError: "",
      })
      return { created: true }
    },
    (error: unknown): CreateProjectResult => {
      if (String(error).includes("PROJECT_NAME_TAKEN"))
        return {
          created: false,
          nameProblem: `You already have a project called "${cleanName}".`,
        }
      showErrorToast("The project could not be created.")
      return { created: false }
    }
  )
}

/**
 * Renames a project and sets or clears its hours target. Resolves true once
 * both have landed, so the edit row can stay open with the typed values when
 * they did not. A changed target reloads the day's figures, because the bar
 * reads a sum the server works out.
 */
export function renameProject(
  projectId: string,
  name: string,
  target?: ProjectTarget | null
) {
  const cleanName = name.trim().slice(0, 60)
  if (!cleanName || !isAuthed()) return Promise.resolve(false)
  return renameProjectRequest(projectId, cleanName, target).then(
    (updated) => {
      setState({
        projects: orderProjects(
          state.projects.map((project) =>
            // Merged, so the card's task count and hours survive an edit.
            project.id === projectId ? { ...project, ...updated } : project
          )
        ),
        tasks: state.tasks.map((task) =>
          task.projectId === projectId
            ? { ...task, projectName: updated.name }
            : task
        ),
        syncError: "",
      })
      if (target !== undefined) void reloadPomodoroData()
      return true
    },
    (error: unknown) => {
      showErrorToast(
        String(error).includes("PROJECT_NAME_TAKEN")
          ? `You already have a project called "${cleanName}".`
          : "The project could not be saved."
      )
      return false
    }
  )
}

/**
 * Writes a task's steps after a step changed. The step list sends its own
 * requests and hands the store the new list, so the row's count stays right.
 */
export function setTaskSteps(
  taskId: string,
  update: (steps: TaskStepItem[]) => TaskStepItem[]
) {
  setState({
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, steps: update(task.steps) } : task
    ),
  })
}

/**
 * Replaces a task's tags. Shown at once and put back if the server refuses,
 * with the toast saying so. A new name joins the picker straight away.
 */
export function setTaskTags(taskId: string, tags: string[]) {
  const target = state.tasks.find((task) => task.id === taskId)
  if (!target || !isAuthed()) return Promise.resolve(false)
  const previousTags = target.tags
  applyTaskChange(taskId, { tags })
  return saveTaskTagsRequest(taskId, tags).then(
    (saved) => {
      applyTaskChange(taskId, { tags: saved })
      setState({ tagNames: mergeTagNames(state.tagNames, saved) })
      return true
    },
    () => {
      applyTaskChange(taskId, { tags: previousTags })
      showErrorToast("The task was saved, but its tags could not be.")
      return false
    }
  )
}

/** The picker's list with any new names added, kept in name order. */
function mergeTagNames(names: readonly string[], added: readonly string[]) {
  return [...new Set([...names, ...added])].sort()
}

/**
 * Moves a future day's count when a task is added to it or taken off it, so
 * the day strip agrees with the list without a reload.
 */
export function adjustPlannedDayCount(plannedDate: string, change: number) {
  const known = state.plannedDays.some((day) => day.plannedDate === plannedDate)
  const plannedDays = known
    ? state.plannedDays.map((day) =>
        day.plannedDate === plannedDate
          ? { ...day, count: Math.max(0, day.count + change) }
          : day
      )
    : [...state.plannedDays, { plannedDate, count: Math.max(0, change) }]
  setState({ plannedDays })
}

/** Adds names to the picker, after a planned-ahead task saved its tags. */
export function addTagNames(added: readonly string[]) {
  setState({ tagNames: mergeTagNames(state.tagNames, added) })
}

/**
 * Ticking a project public lets its name and its hours appear on the owner's
 * public profile. Off for every project until somebody ticks it, because a
 * project name is often a client's name.
 */
export function setProjectPublic(projectId: string, isPublic: boolean) {
  if (!isAuthed()) return Promise.resolve()
  return setProjectPublicRequest(projectId, isPublic)
    .then((updated) =>
      setState({
        projects: orderProjects(
          state.projects.map((project) =>
            project.id === projectId ? { ...project, ...updated } : project
          )
        ),
        syncError: "",
      })
    )
    .catch(() =>
      setSyncError("The project could not be updated.")
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
            project.id === projectId ? { ...project, ...updated } : project
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
  startLiveSync()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopLiveSync()
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
  // A consumer mount refreshes the data; the running timer is untouched.
  // Every member screen mounts two of these — the header's quick controls and
  // the page under them — so the refresh skips a load that is already in
  // flight or that landed in the last few seconds, and one navigation asks
  // the server once.
  React.useEffect(() => {
    void reloadPomodoroData({ maxAgeMs: RELOAD_FRESH_MS })
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
    skipBreak,
    onBreak: snapshot.timer.mode !== "focus",
    reset: resetPomodoroTimer,
    setAutoStart,
    setDailyGoal,
    applyDurations,
    addTask,
    toggleTask,
    removeTask,
    updateTaskDetails,
    saveSessionNote,
    dismissSessionNote,
    setTaskRepeat,
    setTaskSteps,
    setTaskTags,
    createProject,
    renameProject,
    setProjectArchived,
    setProjectPublic,
    liveProjects: snapshot.projects.filter((project) => !project.archivedAt),
    reorderActiveTasks,
    selectTask,
  }
}
