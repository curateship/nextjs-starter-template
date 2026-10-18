import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { matchCatalogSlug, parseWorkoutExport, readCsv, readWhen } from "@/lib/fitness/import-parse"

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8")

describe("import files", () => {
  it("reads a Strong export with semicolons, units and warm-ups", () => {
    const parsed = parseWorkoutExport(fixture("strong.csv"), "kg")
    expect(parsed?.source).toBe("strong")
    expect(parsed?.workouts).toHaveLength(2)
    const legs = parsed!.workouts[0]
    expect(legs).toMatchObject({ name: "Morning, legs", day: "2024-01-15" })
    expect(legs.exercises.map((exercise) => exercise.name)).toEqual(["Squat (Barbell)", "Zercher Squat (Barbell)"])
    expect(legs.exercises[0].sets[0]).toEqual({ weightKg: 60, reps: 5, warmup: true })
    expect(legs.exercises[0].sets[1].warmup).toBe(false)
    // 225 lb is about 102.06 kg.
    expect(parsed!.workouts[1].exercises[0].sets[0].weightKg).toBeCloseTo(102.06, 2)
  })

  it("reads a Hevy export with written dates and an empty weight", () => {
    const parsed = parseWorkoutExport(fixture("hevy.csv"), "lb")
    expect(parsed?.source).toBe("hevy")
    expect(parsed?.workouts).toHaveLength(1)
    const workout = parsed!.workouts[0]
    expect(workout).toMatchObject({ name: "Pull Day", day: "2024-01-20", startedAt: "2024-01-20T09:15:00Z" })
    expect(workout.exercises[0].sets).toEqual([
      { weightKg: null, reps: 5, warmup: true },
      { weightKg: 10, reps: 8, warmup: false },
    ])
  })

  it("gives the same key to the same workout so a second import adds nothing", () => {
    const first = parseWorkoutExport(fixture("strong.csv"), "kg")!
    const second = parseWorkoutExport(fixture("strong.csv"), "kg")!
    expect(first.workouts.map((workout) => workout.key)).toEqual(second.workouts.map((workout) => workout.key))
  })

  it("refuses a file that is neither app's export", () => {
    expect(parseWorkoutExport("name,age\nAnna,30\n", "kg")).toBeNull()
    expect(parseWorkoutExport("", "kg")).toBeNull()
  })

  it("matches exported names to built-in lifts", () => {
    expect(matchCatalogSlug("Squat (Barbell)")).toBe("back-squat")
    expect(matchCatalogSlug("Bent Over Row (Barbell)")).toBe("barbell-row")
    expect(matchCatalogSlug("Pull Up")).toBe("pull-up")
    expect(matchCatalogSlug("Leg extension")).toBe("leg-extension")
    expect(matchCatalogSlug("Zercher Squat (Barbell)")).toBeNull()
  })

  it("keeps quoted commas and quotes inside a field", () => {
    expect(readCsv('a,b\n"x, ""y""",2\n')).toEqual([
      ["a", "b"],
      ['x, "y"', "2"],
    ])
    expect(readWhen("5 Mar 2024")).toEqual({ day: "2024-03-05", time: "00:00" })
  })
})
