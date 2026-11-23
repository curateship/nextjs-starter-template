import { describe, expect, it } from "vitest"

import {
  applyActiveTaskOrder,
  createTimer,
  getRemainingSeconds,
  incrementTaskPomodoros,
  normalizeDailyGoalSessions,
  normalizeEstimatedPomodoros,
  normalizeGuestTasks,
  normalizeTaskPriority,
  orderTasksForDisplay,
  pauseTimer,
  resetTimer,
  resolveSelectedTaskId,
  startTimer,
  taskProgressLabel,
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

function guestTask(overrides: Partial<GuestTask> & { id: string; title: string }): GuestTask {
  return { completed: false, pomodoros: 0, priority: "normal", estimatedPomodoros: null, ...overrides }
}

describe("guest tasks", () => {
  it("toggles only the selected task", () => {
    const tasks: GuestTask[] = [
      guestTask({ id: "one", title: "Plan the day" }),
      guestTask({ id: "two", title: "Write the brief", pomodoros: 1 }),
    ]

    expect(toggleTask(tasks, "two")).toEqual([
      tasks[0],
      { ...tasks[1], completed: true },
    ])
  })

  it("keeps a valid active selection and ignores stale hydration", () => {
    const tasks: GuestTask[] = [
      guestTask({ id: "active", title: "Active task" }),
      guestTask({ id: "done", title: "Completed task", completed: true, pomodoros: 2 }),
    ]
    expect(resolveSelectedTaskId(tasks, "active")).toBe("active")
    expect(resolveSelectedTaskId(tasks, "missing")).toBeNull()
    expect(resolveSelectedTaskId(tasks, "done")).toBeNull()
    expect(resolveSelectedTaskId(tasks, 42)).toBeNull()
  })

  it("clears a removed selection and increments only its completed focus", () => {
    const tasks: GuestTask[] = [
      guestTask({ id: "selected", title: "Selected task", pomodoros: 1 }),
      guestTask({ id: "other", title: "Other task", pomodoros: 3 }),
    ]
    expect(incrementTaskPomodoros(tasks, "selected")).toEqual([{ ...tasks[0], pomodoros: 2 }, tasks[1]])
    expect(resolveSelectedTaskId(tasks.filter((task) => task.id !== "selected"), "selected")).toBeNull()
  })
})

describe("task planning", () => {
  it("normalizes stored guest tasks and fills planning defaults", () => {
    const tasks = normalizeGuestTasks([
      { id: "legacy", title: "Saved before planning existed", completed: true, pomodoros: 3 },
      { id: "planned", title: "Planned task", completed: false, pomodoros: 1, priority: "high", estimatedPomodoros: 4 },
      { id: "broken", title: "Bad fields", completed: "yes", pomodoros: -2, priority: "urgent", estimatedPomodoros: 99 },
      { title: "No id at all" },
      "garbage",
    ])
    expect(tasks).toEqual([
      guestTask({ id: "legacy", title: "Saved before planning existed", completed: true, pomodoros: 3 }),
      guestTask({ id: "planned", title: "Planned task", pomodoros: 1, priority: "high", estimatedPomodoros: 4 }),
      guestTask({ id: "broken", title: "Bad fields" }),
    ])
    expect(normalizeGuestTasks("not-an-array")).toBeNull()
    expect(normalizeGuestTasks(undefined)).toBeNull()
  })

  it("bounds priorities and estimates", () => {
    expect(normalizeTaskPriority("high")).toBe("high")
    expect(normalizeTaskPriority("urgent")).toBe("normal")
    expect(normalizeEstimatedPomodoros(1)).toBe(1)
    expect(normalizeEstimatedPomodoros(20)).toBe(20)
    expect(normalizeEstimatedPomodoros(0)).toBeNull()
    expect(normalizeEstimatedPomodoros(21)).toBeNull()
    expect(normalizeEstimatedPomodoros(2.5)).toBeNull()
    expect(normalizeEstimatedPomodoros("3")).toBeNull()
  })

  it("groups completed tasks after active tasks while keeping relative order", () => {
    const tasks = [
      guestTask({ id: "done-early", title: "Done early", completed: true }),
      guestTask({ id: "first", title: "First" }),
      guestTask({ id: "done-late", title: "Done late", completed: true }),
      guestTask({ id: "second", title: "Second" }),
    ]
    expect(orderTasksForDisplay(tasks).map((task) => task.id)).toEqual(["first", "second", "done-early", "done-late"])
  })

  it("applies a full active order and rejects partial, foreign, or duplicate orders", () => {
    const tasks = [
      guestTask({ id: "a", title: "A" }),
      guestTask({ id: "b", title: "B" }),
      guestTask({ id: "done", title: "Done", completed: true }),
    ]
    expect(applyActiveTaskOrder(tasks, ["b", "a"])?.map((task) => task.id)).toEqual(["b", "a", "done"])
    expect(applyActiveTaskOrder(tasks, ["a"])).toBeNull()
    expect(applyActiveTaskOrder(tasks, ["a", "a"])).toBeNull()
    expect(applyActiveTaskOrder(tasks, ["a", "ghost"])).toBeNull()
    expect(applyActiveTaskOrder(tasks, ["a", "b", "done"])).toBeNull()
  })

  it("shows progress against the estimate only when one is set", () => {
    expect(taskProgressLabel(guestTask({ id: "t", title: "T", pomodoros: 1 }))).toBe("1 pomo")
    expect(taskProgressLabel(guestTask({ id: "t", title: "T", pomodoros: 2 }))).toBe("2 pomos")
    expect(taskProgressLabel(guestTask({ id: "t", title: "T", pomodoros: 2, estimatedPomodoros: 4 }))).toBe("2/4 pomos")
    expect(taskProgressLabel(guestTask({ id: "t", title: "T", pomodoros: 0, estimatedPomodoros: 1 }))).toBe("0/1 pomos")
  })
})

describe("guest daily goal", () => {
  it("accepts bounded session goals and resets invalid stored values", () => {
    expect(normalizeDailyGoalSessions(1)).toBe(1)
    expect(normalizeDailyGoalSessions(20)).toBe(20)
    expect(normalizeDailyGoalSessions(0)).toBe(4)
    expect(normalizeDailyGoalSessions(21)).toBe(4)
    expect(normalizeDailyGoalSessions(2.5)).toBe(4)
    expect(normalizeDailyGoalSessions("8")).toBe(4)
  })
})
