import { describe, expect, it } from "vitest"

import { cleanPomodoroRowSettings } from "@/lib/pomodoro/front-page-rows"

/**
 * A row's settings are values an admin typed and the shell stored without
 * reading them, so every one of these is a row that could really arrive: saved
 * before the floor existed, emptied, or hand-edited in the settings row. None of
 * them may reach the public page as a broken figure.
 */
describe("front page row settings", () => {
  it("gives a row saved before the floor existed each kind's default", () => {
    expect(cleanPomodoroRowSettings("focus-hours", {})).toEqual({ floor: 20 })
    expect(cleanPomodoroRowSettings("open-rooms", undefined)).toEqual({ floor: 1 })
  })

  it("keeps a floor an admin typed", () => {
    expect(cleanPomodoroRowSettings("focus-hours", { floor: 250 })).toEqual({
      floor: 250,
    })
  })

  it("treats zero as always show it, rather than as missing", () => {
    expect(cleanPomodoroRowSettings("open-rooms", { floor: 0 })).toEqual({
      floor: 0,
    })
  })

  it("falls back on anything that is not a number in range", () => {
    for (const floor of [-1, 100_001, Number.NaN, Infinity, "20", null])
      expect(cleanPomodoroRowSettings("focus-hours", { floor })).toEqual({
        floor: 20,
      })
  })

  it("rounds a fractional floor down to a whole one", () => {
    expect(cleanPomodoroRowSettings("focus-hours", { floor: 12.9 })).toEqual({
      floor: 12,
    })
  })
})
