import { describe, expect, it } from "vitest"

import {
  BASE_STOP_DAYS_REFUSAL,
  BASE_STOP_UNDER_REFUSAL,
  badBaseReclaimDays,
  badBaseUnderPct,
} from "@/lib/trade/base-stop"

/**
 * The two base-stop boxes, judged one at a time.
 *
 * Three windows share these, and the point of splitting them apart was that a
 * window can now say which of the two is wrong. What each box accepts must not
 * have moved while that happened, so these pin the edges.
 */
describe("what the base-stop boxes accept", () => {
  it("takes 0 through 50 percent under the base, and an empty box as 0", () => {
    for (const good of ["0", "0.5", "25", "50", ""]) {
      expect(badBaseUnderPct(good)).toBe(false)
    }
    for (const bad of ["-1", "50.1", "100", "abc"]) {
      expect(badBaseUnderPct(bad)).toBe(true)
    }
  })

  it("takes 0 through 90 days to buy back, and an empty box as 0", () => {
    for (const good of ["0", "1", "90", ""]) {
      expect(badBaseReclaimDays(good)).toBe(false)
    }
    for (const bad of ["-1", "90.5", "365", "soon"]) {
      expect(badBaseReclaimDays(bad)).toBe(true)
    }
  })

  it("names the box and the limit in each refusal, never a field name", () => {
    expect(BASE_STOP_UNDER_REFUSAL).toContain("Percent under the base")
    expect(BASE_STOP_UNDER_REFUSAL).toContain("50")
    expect(BASE_STOP_DAYS_REFUSAL).toContain("Buy back after (days)")
    expect(BASE_STOP_DAYS_REFUSAL).toContain("90")
    for (const words of [BASE_STOP_UNDER_REFUSAL, BASE_STOP_DAYS_REFUSAL]) {
      expect(words).not.toContain("underPct")
      expect(words).not.toContain("reclaimDays")
    }
  })
})
