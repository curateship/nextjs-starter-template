import { describe, expect, it } from "vitest"

import {
  completionAlertMessage,
  createCompletionAlertGate,
} from "@/lib/pomodoro/completion-alerts"

describe("completion alerts", () => {
  it("fires once per completed countdown, however many ticks see it", () => {
    const gate = createCompletionAlertGate()
    expect(gate("focus:1000")).toBe(true)
    expect(gate("focus:1000")).toBe(false)
    expect(gate("short:2000")).toBe(true)
  })

  it("words the message by what just finished", () => {
    expect(completionAlertMessage("focus")).toBe(
      "Focus session complete. Time for a break."
    )
    expect(completionAlertMessage("short")).toBe(
      "Break finished. Ready to focus?"
    )
  })
})
