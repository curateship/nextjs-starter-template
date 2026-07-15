import { describe, expect, it } from "vitest"

import {
  createTimer,
  getRemainingSeconds,
  incrementTaskPomodoros,
  pauseTimer,
  resetTimer,
  resolveSelectedTaskId,
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

  it("keeps a valid active selection and ignores stale hydration", () => {
    const tasks: GuestTask[] = [
      { id: "active", title: "Active task", completed: false, pomodoros: 0 },
      { id: "done", title: "Completed task", completed: true, pomodoros: 2 },
    ]
    expect(resolveSelectedTaskId(tasks, "active")).toBe("active")
    expect(resolveSelectedTaskId(tasks, "missing")).toBeNull()
    expect(resolveSelectedTaskId(tasks, "done")).toBeNull()
    expect(resolveSelectedTaskId(tasks, 42)).toBeNull()
  })

  it("clears a removed selection and increments only its completed focus", () => {
    const tasks: GuestTask[] = [
      { id: "selected", title: "Selected task", completed: false, pomodoros: 1 },
      { id: "other", title: "Other task", completed: false, pomodoros: 3 },
    ]
    expect(incrementTaskPomodoros(tasks, "selected")).toEqual([{ ...tasks[0], pomodoros: 2 }, tasks[1]])
    expect(resolveSelectedTaskId(tasks.filter((task) => task.id !== "selected"), "selected")).toBeNull()
  })
})
