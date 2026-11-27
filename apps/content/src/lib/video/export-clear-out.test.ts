import { describe, expect, it } from "vitest"

import {
  CLEAR_OUT_AGE_VALUES,
  clearOutCutoff,
} from "@/lib/video/export-clear-out"

describe("the clear-out cutoff", () => {
  const at = new Date(2026, 8, 24, 15, 30)

  it("goes back the chosen number of calendar months, to the minute", () => {
    expect(
      CLEAR_OUT_AGE_VALUES.map((choice) => clearOutCutoff(choice, at))
    ).toEqual([
      new Date(2026, 7, 24, 15, 30),
      new Date(2026, 5, 24, 15, 30),
      new Date(2026, 2, 24, 15, 30),
      new Date(2025, 8, 24, 15, 30),
    ])
  })

  it("never changes the date it was given", () => {
    clearOutCutoff("12", at)
    expect(at).toEqual(new Date(2026, 8, 24, 15, 30))
  })
})
