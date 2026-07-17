// Timer rhythm presets: built-ins live here in code with stable identifiers
// (never inserted per account), and guests keep custom presets in versioned
// browser storage. Keep this file free of server imports.

export type TimerPresetValues = {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  autoStart: boolean
}

export type CustomTimerPreset = TimerPresetValues & { id: string; name: string }
export type BuiltinTimerPreset = TimerPresetValues & { id: string; name: string; builtin: true }

export const TIMER_PRESET_LIMIT = 10
export const TIMER_PRESET_NAME_MAX = 60
const GUEST_PRESETS_KEY = "pomoder:presets:v1"

// Built-in ids and values are part of the product contract — do not change
// them across releases; add new presets instead.
export const builtinTimerPresets: readonly BuiltinTimerPreset[] = [
  { id: "builtin:classic", name: "Classic", focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, autoStart: false, builtin: true },
  { id: "builtin:deep-work", name: "Deep Work", focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, autoStart: false, builtin: true },
  { id: "builtin:study-sprint", name: "Study Sprint", focusMinutes: 15, shortBreakMinutes: 3, longBreakMinutes: 10, autoStart: true, builtin: true },
]

export function validPresetMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 90
}

export function normalizePresetName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const name = value.trim().slice(0, TIMER_PRESET_NAME_MAX)
  return name.length ? name : null
}

export function presetSummary(values: TimerPresetValues) {
  return `${values.focusMinutes} · ${values.shortBreakMinutes} · ${values.longBreakMinutes}${values.autoStart ? " · auto" : ""}`
}

function sameTimerValues(left: TimerPresetValues, right: TimerPresetValues) {
  return (
    left.focusMinutes === right.focusMinutes &&
    left.shortBreakMinutes === right.shortBreakMinutes &&
    left.longBreakMinutes === right.longBreakMinutes &&
    left.autoStart === right.autoStart
  )
}

// The preset whose four values match the current settings; null means the
// UI should present "Custom".
export function matchTimerPreset(values: TimerPresetValues, customPresets: readonly CustomTimerPreset[]) {
  return [...builtinTimerPresets, ...customPresets].find((preset) => sameTimerValues(preset, values)) ?? null
}

// Invalid stored rows are discarded rather than repaired so corrupt data can
// never resurrect out-of-bounds durations.
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
    presets.push({ id: preset.id, name, focusMinutes: preset.focusMinutes, shortBreakMinutes: preset.shortBreakMinutes, longBreakMinutes: preset.longBreakMinutes, autoStart: preset.autoStart })
  }
  return presets
}

export function loadGuestTimerPresets(): CustomTimerPreset[] {
  try {
    const saved = window.localStorage.getItem(GUEST_PRESETS_KEY)
    if (!saved) return []
    return normalizeCustomTimerPresets((JSON.parse(saved) as { presets?: unknown }).presets)
  } catch {
    window.localStorage.removeItem(GUEST_PRESETS_KEY)
    return []
  }
}

export function saveGuestTimerPresets(presets: readonly CustomTimerPreset[]) {
  window.localStorage.setItem(GUEST_PRESETS_KEY, JSON.stringify({ presets }))
}
