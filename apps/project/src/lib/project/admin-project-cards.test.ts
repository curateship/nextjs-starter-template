import { describe, expect, it } from "vitest"

import { projectCardList, projectDueLine } from "@/lib/project/admin-project-cards"
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

describe("the site admin's Projects card", () => {
  const onTrack = project("Brochure", 4)
  const slowing = project("Website", 5, ["2026-10-20"])
  const behind = project("Rebrand", 6, ["2026-10-20", "2026-10-21", "2026-10-22"])
  const idle = project("Archive photos", 0)

  it("puts Behind first, then Slowing down, then On track, and projects with nothing open under them", () => {
    const list = projectCardList([onTrack, idle, slowing, behind], [], [], NOW)
    expect(list.active.map((row) => [row.project.id, row.pace])).toEqual([
      ["Rebrand", "behind"],
      ["Website", "slowing"],
      ["Brochure", "on_track"],
    ])
    expect(list.idle.map((row) => row.project.id)).toEqual(["Archive photos"])
  })

  it("keeps a dragged order over late first, with a project missing from it after the rest", () => {
    const list = projectCardList([onTrack, slowing, behind], [], ["Brochure", "Website"], NOW)
    expect(list.active.map((row) => row.project.id)).toEqual(["Brochure", "Website", "Rebrand"])
  })

  it("takes hidden projects off the card and lists them by name", () => {
    const list = projectCardList([onTrack, slowing, behind, idle], ["Website", "Archive photos"], [], NOW)
    expect(list.active.map((row) => row.project.id)).toEqual(["Rebrand", "Brochure"])
    expect(list.idle).toEqual([])
    expect(list.hidden.map((row) => row.id)).toEqual(["Archive photos", "Website"])
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
