import { describe, expect, it } from "vitest"

import {
  DEFAULT_RHYTHM,
  followTimer,
  rhythmKey,
  type Rhythm,
} from "@/lib/pomodoro/timer-settings-form"

describe("followTimer", () => {
  const boxes: Rhythm = { ...DEFAULT_RHYTHM, focus: 30 }
  const timer: Rhythm = { ...DEFAULT_RHYTHM, focus: 26, short: 6 }

  it("puts a header change into every box nobody typed in", () => {
    expect(followTimer(boxes, timer, new Set())).toEqual(timer)
  })

  it("keeps what was typed in a box and follows the rest", () => {
    // Focus was typed as 30; the header then moved focus to 26 and the short
    // break to 6. Save must send 30 and 6, never the old 5.
    expect(followTimer(boxes, timer, new Set(["focus"]))).toEqual({
      ...timer,
      focus: 30,
    })
  })
})

describe("rhythmKey", () => {
  it("changes when any value changes", () => {
    expect(rhythmKey(DEFAULT_RHYTHM)).not.toBe(
      rhythmKey({ ...DEFAULT_RHYTHM, autoStart: true })
    )
  })
})
