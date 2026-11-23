/**
 * The Focus rhythm card on Settings → Timer
 * (`src/components/pomodoro/timer-settings-panel.tsx`): the values it edits
 * and the rule for following the timer while the card is open.
 */
import { SESSIONS_BEFORE_LONG_BREAK_DEFAULT } from "@/lib/pomodoro/timer-presets"

/** The values the Focus rhythm card edits, one per box. */
export type Rhythm = {
  focus: number
  short: number
  long: number
  dailyGoal: number
  cycle: number
  autoStart: boolean
}

const RHYTHM_KEYS = [
  "focus",
  "short",
  "long",
  "dailyGoal",
  "cycle",
  "autoStart",
] as const satisfies ReadonlyArray<keyof Rhythm>

export const DEFAULT_RHYTHM: Rhythm = {
  focus: 25,
  short: 5,
  long: 15,
  dailyGoal: 4,
  cycle: SESSIONS_BEFORE_LONG_BREAK_DEFAULT,
  autoStart: false,
}

export function rhythmKey(rhythm: Rhythm) {
  return RHYTHM_KEYS.map((key) => String(rhythm[key])).join("|")
}

/** The timer's values in every box not typed in since the last save. */
export function followTimer(
  boxes: Rhythm,
  timer: Rhythm,
  edited: ReadonlySet<keyof Rhythm>
): Rhythm {
  const next = { ...boxes }
  for (const key of RHYTHM_KEYS) {
    if (!edited.has(key)) Object.assign(next, { [key]: timer[key] })
  }
  return next
}

export function presetRhythm(preset: {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  sessionsBeforeLongBreak: number
  autoStart: boolean
}): Omit<Rhythm, "dailyGoal"> {
  return {
    focus: preset.focusMinutes,
    short: preset.shortBreakMinutes,
    long: preset.longBreakMinutes,
    cycle: preset.sessionsBeforeLongBreak,
    autoStart: preset.autoStart,
  }
}
