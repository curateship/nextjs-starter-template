import { describe, expect, it } from "vitest"

import { habitIconSchema, newHabitSchema } from "@/lib/project/daily-card"
import { READY_ROUTINES } from "@/lib/project/daily-words"

describe("a habit's icon", () => {
  it("takes any icon the shell's picker offers: a library key or a Lucide name", () => {
    expect(habitIconSchema.safeParse("bookOpen").success).toBe(true)
    expect(habitIconSchema.safeParse("octagon-x").success).toBe(true)
    expect(habitIconSchema.safeParse("cup-soda").success).toBe(true)
  })

  it("refuses a name no picker offers, and the old short names Lucide doesn't have", () => {
    expect(habitIconSchema.safeParse("not-an-icon").success).toBe(false)
    expect(habitIconSchema.safeParse("cup").success).toBe(false)
    expect(habitIconSchema.safeParse("x".repeat(65)).success).toBe(false)
    expect(newHabitSchema.safeParse({ name: "Walk", part: "morning", icon: null, target: 1, days: [], atTime: null }).success).toBe(true)
  })

  it("gives every sample routine an icon the picker offers", () => {
    for (const habits of Object.values(READY_ROUTINES)) {
      for (const habit of habits) expect(habitIconSchema.safeParse(habit.icon).success).toBe(true)
    }
  })
})
