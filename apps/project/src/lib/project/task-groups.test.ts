import { describe, expect, it } from "vitest"

import { canMoveInGroup, groupMyTasks, groupTasks, type GroupableTask } from "@/lib/project/task-groups"

const NOW = new Date("2026-10-19T12:00:00")

function task(overrides: Partial<GroupableTask> & { title: string }) {
  return {
    status: "todo" as const,
    priority: "normal" as const,
    dueDate: null,
    dueAt: null,
    assignee: null,
    ...overrides,
  }
}

const tasks = [
  task({ title: "Fix login", dueDate: "2026-10-17", priority: "high" }),
  task({ title: "Call Sam", dueDate: "2026-10-19", assignee: { id: "sam", name: "Sam" } }),
  task({ title: "Plan", dueDate: "2026-10-23" }),
  task({ title: "Book room", dueDate: "2026-10-20" }),
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
  it("groups by when it's due, on the reader's clock, leaving out empty groups", () => {
    expect(grouped("due")).toEqual([
      ["Overdue", ["Fix login"]],
      ["Today", ["Call Sam"]],
      ["Tomorrow", ["Book room"]],
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
      ["Nobody", ["Fix login", "Plan", "Book room", "Someday", "Shipped"]],
    ])
  })

  it("is one plain list for None", () => {
    expect(groupTasks(tasks, "none", NOW)).toBeNull()
  })
})

describe("dragging a row under another heading (Tyler, 24 Oct 2026)", () => {
  it("takes any status, priority or person", () => {
    expect(canMoveInGroup("status", "stuck")).toBe(true)
    expect(canMoveInGroup("priority", "low")).toBe(true)
    expect(canMoveInGroup("assignee", "none")).toBe(true)
  })

  it("takes Today, Tomorrow, This week, Later and No due date, never Overdue or Earlier", () => {
    expect(
      ["overdue", "today", "tomorrow", "week", "later", "earlier", "none"].filter((key) => canMoveInGroup("due", key))
    ).toEqual([
      "today",
      "tomorrow",
      "week",
      "later",
      "none",
    ])
  })

  it("has nowhere else to go with no grouping", () => {
    expect(canMoveInGroup("none", "all")).toBe(false)
  })
})

describe("My dashboard's Group row", () => {
  it("groups by project, by name, and the rest as a project's List does", () => {
    const mine = [
      { ...task({ title: "Logo" }), projectId: "b", projectName: "Brand" },
      { ...task({ title: "Footer", status: "doing" }), projectId: "w", projectName: "Website" },
      { ...task({ title: "Colours" }), projectId: "b", projectName: "Brand" },
    ]
    const byProject = groupMyTasks(mine, "project", NOW)
    expect(byProject.groups).toEqual([
      { key: "b", label: "Brand" },
      { key: "w", label: "Website" },
    ])
    expect(mine.filter((t) => byProject.groupsOf(t).includes("b")).map((t) => t.title)).toEqual(["Logo", "Colours"])
    expect(groupMyTasks(mine, "status", NOW).groups.map((g) => g.label)).toEqual(["To do", "Doing"])
  })
})
