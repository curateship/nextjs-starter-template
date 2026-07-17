import { afterEach, describe, expect, it } from "vitest"

import {
  builtinTimerPresets,
  loadGuestTimerPresets,
  matchTimerPreset,
  normalizeCustomTimerPresets,
  normalizePresetName,
  presetSummary,
  saveGuestTimerPresets,
  TIMER_PRESET_LIMIT,
} from "@/lib/timer-presets"

describe("built-in presets", () => {
  it("keeps stable identifiers and values across releases", () => {
    expect(builtinTimerPresets).toEqual([
      { id: "builtin:classic", name: "Classic", focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, autoStart: false, builtin: true },
      { id: "builtin:deep-work", name: "Deep Work", focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, autoStart: false, builtin: true },
      { id: "builtin:study-sprint", name: "Study Sprint", focusMinutes: 15, shortBreakMinutes: 3, longBreakMinutes: 10, autoStart: true, builtin: true },
    ])
  })
})

describe("matchTimerPreset", () => {
  const custom = [{ id: "c1", name: "Writing", focusMinutes: 45, shortBreakMinutes: 8, longBreakMinutes: 20, autoStart: true }]

  it("matches built-ins and custom presets on all four values", () => {
    expect(matchTimerPreset({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, autoStart: false }, custom)?.id).toBe("builtin:classic")
    expect(matchTimerPreset({ focusMinutes: 45, shortBreakMinutes: 8, longBreakMinutes: 20, autoStart: true }, custom)?.id).toBe("c1")
  })

  it("returns null when any value diverges, including auto-start", () => {
    expect(matchTimerPreset({ focusMinutes: 26, shortBreakMinutes: 5, longBreakMinutes: 15, autoStart: false }, custom)).toBeNull()
    expect(matchTimerPreset({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, autoStart: true }, custom)).toBeNull()
  })
})

describe("normalizeCustomTimerPresets", () => {
  it("drops invalid rows instead of repairing them", () => {
    const normalized = normalizeCustomTimerPresets([
      { id: "keep", name: "Valid", focusMinutes: 30, shortBreakMinutes: 6, longBreakMinutes: 18, autoStart: false },
      { id: "no-name", name: "   ", focusMinutes: 30, shortBreakMinutes: 6, longBreakMinutes: 18, autoStart: false },
      { id: "bad-focus", name: "Too long", focusMinutes: 120, shortBreakMinutes: 6, longBreakMinutes: 18, autoStart: false },
      { id: "bad-auto", name: "Stringy", focusMinutes: 30, shortBreakMinutes: 6, longBreakMinutes: 18, autoStart: "yes" },
      { id: "dupe", name: "valid", focusMinutes: 20, shortBreakMinutes: 4, longBreakMinutes: 12, autoStart: true },
      null,
      "junk",
    ])
    expect(normalized).toEqual([{ id: "keep", name: "Valid", focusMinutes: 30, shortBreakMinutes: 6, longBreakMinutes: 18, autoStart: false }])
  })

  it("caps restored presets at the limit and rejects non-arrays", () => {
    const oversized = Array.from({ length: 15 }, (_, index) => ({ id: `p${index}`, name: `Preset ${index}`, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, autoStart: false }))
    expect(normalizeCustomTimerPresets(oversized)).toHaveLength(TIMER_PRESET_LIMIT)
    expect(normalizeCustomTimerPresets({ presets: [] })).toEqual([])
    expect(normalizeCustomTimerPresets("[]")).toEqual([])
  })
})

describe("preset helpers", () => {
  it("normalizes names and renders summaries", () => {
    expect(normalizePresetName("  Deep Work  ")).toBe("Deep Work")
    expect(normalizePresetName("")).toBeNull()
    expect(normalizePresetName(42)).toBeNull()
    expect(normalizePresetName("x".repeat(80))).toHaveLength(60)
    expect(presetSummary({ focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, autoStart: false })).toBe("50 · 10 · 30")
    expect(presetSummary({ focusMinutes: 15, shortBreakMinutes: 3, longBreakMinutes: 10, autoStart: true })).toBe("15 · 3 · 10 · auto")
  })
})

describe("guest preset storage", () => {
  const storage = new Map<string, string>()
  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  }

  afterEach(() => {
    storage.clear()
    delete (globalThis as { window?: unknown }).window
  })

  it("round-trips presets and discards corrupt storage safely", () => {
    ;(globalThis as { window?: unknown }).window = fakeWindow
    expect(loadGuestTimerPresets()).toEqual([])

    const presets = [{ id: "g1", name: "Guest", focusMinutes: 40, shortBreakMinutes: 5, longBreakMinutes: 20, autoStart: false }]
    saveGuestTimerPresets(presets)
    expect(loadGuestTimerPresets()).toEqual(presets)

    storage.set("pomoder:presets:v1", "{not json")
    expect(loadGuestTimerPresets()).toEqual([])
    // The corrupt payload was removed, not left to fail forever.
    expect(storage.has("pomoder:presets:v1")).toBe(false)

    storage.set("pomoder:presets:v1", JSON.stringify({ presets: [{ id: "bad", name: "Bad", focusMinutes: 500, shortBreakMinutes: 5, longBreakMinutes: 15, autoStart: false }] }))
    expect(loadGuestTimerPresets()).toEqual([])
  })
})
