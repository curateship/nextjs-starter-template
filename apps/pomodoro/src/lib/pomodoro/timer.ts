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
