import { describe, expect, it } from "vitest"

import { advanceCycle } from "@/lib/pomodoro/use-pomodoro"

describe("the long-break cycle the rhythm asks for", () => {
  it("takes the long break after the 2nd focus on a two-focus rhythm", () => {
    expect(advanceCycle("focus", 0, 2)).toEqual({
      nextMode: "short",
      completedFocusSessions: 1,
    })
    expect(advanceCycle("focus", 1, 2)).toEqual({
      nextMode: "long",
      completedFocusSessions: 2,
    })
  })

  it("counts to eight when the rhythm says eight", () => {
    expect(advanceCycle("focus", 6, 8)).toEqual({
      nextMode: "short",
      completedFocusSessions: 7,
    })
    expect(advanceCycle("focus", 7, 8)).toEqual({
      nextMode: "long",
      completedFocusSessions: 8,
    })
  })

  it("restarts the count after the long break, whatever the rhythm", () => {
    expect(advanceCycle("long", 2, 2)).toEqual({
      nextMode: "focus",
      completedFocusSessions: 0,
    })
  })

  it("still lands on the long break when the number was lowered mid-cycle", () => {
    // Three focuses done, then the rhythm dropped to two: the next finished
    // focus must not count past its own target for ever.
    expect(advanceCycle("focus", 3, 2)).toEqual({
      nextMode: "long",
      completedFocusSessions: 2,
    })
  })

  it("falls back to four for a number outside 2 to 8", () => {
    expect(advanceCycle("focus", 3, 0)).toEqual({
      nextMode: "long",
      completedFocusSessions: 4,
    })
    expect(advanceCycle("focus", 3, 99)).toEqual({
      nextMode: "long",
      completedFocusSessions: 4,
    })
  })
})

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
