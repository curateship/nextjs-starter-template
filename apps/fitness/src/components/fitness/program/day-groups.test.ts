import { describe, expect, it } from "vitest"

import { dateThisWeek, groupByBodyPart, groupedIds } from "@/components/fitness/program/day-groups"
import type { Exercise } from "@/lib/api/fitness/exercises"
import type { DayExercise } from "@/lib/api/fitness/programs"
import { bodyPartOf } from "@/lib/fitness/exercise-catalog"

const day = (id: string, exerciseId: string, groupKey: string | null = null) =>
  ({ id, exerciseId, groupKey }) as unknown as DayExercise
const lift = (id: string, muscles: string[]) => [id, { id, muscles } as unknown as Exercise] as const
const library = new Map([
  lift("bench", ["chest", "triceps"]),
  lift("row", ["upper_back", "biceps"]),
  lift("fly", ["chest"]),
  lift("curl", ["biceps"]),
  lift("plank", []),
])

describe("a day's body parts", () => {
  it("takes a lift's body part from its main muscle", () => {
    expect(bodyPartOf(["lats", "biceps"])).toBe("back")
    expect(bodyPartOf(["triceps"])).toBe("arms")
    expect(bodyPartOf(["calves"])).toBe("legs")
    expect(bodyPartOf([])).toBe("other")
  })

  it("groups in the order each body part first appears, and saves the order shown", () => {
    const rows = ["bench", "row", "fly", "curl", "plank"].map((exerciseId, index) => day(`r${index}`, exerciseId))
    const groups = groupByBodyPart(rows, library)
    expect(groups.map((group) => [group.part, group.rows.map((row) => row.exerciseId)])).toEqual([
      ["chest", ["bench", "fly"]],
      ["back", ["row"]],
      ["arms", ["curl"]],
      ["other", ["plank"]],
    ])
    expect(groupedIds(groups)).toEqual(["r0", "r2", "r1", "r3", "r4"])
  })

  it("keeps a superset together under its first lift's body part", () => {
    // Bench press and row as a superset, then a fly: the row stays with the bench press under Chest.
    const rows = [day("a", "bench", "s1"), day("b", "row", "s1"), day("c", "curl"), day("d", "fly")]
    const groups = groupByBodyPart(rows, library)
    expect(groups.map((group) => [group.part, group.rows.map((row) => row.id)])).toEqual([
      ["chest", ["a", "b", "d"]],
      ["arms", ["c"]],
    ])
  })

  it("dates a weekday in the Monday-to-Sunday week holding today", () => {
    // Tuesday 20 Oct 2026: its Wednesday is the 21st and its Sunday the 25th.
    expect(dateThisWeek("2026-10-20", 3)).toBe("2026-10-21")
    expect(dateThisWeek("2026-10-20", 0)).toBe("2026-10-25")
  })
})
