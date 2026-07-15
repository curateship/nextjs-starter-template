import { describe, expect, it } from "vitest"

import {
  createTimer,
  getRemainingSeconds,
  pauseTimer,
  resetTimer,
  startTimer,
  toggleTask,
  type GuestTask,
} from "@/lib/pomodoro"

describe("guest pomodoro timer", () => {
  it("uses a target timestamp so elapsed time survives backgrounding", () => {
    const timer = startTimer(createTimer("focus", 25), 1_000)

    expect(getRemainingSeconds(timer, 61_000)).toBe(24 * 60)
    expect(getRemainingSeconds(timer, 1_501_000)).toBe(0)
  })

  it("pauses at the calculated remaining time", () => {
    const timer = startTimer(createTimer("focus", 25), 1_000)
    const paused = pauseTimer(timer, 31_000)

    expect(paused.running).toBe(false)
    expect(paused.remainingSeconds).toBe(24 * 60 + 30)
    expect(getRemainingSeconds(paused, 90_000)).toBe(24 * 60 + 30)
  })

  it("resets to the configured duration", () => {
    const timer = startTimer(createTimer("short", 5), 1_000)

    expect(resetTimer(timer)).toMatchObject({
      running: false,
      remainingSeconds: 5 * 60,
      targetTimestamp: null,
    })
  })
})

describe("guest tasks", () => {
  it("toggles only the selected task", () => {
    const tasks: GuestTask[] = [
      { id: "one", title: "Plan the day", completed: false, pomodoros: 0 },
      { id: "two", title: "Write the brief", completed: false, pomodoros: 1 },
    ]

    expect(toggleTask(tasks, "two")).toEqual([
      tasks[0],
      { ...tasks[1], completed: true },
    ])
  })
})
