import { describe, expect, it } from "vitest"

import {
  completionAlertMessage,
  createCompletionAlertGate,
  fireCompletionAlert,
  setCompletionAlertsEnabled,
} from "@/lib/completion-alerts"

describe("completion alerts", () => {
  it("fires exactly once per completed timer transition", () => {
    const gate = createCompletionAlertGate()
    expect(gate("focus:1000")).toBe(true)
    expect(gate("focus:1000")).toBe(false)
    expect(gate("focus:1000")).toBe(false)
    expect(gate("short:2000")).toBe(true)
    expect(gate("focus:3000")).toBe(true)
  })

  it("suppresses duplicates across many later transitions", () => {
    const gate = createCompletionAlertGate()
    expect(gate("focus:1")).toBe(true)
    for (let i = 2; i <= 15; i++) gate(`focus:${i}`)
    expect(gate("focus:1")).toBe(false)
  })

  it("describes the completed mode", () => {
    expect(completionAlertMessage("focus")).toContain("break")
    expect(completionAlertMessage("short")).toContain("focus")
    expect(completionAlertMessage("long")).toContain("focus")
  })

  it("never fires while alerts are disabled and never throws without a browser", () => {
    setCompletionAlertsEnabled(false)
    expect(fireCompletionAlert("focus:42", "done")).toBe(false)

    setCompletionAlertsEnabled(true)
    // Runs in node: no window, AudioContext, or Notification. Must stay safe.
    expect(fireCompletionAlert("focus:42", "done")).toBe(true)
    expect(fireCompletionAlert("focus:42", "done")).toBe(false)
    setCompletionAlertsEnabled(false)
  })
})
