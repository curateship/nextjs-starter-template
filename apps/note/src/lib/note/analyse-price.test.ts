import { describe, expect, it } from "vitest"

import { analyseCostDollars, analysePriceLine } from "@/lib/note/analyse-price"

/**
 * The line above the Analyse button. Worked through for 30 minutes at Gemini
 * 3.8 Flash's $0.75 in and $3.75 out per million tokens:
 * in = 1,800s × 32 sound + 1,800s × 4 words = 64,800 tokens = $0.0486,
 * out = 1,800s × 4 words + 1,500 = 8,700 tokens = $0.0326,
 * together $0.0812, about 8¢.
 */
describe("the Analyse price line", () => {
  it("says about 8¢ for a 30-minute video", () => {
    expect(analyseCostDollars(1800)).toBeCloseTo(0.0812, 4)
    expect(analysePriceLine(1800, false)).toBe(
      "Analysing costs about 8¢ with Gemini 3.8 Flash."
    )
  })

  it("says under 1¢ for a 60-second TikTok", () => {
    expect(analysePriceLine(60, false)).toBe("Analysing costs under 1¢ with Gemini 3.8 Flash.")
  })

  it("says the most it could be before the length is known", () => {
    expect(analysePriceLine(null, false)).toBe("Analysing costs up to 8¢ with Gemini 3.8 Flash.")
  })

  it("says the old results are replaced when it runs again", () => {
    expect(analysePriceLine(720, true)).toBe(
      "Analysing again costs about 4¢ with Gemini 3.8 Flash and replaces the summary, plan, quotes and transcript."
    )
  })
})
