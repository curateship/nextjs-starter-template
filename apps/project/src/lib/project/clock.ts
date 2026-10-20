import { addDays, localNow, momentOf } from "@/lib/project/days"

/**
 * The task clock's words and sums, the same in the browser and on the server.
 * How the clock works is in `workspace/docs/task-clock.md`.
 */

/** A task's clock as every screen gets it. */
export type TaskClock = {
  /** Every finished stretch and every fix added up, in seconds. */
  seconds: number
  /** When the stretch going now started; null while the clock is paused. */
  runningSince: string | null
}

export const STOPPED_CLOCK: TaskClock = { seconds: 0, runningSince: null }

/** The task's time at `nowMs`: the finished stretches and the one going now. */
export function clockSeconds(clock: TaskClock, nowMs: number) {
  const running = clock.runningSince
    ? Math.max(0, Math.floor((nowMs - Date.parse(clock.runningSince)) / 1000))
    : 0
  return Math.max(0, clock.seconds + running)
}

/** The running clock's face: "0:42" under an hour, "1:24:05" from one hour on. */
export function clockFace(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, "0")
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`
}

/** A total in words: "2h 15m", "45m", "3h", and "0m" under a minute. */
export function clockTotal(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  const hours = Math.floor(minutes / 60)
  const left = minutes % 60
  if (!hours) return `${left}m`
  return left ? `${hours}h ${left}m` : `${hours}h`
}

/** Every task's clock added up, for a project's left panel and its milestones (Seven features, part 4). */
export function timeOnTasks(tasks: readonly { clock: TaskClock }[], nowMs: number) {
  return tasks.reduce((sum, task) => sum + clockSeconds(task.clock, nowMs), 0)
}

/** The time against a guess: "20m over", "10m left", or "On the guess". */
export function guessGap(seconds: number, guessMinutes: number) {
  const gap = Math.floor(Math.max(0, seconds) / 60) - guessMinutes
  if (gap > 0) return `${clockTotal(gap * 60)} over`
  if (gap < 0) return `${clockTotal(-gap * 60)} left`
  return "On the guess"
}

/**
 * Minutes from what a person typed: "45", "45m", "1h", "1h 30m", "1.5h" or
 * "1:30". Null for anything else, and for nothing typed.
 */
export function parseMinutes(text: string): number | null {
  const typed = text.trim().toLowerCase()
  if (!typed) return null
  const colon = /^(\d{1,4}):([0-5]\d)$/.exec(typed)
  if (colon) return Number(colon[1]) * 60 + Number(colon[2])
  if (/^\d{1,6}$/.test(typed)) return Number(typed)
  const words = /^(?:(\d{1,4}(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d{1,6})\s*m(?:in(?:ute)?s?)?)?$/.exec(typed)
  if (!words || (!words[1] && !words[2])) return null
  return Math.round(Number(words[1] ?? 0) * 60) + Number(words[2] ?? 0)
}

/** The Monday that starts the week holding `at` in the zone, as the moment its midnight falls. */
export function weekStartIn(at: Date, timeZone: string) {
  const today = localNow(at, timeZone)
  // Sunday is 0, so it belongs to the week that began six days before.
  const monday = addDays(today.day, -((today.weekday + 6) % 7))
  return momentOf(monday, "00:00", timeZone)
}

/** A "clock_paused" history line's reason, "2700" or "2700 midnight". */
export function readClockPause(reason: string | null) {
  const match = /^(\d+)( midnight)?$/.exec(reason ?? "")
  return match ? { seconds: Number(match[1]), midnight: Boolean(match[2]) } : null
}

/** A "clock_fixed" history line's reason: the old and new totals, "10800 4200". */
export function readClockFix(reason: string | null) {
  const match = /^(-?\d+) (\d+)$/.exec(reason ?? "")
  return match ? { from: Math.max(0, Number(match[1])), to: Number(match[2]) } : null
}
