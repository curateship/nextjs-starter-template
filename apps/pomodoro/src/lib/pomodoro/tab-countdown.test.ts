import { describe, expect, it } from "vitest"

import {
  countdownIconKey,
  countdownProgress,
  countdownTitle,
  formatCountdownClock,
  type CountdownFrame,
} from "@/lib/pomodoro/tab-countdown"

function frame(changes: Partial<CountdownFrame> = {}): CountdownFrame {
  return {
    running: true,
    mode: "focus",
    remainingSeconds: 1500,
    durationSeconds: 1500,
    ...changes,
  }
}

describe("tab countdown", () => {
  it("writes the clock as mm:ss, padded", () => {
    expect(formatCountdownClock(1500)).toBe("25:00")
    expect(formatCountdownClock(300)).toBe("05:00")
    expect(formatCountdownClock(59)).toBe("00:59")
    expect(formatCountdownClock(0)).toBe("00:00")
  })

  it("keeps counting past an hour, because a focus can be 90 minutes", () => {
    expect(formatCountdownClock(5400)).toBe("90:00")
  })

  it("never shows a negative clock when a tick arrives late", () => {
    expect(formatCountdownClock(-12)).toBe("00:00")
  })

  it("puts the time first and names the phase", () => {
    expect(countdownTitle(frame({ remainingSeconds: 760 }))).toBe("12:40 Focus")
    expect(countdownTitle(frame({ mode: "short", remainingSeconds: 300 }))).toBe(
      "05:00 Short break"
    )
    expect(countdownTitle(frame({ mode: "long", remainingSeconds: 900 }))).toBe(
      "15:00 Long break"
    )
  })

  it("gives no title at all when the timer is not running", () => {
    expect(countdownTitle(frame({ running: false }))).toBe("")
  })

  it("fills the ring as the phase runs out", () => {
    expect(countdownProgress(frame({ remainingSeconds: 1500 }))).toBe(0)
    expect(countdownProgress(frame({ remainingSeconds: 750 }))).toBe(0.5)
    expect(countdownProgress(frame({ remainingSeconds: 0 }))).toBe(1)
  })

  it("holds the ring inside its ends whatever the numbers say", () => {
    expect(countdownProgress(frame({ remainingSeconds: -30 }))).toBe(1)
    expect(countdownProgress(frame({ remainingSeconds: 9000 }))).toBe(0)
    expect(countdownProgress(frame({ durationSeconds: 0 }))).toBe(1)
  })

  it("redraws the icon once per whole percent, not once per second", () => {
    // Two seconds of a 25-minute focus is a tenth of a percent, so the key
    // is unchanged and the driver skips the canvas.
    expect(countdownIconKey(frame({ remainingSeconds: 1500 }))).toBe(
      countdownIconKey(frame({ remainingSeconds: 1499 }))
    )
    expect(countdownIconKey(frame({ remainingSeconds: 1485 }))).not.toBe(
      countdownIconKey(frame({ remainingSeconds: 1500 }))
    )
  })

  it("redraws when the phase changes at the same progress", () => {
    expect(countdownIconKey(frame({ mode: "focus" }))).not.toBe(
      countdownIconKey(frame({ mode: "short" }))
    )
  })
})
