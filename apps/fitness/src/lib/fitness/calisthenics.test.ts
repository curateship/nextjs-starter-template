import { describe, expect, it } from "vitest"

import { defaultRange, nextCalisthenics } from "@/lib/fitness/calisthenics"
import { EXERCISE_CATALOG, harderVersionOf, ladderOf } from "@/lib/fitness/exercise-catalog"

const plan = { reps: 8, repsMin: 8, repsMax: 12, goodStreak: 0 }
const rules = { sessionsToStep: 1, hasHarder: true }

describe("a Calisthenics move getting harder", () => {
  it("steps up to the next version at the bottom of the range after every set at the top", () => {
    expect(nextCalisthenics(plan, { allDone: true, reps: [12, 12, 12] }, rules)).toEqual({
      ...plan,
      reps: 8,
      goodStreak: 0,
      stepUp: true,
    })
  })

  it("aims one rep above the fewest done, inside the range, after anything less", () => {
    expect(nextCalisthenics({ ...plan, reps: 10 }, { allDone: true, reps: [12, 10, 9] }, rules).reps).toBe(10)
    expect(nextCalisthenics(plan, { allDone: true, reps: [5, 5, 5] }, rules).reps).toBe(8)
    expect(nextCalisthenics(plan, { allDone: false, reps: [12, 12] }, rules)).toMatchObject({ reps: 12, stepUp: false })
  })

  it("waits for as many good sessions in a row as the program asks", () => {
    const first = nextCalisthenics(plan, { allDone: true, reps: [12, 12, 12] }, { ...rules, sessionsToStep: 2 })
    expect(first).toMatchObject({ stepUp: false, goodStreak: 1, reps: 12 })
    expect(nextCalisthenics(first, { allDone: true, reps: [12, 12, 12] }, { ...rules, sessionsToStep: 2 }).stepUp).toBe(true)
  })

  it("keeps adding reps at the top of its ladder", () => {
    expect(nextCalisthenics(plan, { allDone: true, reps: [12, 12, 12] }, { ...rules, hasHarder: false })).toEqual({
      reps: 13,
      repsMin: 9,
      repsMax: 13,
      goodStreak: 0,
      stepUp: false,
    })
  })

  it("stops a range climbing past 100", () => {
    const top = { reps: 100, repsMin: 96, repsMax: 100, goodStreak: 0 }
    expect(nextCalisthenics(top, { allDone: true, reps: [100] }, { ...rules, hasHarder: false })).toMatchObject({
      reps: 100,
      repsMin: 96,
      repsMax: 100,
    })
  })

  it("gives a move with only a target a range of four more", () => {
    expect(defaultRange(8)).toEqual({ repsMin: 8, repsMax: 12 })
  })
})

describe("the Calisthenics ladders", () => {
  it("climbs from knee push-ups to push-ups, and every harder version is a Calisthenics move of the same kind", () => {
    expect(harderVersionOf("cal-knee-push-up")).toBe("cal-push-up")
    expect(ladderOf("cal-push-up")[0]).toBe("cal-wall-push-up")
    const bySlug = new Map(EXERCISE_CATALOG.map((exercise) => [exercise.slug, exercise]))
    for (const exercise of EXERCISE_CATALOG) {
      if (!exercise.harder) continue
      const harder = bySlug.get(exercise.harder)
      expect(harder, exercise.slug).toBeDefined()
      expect(harder?.routineType).toBe("calisthenics")
      expect(harder?.timed ?? false).toBe(exercise.timed ?? false)
    }
  })
})
