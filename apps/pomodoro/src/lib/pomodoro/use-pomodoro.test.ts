import { describe, expect, it } from "vitest"

import { advanceCycle } from "@/lib/pomodoro/use-pomodoro"

describe("the 4-focus cycle", () => {
  it("sends the first three finished focuses to a short break", () => {
    expect(advanceCycle("focus", 0)).toEqual({
      nextMode: "short",
      completedFocusSessions: 1,
    })
    expect(advanceCycle("focus", 1)).toEqual({
      nextMode: "short",
      completedFocusSessions: 2,
    })
    expect(advanceCycle("focus", 2)).toEqual({
      nextMode: "short",
      completedFocusSessions: 3,
    })
  })

  it("sends the 4th finished focus to the long break", () => {
    expect(advanceCycle("focus", 3)).toEqual({
      nextMode: "long",
      completedFocusSessions: 4,
    })
  })

  it("returns to focus after any break, and the long break restarts the count", () => {
    expect(advanceCycle("short", 2)).toEqual({
      nextMode: "focus",
      completedFocusSessions: 2,
    })
    expect(advanceCycle("long", 4)).toEqual({
      nextMode: "focus",
      completedFocusSessions: 0,
    })
  })
})
