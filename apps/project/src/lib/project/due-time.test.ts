import { afterEach, describe, expect, it } from "vitest"

import { dueDayOf, isOverdue, localTimeOf, momentOnDay } from "@/lib/project/dates"
import { dueGroupOf } from "@/lib/project/task-filters"

const zoneBefore = process.env.TZ
afterEach(() => {
  process.env.TZ = zoneBefore
})

describe("a due time of day", () => {
  it("is overdue from the time, not the next morning", () => {
    const dueAt = momentOnDay("2099-03-02", "15:00")
    const before = new Date(new Date(dueAt).getTime() - 60_000)
    const after = new Date(new Date(dueAt).getTime() + 60_000)
    expect(isOverdue("2099-03-02", "todo", dueAt, before)).toBe(false)
    expect(isOverdue("2099-03-02", "todo", dueAt, after)).toBe(true)
    expect(isOverdue("2099-03-02", "done", dueAt, after)).toBe(false)
    expect(dueGroupOf({ waiting: false, dueDate: "2099-03-02", dueAt }, "2099-03-02", before)).toBe("today")
    expect(dueGroupOf({ waiting: false, dueDate: "2099-03-02", dueAt }, "2099-03-02", after)).toBe("overdue")
  })

  it("keeps a task with no time due all day", () => {
    expect(isOverdue("2099-03-02", "todo", null, new Date(2099, 2, 2, 23, 59))).toBe(false)
    expect(dueDayOf({ dueDate: "2099-03-02", dueAt: null })).toBe("2099-03-02")
  })

  it("reads the time and the day on each person's own clock", () => {
    process.env.TZ = "America/Toronto"
    // Set in Toronto at 9:30 PM on 2 March.
    const dueAt = momentOnDay("2099-03-02", "21:30")
    expect(localTimeOf(dueAt)).toBe("21:30")
    process.env.TZ = "Europe/London"
    // Five hours ahead, that is 2:30 AM on 3 March.
    expect(localTimeOf(dueAt)).toBe("02:30")
    expect(dueDayOf({ dueDate: "2099-03-02", dueAt })).toBe("2099-03-03")
  })
})
