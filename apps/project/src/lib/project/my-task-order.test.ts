import { describe, expect, it } from "vitest"

import { canMove, dropChange, inMyOrder, takesDrops } from "@/lib/project/my-task-order"

/* Tyler's answers, 23 Oct 2026 (workspace/tasks/Misc/drag-tasks-on-my-dashboard.md). */
describe("a drop", () => {
  it("gives each heading its day: today, tomorrow, eight days on, none, or Done", () => {
    expect(dropChange("today", "2099-03-02")).toEqual({ dueDate: "2099-03-02" })
    expect(dropChange("week", "2099-03-02")).toEqual({ dueDate: "2099-03-03" })
    expect(dropChange("later", "2099-03-02")).toEqual({ dueDate: "2099-03-10" })
    expect(dropChange("none", "2099-03-02")).toEqual({ dueDate: null })
    expect(dropChange("done", "2099-03-02")).toEqual({ status: "done" })
    expect(dropChange("overdue", "2099-03-02")).toBeNull()
    expect(dropChange("waiting", "2099-03-02")).toBeNull()
  })

  it("never puts a task under Overdue or Waiting, nor takes one out of Waiting, Done or the picks", () => {
    expect(canMove("none", "today")).toBe(true)
    expect(canMove("overdue", "today")).toBe(true)
    expect(canMove("today", "overdue")).toBe(false)
    expect(canMove("today", "waiting")).toBe(false)
    expect(canMove("waiting", "today")).toBe(false)
    expect(canMove("done", "today")).toBe(false)
    expect(canMove("picked", "today")).toBe(false)
    expect(canMove("today", "picked")).toBe(false)
  })

  it("shows only the headings that take drops when they are empty", () => {
    expect(["overdue", "today", "week", "later", "none", "done", "waiting", "picked"].filter(takesDrops)).toEqual([
      "today",
      "week",
      "later",
      "none",
      "done",
    ])
  })

})

describe("my order under a heading", () => {
  it("puts the rows I placed first, then newcomers as they came", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]
    const places = [
      { taskId: "c", heading: "today", position: 0 },
      { taskId: "a", heading: "today", position: 1 },
      // Placed under another heading, so a newcomer here.
      { taskId: "b", heading: "none", position: 0 },
    ]
    expect(inMyOrder(rows, "today", places).map((row) => row.id)).toEqual(["c", "a", "b", "d"])
  })
})
