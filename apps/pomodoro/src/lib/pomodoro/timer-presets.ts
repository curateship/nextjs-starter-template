/**
 * Timer rhythm presets, ported from the old app. Built-ins live here in code
 * with stable identifiers, never inserted per account; custom presets live in
 * the user_timer_presets table. Keep this file free of server imports.
 */

export type TimerPresetValues = {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  /**
   * How many focuses earn the long break. Four is the classic pattern and the
   * default everywhere; a 50-minute rhythm usually wants two, because four
   * fifty-minute blocks before a real rest is punishing.
   */
  sessionsBeforeLongBreak: number
  autoStart: boolean
}

export type CustomTimerPreset = TimerPresetValues & { id: string; name: string }
export type BuiltinTimerPreset = TimerPresetValues & {
  id: string
  name: string
  builtin: true
}

export const TIMER_PRESET_LIMIT = 10
export const TIMER_PRESET_NAME_MAX = 60

export const SESSIONS_BEFORE_LONG_BREAK_DEFAULT = 4
export const SESSIONS_BEFORE_LONG_BREAK_MIN = 2
export const SESSIONS_BEFORE_LONG_BREAK_MAX = 8

// Built-in ids and values are part of the product contract — do not change
// them across releases; add new presets instead.
export const builtinTimerPresets: readonly BuiltinTimerPreset[] = [
  {
    id: "builtin:classic",
    name: "Classic",
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
    autoStart: false,
    builtin: true,
  },
  {
    id: "builtin:deep-work",
    name: "Deep Work",
    focusMinutes: 50,
    shortBreakMinutes: 10,
    longBreakMinutes: 30,
    // Two, not four: four fifty-minute blocks before a proper rest is the
    // thing people give up on. This is the rhythm the number was added for.
    sessionsBeforeLongBreak: 2,
    autoStart: false,
    builtin: true,
  },
  {
    id: "builtin:study-sprint",
    name: "Study Sprint",
    focusMinutes: 15,
    shortBreakMinutes: 3,
    longBreakMinutes: 10,
    sessionsBeforeLongBreak: 4,
    autoStart: true,
    builtin: true,
  },
]

export function validPresetMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 90
  )
}

export function validSessionsBeforeLongBreak(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SESSIONS_BEFORE_LONG_BREAK_MIN &&
    value <= SESSIONS_BEFORE_LONG_BREAK_MAX
  )
}

/**
 * A stored number turned into a usable one. Anything out of range, and a row
 * saved before the number existed, reads as the classic four rather than
 * throwing the whole row away: the rhythm it was saved with still works.
 */
export function normalizeSessionsBeforeLongBreak(value: unknown) {
  return validSessionsBeforeLongBreak(value)
    ? value
    : SESSIONS_BEFORE_LONG_BREAK_DEFAULT
}

export function normalizePresetName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const name = value.trim().slice(0, TIMER_PRESET_NAME_MAX)
  return name.length ? name : null
}

export function presetSummary(values: TimerPresetValues) {
  return `${values.focusMinutes} · ${values.shortBreakMinutes} · ${values.longBreakMinutes} · long after ${values.sessionsBeforeLongBreak}${values.autoStart ? " · auto" : ""}`
}

function sameTimerValues(left: TimerPresetValues, right: TimerPresetValues) {
  return (
    left.focusMinutes === right.focusMinutes &&
    left.shortBreakMinutes === right.shortBreakMinutes &&
    left.longBreakMinutes === right.longBreakMinutes &&
    left.sessionsBeforeLongBreak === right.sessionsBeforeLongBreak &&
    left.autoStart === right.autoStart
  )
}

/**
 * The preset whose four values match the current settings; null means the
 * picker should present "Custom".
 */
export function matchTimerPreset(
  values: TimerPresetValues,
  customPresets: readonly CustomTimerPreset[]
) {
  return (
    [...builtinTimerPresets, ...customPresets].find((preset) =>
      sameTimerValues(preset, values)
    ) ?? null
  )
}

/**
 * Guests keep their custom rhythms in the browser. Invalid stored rows are
 * discarded rather than repaired, so corrupt data can never resurrect
 * out-of-bounds durations.
 */
export function normalizeCustomTimerPresets(value: unknown): CustomTimerPreset[] {
  if (!Array.isArray(value)) return []
  const presets: CustomTimerPreset[] = []
  const seenNames = new Set<string>()
  for (const entry of value) {
    if (presets.length >= TIMER_PRESET_LIMIT) break
    const preset = entry as Partial<CustomTimerPreset> | null
    const name = normalizePresetName(preset?.name)
    if (
      !preset ||
      typeof preset.id !== "string" ||
      !preset.id ||
      !name ||
      seenNames.has(name.toLowerCase()) ||
      !validPresetMinutes(preset.focusMinutes) ||
      !validPresetMinutes(preset.shortBreakMinutes) ||
      !validPresetMinutes(preset.longBreakMinutes) ||
      typeof preset.autoStart !== "boolean"
    )
      continue
    seenNames.add(name.toLowerCase())
    presets.push({
      id: preset.id,
      name,
      focusMinutes: preset.focusMinutes,
      shortBreakMinutes: preset.shortBreakMinutes,
      longBreakMinutes: preset.longBreakMinutes,
      // Not a reason to discard the row: a guest preset saved before the
      // number existed keeps its durations and takes the classic four.
      sessionsBeforeLongBreak: normalizeSessionsBeforeLongBreak(
        preset.sessionsBeforeLongBreak
      ),
      autoStart: preset.autoStart,
    })
  }
  return presets
}
