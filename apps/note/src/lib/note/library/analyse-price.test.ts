import { describe, expect, it } from "vitest"

import { analyseDollars, analysePriceLine, manyPriceLine, mergePriceLine } from "@/lib/note/library/analyse-price"

/**
 * The line under the Analyse button. Worked through for a 30-minute video at
 * Gemini 3.8 Flash's $0.75 in and $3.75 out per million tokens:
 * listening in = 1,800s × 32 = 57,600 tokens, out = 1,800s × 4 = 7,200;
 * reading in = 600 + 7,200 = 7,800, out = 1,200.
 * In 65,400 × $0.75 / 1M = $0.04905, out 8,400 × $3.75 / 1M = $0.0315,
 * together $0.08055, about 8¢.
 */
const video = (soundSeconds: number) => ({ soundSeconds, chars: 0, pictures: 0 })

describe("the Analyse price line", () => {
  it("says about 8¢ for a 30-minute video", () => {
    expect(analyseDollars(video(1800))).toBeCloseTo(0.08055, 5)
    expect(analysePriceLine(video(1800), false)).toBe("About 8¢ with Gemini 3.8 Flash")
  })

  it("says under 1¢ for a 19-second short", () => {
    expect(analysePriceLine(video(19), false)).toBe("Under 1¢ with Gemini 3.8 Flash")
  })

  it("counts an X post's words and pictures", () => {
    // 600 + 2,000 / 4 + 2 × 1,120 = 3,340 in, 1,200 out: $0.002505 + $0.0045 = $0.007005.
    expect(analyseDollars({ soundSeconds: 0, chars: 2000, pictures: 2 })).toBeCloseTo(0.007005, 6)
  })

  it("says what goes when it runs again", () => {
    expect(analysePriceLine(video(60), true)).toBe(
      "Under 1¢ with Gemini 3.8 Flash. Replaces the summary, the plan with your ticks, and the quotes."
    )
  })

  it("adds up many notes and warns about the ones analysed before", () => {
    expect(
      manyPriceLine([
        { analyse: video(1800), analysed: true },
        { analyse: video(1800), analysed: false },
      ])
    ).toBe(
      "Analysing 2 notes costs about 16¢ with Gemini 3.8 Flash. It replaces the plan of the one already analysed, ticks included."
    )
  })

  it("prices one plan from several", () => {
    expect(mergePriceLine([{ planChars: 400 }, { planChars: 400 }])).toBe(
      "One plan from 2 notes costs under 1¢ with Gemini 3.8 Flash."
    )
  })
})
