import { describe, expect, it } from "vitest"

import { canMoveInGroup, groupTasks, type GroupableTask } from "@/lib/project/task-groups"

const NOW = new Date("2026-10-19T12:00:00")

function task(overrides: Partial<GroupableTask> & { title: string }) {
  return {
    status: "todo" as const,
    priority: "normal" as const,
    dueDate: null,
    dueAt: null,
    labels: [],
    assignee: null,
    type: null,
    ...overrides,
  }
}

const bug = { id: "bug", name: "Bug" }
const client = { id: "client", name: "Client" }
const tasks = [
  task({ title: "Fix login", labels: [bug, client], dueDate: "2026-10-17", priority: "high" }),
  task({ title: "Call Sam", labels: [client], dueDate: "2026-10-19", assignee: { id: "sam", name: "Sam" } }),
  task({ title: "Plan", dueDate: "2026-10-23" }),
  task({ title: "Someday", dueDate: "2026-12-01", status: "doing" }),
  task({ title: "Shipped", dueDate: "2026-10-10", status: "done" }),
]

function grouped(grouping: Parameters<typeof groupTasks>[1]) {
  const result = groupTasks(tasks, grouping, NOW)!
  return result.groups.map((group) => [
    group.label,
    tasks.filter((t) => result.groupsOf(t).includes(group.key)).map((t) => t.title),
  ])
}

describe("grouping tasks, as Filter's Group row does", () => {
  it("puts a task with two tags under both, and untagged ones last", () => {
    expect(grouped("tags")).toEqual([
      ["Bug", ["Fix login"]],
      ["Client", ["Fix login", "Call Sam"]],
      ["No tags", ["Plan", "Someday", "Shipped"]],
    ])
  })

  it("groups by when it's due, on the reader's clock, leaving out empty groups", () => {
    expect(grouped("due")).toEqual([
      ["Overdue", ["Fix login"]],
      ["Today", ["Call Sam"]],
      ["This week", ["Plan"]],
      ["Later", ["Someday"]],
      ["Earlier", ["Shipped"]],
    ])
  })

  it("groups by status, priority and person in their own order", () => {
    expect(grouped("status").map(([label]) => label)).toEqual(["To do", "Doing", "Done"])
    expect(grouped("priority").map(([label]) => label)).toEqual(["High", "Normal"])
    expect(grouped("assignee")).toEqual([
      ["Sam", ["Call Sam"]],
      ["Nobody", ["Fix login", "Plan", "Someday", "Shipped"]],
    ])
  })

  it("is one plain list for None", () => {
    expect(groupTasks(tasks, "none", NOW)).toBeNull()
  })
})

describe("dragging a row under another heading (Tyler, 24 Oct 2026)", () => {
  const [fixLogin, callSam, plan] = tasks

  it("takes any status, priority, person or type", () => {
    expect(canMoveInGroup("status", "stuck", plan)).toBe(true)
    expect(canMoveInGroup("priority", "low", plan)).toBe(true)
    expect(canMoveInGroup("assignee", "none", callSam)).toBe(true)
    expect(canMoveInGroup("type", "none", plan)).toBe(true)
  })

  it("takes Today, This week, Later and No due date, never Overdue or Earlier", () => {
    expect(["overdue", "today", "week", "later", "earlier", "none"].filter((key) => canMoveInGroup("due", key, plan))).toEqual([
      "today",
      "week",
      "later",
      "none",
    ])
  })

  it("swaps a tag: never onto a tag it has, and to No tags only from its one tag", () => {
    expect(canMoveInGroup("tags", "client", fixLogin)).toBe(false)
    expect(canMoveInGroup("tags", "bug", callSam)).toBe(true)
    expect(canMoveInGroup("tags", "none", fixLogin)).toBe(false)
    expect(canMoveInGroup("tags", "none", callSam)).toBe(true)
    expect(canMoveInGroup("tags", "bug", plan)).toBe(true)
  })

  it("has nowhere else to go with no grouping", () => {
    expect(canMoveInGroup("none", "all", plan)).toBe(false)
  })
})
