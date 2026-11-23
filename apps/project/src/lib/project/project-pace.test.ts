import { describe, expect, it } from "vitest"

import { countLate, projectPace } from "@/lib/project/project-pace"

const NOW = new Date("2026-10-19T15:00:00")

describe("a project's status from its late tasks", () => {
  it("counts what the red due date counts: open, and past its day or its time", () => {
    const late = countLate(
      [
        { dueDate: "2026-10-18", status: "todo" },
        { dueDate: "2026-10-18", status: "done" },
        { dueDate: "2026-10-19", status: "doing" },
        { dueDate: "2026-10-19", dueAt: new Date("2026-10-19T09:00:00").toISOString(), status: "stuck" },
        { dueDate: null, status: "todo" },
      ],
      NOW
    )
    expect(late).toBe(2)
  })

  it("is On track below both numbers, Slowing down from the first, Behind from the second", () => {
    const rule = { slowingAt: 1, behindAt: 3 }
    expect([0, 1, 2, 3, 9].map((late) => projectPace(late, rule))).toEqual([
      "on_track",
      "slowing",
      "slowing",
      "behind",
      "behind",
    ])
    // The same number for both skips Slowing down.
    expect(projectPace(2, { slowingAt: 2, behindAt: 2 })).toBe("behind")
  })
})
