import { describe, expect, it } from "vitest"

import {
  builtinTimerPresets,
  matchTimerPreset,
  normalizeCustomTimerPresets,
  normalizeSessionsBeforeLongBreak,
  presetSummary,
  validSessionsBeforeLongBreak,
} from "@/lib/pomodoro/timer-presets"

const classic = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  autoStart: false,
}

describe("sessions before the long break", () => {
  it("accepts 2 to 8 whole numbers and nothing else", () => {
    expect(validSessionsBeforeLongBreak(2)).toBe(true)
    expect(validSessionsBeforeLongBreak(8)).toBe(true)
    expect(validSessionsBeforeLongBreak(1)).toBe(false)
    expect(validSessionsBeforeLongBreak(9)).toBe(false)
    expect(validSessionsBeforeLongBreak(3.5)).toBe(false)
    expect(validSessionsBeforeLongBreak("4")).toBe(false)
  })

  it("reads anything else as the classic four", () => {
    expect(normalizeSessionsBeforeLongBreak(undefined)).toBe(4)
    expect(normalizeSessionsBeforeLongBreak(null)).toBe(4)
    expect(normalizeSessionsBeforeLongBreak(0)).toBe(4)
    expect(normalizeSessionsBeforeLongBreak(2)).toBe(2)
  })

  it("is 4 on the built-ins except Deep Work, which is 2", () => {
    const byId = Object.fromEntries(
      builtinTimerPresets.map((preset) => [
        preset.id,
        preset.sessionsBeforeLongBreak,
      ])
    )
    expect(byId["builtin:classic"]).toBe(4)
    expect(byId["builtin:deep-work"]).toBe(2)
    expect(byId["builtin:study-sprint"]).toBe(4)
  })

  it("shows in the preset's own summary line", () => {
    expect(presetSummary(classic)).toBe("25 · 5 · 15 · long after 4")
    expect(
      presetSummary({ ...classic, sessionsBeforeLongBreak: 2, autoStart: true })
    ).toBe("25 · 5 · 15 · long after 2 · auto")
  })

  it("is part of what makes the current values match a preset", () => {
    expect(matchTimerPreset(classic, [])?.id).toBe("builtin:classic")
    expect(
      matchTimerPreset({ ...classic, sessionsBeforeLongBreak: 3 }, [])
    ).toBeNull()
  })

  it("keeps a guest preset saved before the number existed", () => {
    const [preset] = normalizeCustomTimerPresets([
      {
        id: "saved-earlier",
        name: "Old rhythm",
        focusMinutes: 40,
        shortBreakMinutes: 8,
        longBreakMinutes: 20,
        autoStart: false,
      },
    ])
    expect(preset).toMatchObject({
      name: "Old rhythm",
      focusMinutes: 40,
      sessionsBeforeLongBreak: 4,
    })
  })

  it("repairs an out-of-range stored number instead of dropping the row", () => {
    const [preset] = normalizeCustomTimerPresets([
      {
        id: "broken",
        name: "Tampered",
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        sessionsBeforeLongBreak: 500,
        autoStart: false,
      },
    ])
    expect(preset.sessionsBeforeLongBreak).toBe(4)
  })
})
