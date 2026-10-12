import { describe, expect, it } from "vitest"

import {
  dueGroupOf,
  filterTasks,
  readTaskFilters,
  splitRecentDone,
} from "@/lib/project/task-filters"
import { placesAfterReorder } from "@/lib/project/task-order"

const task = (overrides: Partial<Parameters<typeof filterTasks>[0][number]> & { id: string }) => ({
  title: "",
  notesText: "",
  status: "todo" as const,
  assignee: null as { id: string } | null,
  labels: [] as { id: string }[],
  type: null as { id: string } | null,
  ...overrides,
})

describe("filtering tasks", () => {
  const tasks = [
    task({ id: "a", title: "Set up redirects", assignee: { id: "ben" }, labels: [{ id: "client" }] }),
    task({ id: "b", title: "Fonts", notesText: "Check the redirect list first", status: "doing" }),
    task({ id: "c", title: "Fix the 404 page", status: "stuck", assignee: { id: "maya" }, type: { id: "video" } }),
  ]
  const ids = (filters: Parameters<typeof filterTasks>[1]) => filterTasks(tasks, filters).map((t) => t.id)

  it("searches titles and notes, every word, whatever the capitals", () => {
    expect(ids({ q: "REDIRECT" })).toEqual(["a", "b"])
    expect(ids({ q: "redirect list" })).toEqual(["b"])
    expect(ids({ q: "zebra" })).toEqual([])
  })

  it("narrows by status, person, nobody and label, and together", () => {
    expect(ids({ status: "stuck" })).toEqual(["c"])
    expect(ids({ person: "ben" })).toEqual(["a"])
    expect(ids({ person: "nobody" })).toEqual(["b"])
    expect(ids({ label: "client" })).toEqual(["a"])
    expect(ids({ q: "redirect", status: "doing" })).toEqual(["b"])
    expect(ids({ type: "video" })).toEqual(["c"])
    expect(ids({})).toEqual(["a", "b", "c"])
  })

  it("reads only real filters from an address", () => {
    expect(readTaskFilters({ q: "x", status: "nope", person: "ben", label: "<script>", type: "video" })).toEqual({
      q: "x",
      person: "ben",
      type: "video",
    })
  })
})

describe("old Done tasks", () => {
  it("keeps tasks finished in the last 14 days and puts the rest, and any with no date, behind Show older", () => {
    const now = new Date("2099-03-30T12:00:00Z")
    const { recent, older } = splitRecentDone(
      [
        { id: "new", completedAt: "2099-03-20T00:00:00Z" },
        { id: "old", completedAt: "2099-03-10T00:00:00Z" },
        { id: "unknown", completedAt: null },
      ],
      now
    )
    expect(recent.map((t) => t.id)).toEqual(["new"])
    expect(older.map((t) => t.id)).toEqual(["old", "unknown"])
  })
})

describe("grouping My tasks by when they're due", () => {
  const today = "2099-03-04"
  it("puts each task in one group from the person's own day", () => {
    expect(dueGroupOf({ waiting: true, dueDate: "2099-01-01" }, today)).toBe("waiting")
    expect(dueGroupOf({ waiting: false, dueDate: "2099-03-03" }, today)).toBe("overdue")
    expect(dueGroupOf({ waiting: false, dueDate: today }, today)).toBe("today")
    expect(dueGroupOf({ waiting: false, dueDate: "2099-03-11" }, today)).toBe("week")
    expect(dueGroupOf({ waiting: false, dueDate: "2099-03-12" }, today)).toBe("later")
    expect(dueGroupOf({ waiting: false, dueDate: null }, today)).toBe("none")
  })

  it("moves with a time zone change, because today is passed in", () => {
    const task = { waiting: false, dueDate: "2099-03-05" }
    expect(dueGroupOf(task, "2099-03-04")).toBe("week")
    expect(dueGroupOf(task, "2099-03-05")).toBe("today")
  })
})

describe("the project's own order", () => {
  it("swaps the dragged tasks among their own places and leaves the rest alone", () => {
    const current = [
      { id: "a", position: 1 },
      { id: "b", position: 2 },
      { id: "c", position: 3 },
      { id: "d", position: 4 },
    ]
    // Only a, c and d are in the column being reordered; d moves to the top.
    const places = placesAfterReorder(current, ["d", "a", "c"])
    expect(Object.fromEntries(places)).toEqual({ d: 1, a: 3, c: 4 })
    expect(places.has("b")).toBe(false)
  })

  it("spreads out two tasks that shared a place", () => {
    const places = placesAfterReorder(
      [
        { id: "a", position: 5 },
        { id: "b", position: 5 },
      ],
      ["b", "a"]
    )
    expect(Object.fromEntries(places)).toEqual({ b: 5, a: 6 })
  })
})
