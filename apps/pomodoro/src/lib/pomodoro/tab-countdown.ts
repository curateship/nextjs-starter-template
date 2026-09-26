import { MODE_LABELS, type TimerMode } from "@/lib/pomodoro/timer"

/**
 * What the browser tab says while a countdown runs: the time left in the
 * title and a filling ring drawn into the favicon.
 *
 * People background this tab the moment they start working, so the title is
 * the last piece of the app still on screen. The arithmetic here is pure and
 * tested; `use-tab-countdown.ts` owns the DOM half.
 */

export type CountdownFrame = {
  running: boolean
  mode: TimerMode
  remainingSeconds: number
  durationSeconds: number
}

/** The ring's colour per phase, matched to theme.css in dark mode. */
export const COUNTDOWN_RING_COLORS: Record<TimerMode, string> = {
  focus: "#ff5a3c",
  short: "#4ade80",
  long: "#4ade80",
}

/** Mid grey, so the unfilled part of the ring reads on a light or dark tab. */
export const COUNTDOWN_TRACK_COLOR = "rgba(130,130,140,0.45)"

/** mm:ss, the same shape the ring on the dashboard shows. */
export function formatCountdownClock(remainingSeconds: number) {
  const total = Math.max(0, Math.floor(remainingSeconds))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

/**
 * The title while running, time first because a narrow tab shows only the
 * first few characters. An idle timer gives back an empty string and the
 * caller leaves the page's own title alone.
 */
export function countdownTitle(frame: CountdownFrame) {
  if (!frame.running) return ""
  return `${formatCountdownClock(frame.remainingSeconds)} ${MODE_LABELS[frame.mode]}`
}

/**
 * How much of the ring is filled: 0 at the start of a phase and 1 at its end.
 * A duration of zero would divide by zero, so it reads as finished.
 */
export function countdownProgress(frame: CountdownFrame) {
  if (frame.durationSeconds <= 0) return 1
  const elapsed = frame.durationSeconds - Math.max(0, frame.remainingSeconds)
  return Math.min(1, Math.max(0, elapsed / frame.durationSeconds))
}

/**
 * The frame turned into the one number that decides whether the favicon has
 * to be drawn again: the phase plus the progress rounded to a whole percent.
 * A second of a 90-minute focus moves the arc by a fifth of a degree, which
 * no 16px icon can show, so 100 steps is as fine as the drawing needs.
 */
export function countdownIconKey(frame: CountdownFrame) {
  return `${frame.mode}:${Math.round(countdownProgress(frame) * 100)}`
}
