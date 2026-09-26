/**
 * The pure timer arithmetic, ported from the old app
 * (apps/pomoder/src/lib/pomodoro.ts). A running timer stores the wall-clock
 * moment it will end rather than counting ticks, so a throttled background
 * tab still shows the right number when it wakes.
 */

export type TimerMode = "focus" | "short" | "long"

export type PomodoroTimer = {
  mode: TimerMode
  durationMinutes: number
  remainingSeconds: number
  running: boolean
  targetTimestamp: number | null
}

/** What the member-facing screens call each phase. */
export const MODE_LABELS: Record<TimerMode, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
}

/**
 * Where you are in the long-break cycle, in the words the room cards already
 * use. While focusing it names the focus you are in; on a break it names the
 * focus that comes next, because the one you were in is over. The number of
 * focuses comes from the saved rhythm, so a Deep Work cycle counts to two.
 */
export function cycleSessionLabel(
  mode: TimerMode,
  cycleFocusSessions: number,
  sessionsBeforeLongBreak: number
) {
  const total = Math.max(1, sessionsBeforeLongBreak)
  const done = Math.min(Math.max(0, cycleFocusSessions), total)
  const tail = `of ${total} before the long break`
  if (mode === "focus") return `Session ${Math.min(done + 1, total)} ${tail}`
  // A finished long break has already reset the count, so "next" is the first
  // focus of the new cycle; a short break points at the one it earned.
  const next = done >= total ? 1 : done + 1
  return `Next: session ${next} ${tail}`
}

export const DEFAULT_DURATIONS: Record<TimerMode, number> = {
  focus: 25,
  short: 5,
  long: 15,
}

export function createTimer(
  mode: TimerMode,
  durationMinutes: number
): PomodoroTimer {
  return {
    mode,
    durationMinutes,
    remainingSeconds: durationMinutes * 60,
    running: false,
    targetTimestamp: null,
  }
}

export function getRemainingSeconds(
  timer: PomodoroTimer,
  timestamp = Date.now()
) {
  if (!timer.running || timer.targetTimestamp === null)
    return timer.remainingSeconds
  return Math.max(0, Math.ceil((timer.targetTimestamp - timestamp) / 1000))
}

export function startTimer(
  timer: PomodoroTimer,
  timestamp = Date.now()
): PomodoroTimer {
  const remainingSeconds = getRemainingSeconds(timer, timestamp)
  return {
    ...timer,
    running: true,
    remainingSeconds,
    targetTimestamp: timestamp + remainingSeconds * 1000,
  }
}

export function pauseTimer(
  timer: PomodoroTimer,
  timestamp = Date.now()
): PomodoroTimer {
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

/** The browser's own IANA timezone, for the server's "which day is it" math. */
export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}
