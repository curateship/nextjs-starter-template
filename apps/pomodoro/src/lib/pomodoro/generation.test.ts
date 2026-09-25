import { describe, expect, it } from "vitest"

import {
  describeCreditsLeft,
  GENERATION_COPY,
  GENERATION_PURPOSE,
} from "@/lib/pomodoro/generation"

describe("describeCreditsLeft", () => {
  it("counts what is left", () => {
    expect(describeCreditsLeft(3, 5)).toBe("3 of 5 left this month.")
    expect(describeCreditsLeft(1, 20)).toBe("1 of 20 left this month.")
  })

  it("says when the month is spent, and when the next lot arrives", () => {
    expect(describeCreditsLeft(0, 5)).toBe(
      "None left this month. You get 5 on the first."
    )
  })

  it("does not offer a count to somebody with no allowance at all", () => {
    expect(describeCreditsLeft(0, 0)).toBe("AI generation is a Pro perk.")
  })
})

describe("GENERATION_PURPOSE", () => {
  it("files a generated background with the uploaded backgrounds", () => {
    // Both kinds land in an existing picker rather than a third grid, which is
    // what lets the picking, serving and deleting stay one code path.
    expect(GENERATION_PURPOSE.background).toBe("background")
    expect(GENERATION_PURPOSE.soundscape).toBe("sound")
  })
})

describe("GENERATION_COPY", () => {
  it("offers three prompts for each kind, and no empty wording", () => {
    for (const kind of ["background", "soundscape"] as const) {
      const copy = GENERATION_COPY[kind]
      expect(copy.suggestions).toHaveLength(3)
      expect(copy.suggestions.every((one) => one.length > 10)).toBe(true)
      expect(copy.placeholder.length).toBeGreaterThan(10)
      expect(copy.description.length).toBeGreaterThan(10)
    }
  })
})
