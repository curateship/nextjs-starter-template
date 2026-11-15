import { describe, expect, it } from "vitest"

import { pacedProject, projectDueLine } from "@/lib/project/admin-project-cards"
import type { TaskStatus } from "@/lib/project/rules"

const NOW = new Date("2026-10-29T15:00:00")

function project(id: string, open: number, lateDays: string[] = []) {
  const counts: Record<TaskStatus, number> = { todo: open, doing: 0, done: 2, stuck: 0, archived: 0 }
  return {
    id,
    name: id,
    counts,
    dated: lateDays.map((dueDate) => ({ dueDate, dueAt: null, status: "todo" as TaskStatus })),
    slowingAt: 1,
    behindAt: 3,
  }
}

describe("a Projects block's pace", () => {
  it("is On track, Slowing down or Behind by how many tasks are late", () => {
    expect(pacedProject(project("Brochure", 4), NOW)).toMatchObject({ late: 0, pace: "on_track" })
    expect(pacedProject(project("Website", 5, ["2026-10-20"]), NOW)).toMatchObject({ late: 1, pace: "slowing" })
    expect(pacedProject(project("Rebrand", 6, ["2026-10-20", "2026-10-21", "2026-10-22"]), NOW)).toMatchObject({
      late: 3,
      pace: "behind",
    })
  })

  it("counts no task as late before its due day is over", () => {
    expect(pacedProject(project("Launch", 2, ["2026-10-29"]), NOW)).toMatchObject({ late: 0, pace: "on_track" })
  })
})

describe("a project's due line", () => {
  it("counts days left on the site admin's own today", () => {
    expect(projectDueLine("2026-11-20", "2026-10-29")).toEqual({ text: "Due Nov 20 · 22 days left", overdue: false })
    expect(projectDueLine("2026-10-30", "2026-10-29")).toEqual({ text: "Due tomorrow", overdue: false })
    expect(projectDueLine("2026-10-29", "2026-10-29")).toEqual({ text: "Due today", overdue: false })
    expect(projectDueLine("2026-10-20", "2026-10-29")).toEqual({ text: "Overdue · Oct 20", overdue: true })
    expect(projectDueLine(null, "2026-10-29")).toBeNull()
  })
})
