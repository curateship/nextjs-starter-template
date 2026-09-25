import { describe, expect, it } from "vitest"

import {
  budgetState,
  featureLabel,
} from "@/lib/video/ai-budget"

/**
 * The reading in the studio has to agree with the meter that actually stops
 * a call — the same 80-out-of-100 line, and the same idea of "gone".
 */
describe("what the budget reading says", () => {
  it("is fine well under the line", () => {
    // $5 of a $20 month.
    expect(budgetState(500, 2000)).toBe("fine")
  })

  it("turns to a warning at exactly 80 out of 100, not a penny before", () => {
    expect(budgetState(1599, 2000)).toBe("fine")
    expect(budgetState(1600, 2000)).toBe("low")
  })

  it("is gone once the whole month's budget is spent, or overspent", () => {
    expect(budgetState(2000, 2000)).toBe("none")
    expect(budgetState(2500, 2000)).toBe("none")
  })

  it("treats a ceiling of nothing as nothing left, never as free rein", () => {
    expect(budgetState(0, 0)).toBe("none")
  })
})

describe("naming what the money went on", () => {
  it("reads a feature key as words", () => {
    expect(featureLabel("caption_generation")).toBe("Caption generation")
    expect(featureLabel("key-test")).toBe("Key test")
  })

  it("says something rather than nothing for an empty name", () => {
    expect(featureLabel("")).toBe("AI")
  })
})
