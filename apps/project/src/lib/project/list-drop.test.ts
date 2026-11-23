import { describe, expect, it } from "vitest"

import { settleDrop } from "@/lib/project/list-drop"
import { canMove } from "@/lib/project/my-task-order"

const today = { key: "today", taskIds: ["a", "b", "c"] }

describe("a row let go", () => {
  it("reorders inside its heading, and calls it no change when the order is the same", () => {
    expect(settleDrop(today, "today", "a", ["b", "c", "a"], canMove)).toEqual({
      taskId: "a",
      from: "today",
      to: "today",
      taskIds: ["b", "c", "a"],
    })
    expect(settleDrop(today, "today", "a", ["a", "b", "c"], canMove)).toBeNull()
  })

  it("moves under another heading with that heading's rows in their new order", () => {
    expect(settleDrop({ key: "none", taskIds: ["d"] }, "today", "d", ["a", "d", "b"], canMove)).toEqual({
      taskId: "d",
      from: "none",
      to: "today",
      taskIds: ["a", "d", "b"],
    })
  })

  it("refuses a move the rules don't allow", () => {
    expect(settleDrop({ key: "waiting", taskIds: ["w"] }, "today", "w", ["w", "a"], canMove)).toBeNull()
    expect(settleDrop(today, "waiting", "a", ["a", "w"], canMove)).toBeNull()
  })
})
