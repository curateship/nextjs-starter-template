import { describe, expect, it } from "vitest"

import { filterHistory, groupHistory, historyFilterCount, readHistoryFilters } from "@/lib/fitness/history-filters"

const rows = [
  { id: "a", name: "Legs", day: "2026-10-19", finished: true, note: "", exerciseNames: ["Squat", "Lunge"] },
  { id: "b", name: "Push", day: "2026-10-14", finished: false, note: "shoulder sore", exerciseNames: ["Bench press"] },
  { id: "c", name: "Legs", day: "2026-09-30", finished: true, note: "", exerciseNames: ["Squat"] },
]

describe("History's filters", () => {
  it("reads only well-formed values from the address", () => {
    expect(readHistoryFilters({ q: "squat", status: "done", group: "month", name: "", exercise: "x".repeat(81) })).toEqual({
      q: "squat",
      group: "month",
    })
  })

  it("matches every word of the search in the name, exercises or note", () => {
    expect(filterHistory(rows, { q: "legs squat" }).map((row) => row.id)).toEqual(["a", "c"])
    expect(filterHistory(rows, { q: "SORE" }).map((row) => row.id)).toEqual(["b"])
  })

  it("narrows by workout, status and exercise together", () => {
    expect(filterHistory(rows, { name: "Legs", exercise: "Lunge" }).map((row) => row.id)).toEqual(["a"])
    expect(filterHistory(rows, { status: "unfinished" }).map((row) => row.id)).toEqual(["b"])
    expect(historyFilterCount({ q: "x", name: "Legs", status: "finished", group: "none" })).toBe(2)
  })

  it("groups by this week, last week then month, by month, or not at all", () => {
    const today = "2026-10-20"
    expect(groupHistory(rows, today).map((group) => group.name)).toEqual(["This week", "Last week", "September 2026"])
    expect(groupHistory(rows, today, "month").map((group) => group.name)).toEqual(["October 2026", "September 2026"])
    expect(groupHistory(rows, today, "none").map((group) => group.rows.length)).toEqual([3])
  })
})
