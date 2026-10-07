import { describe, expect, it } from "vitest"

import { planCardFeatures } from "@/lib/pomodoro/plan-card-features"

describe("planCardFeatures", () => {
  it("lists every Pro perk with the old app's numbers when the plan names none", () => {
    expect(planCardFeatures({}, false)).toEqual([
      "All 8 sounds and 8 backgrounds, including the Pro ones",
      "AI soundscapes, 20 a month",
      "AI backgrounds, 5 a month",
      "Upload your own loops and clips, 2 GB",
      "Host focus rooms, now or booked for later",
      "Focus history over 12 months and the whole year",
    ])
  })

  it("follows the plan's own numbers and leaves out a perk it switches off", () => {
    const lines = planCardFeatures(
      { hostRooms: false, monthlyBackgrounds: 50 },
      false
    )
    expect(lines).toContain("AI backgrounds, 50 a month")
    expect(lines.some((line) => line.startsWith("Host"))).toBe(false)
  })

  it("adds the plan's other features after the app's own, once", () => {
    const lines = planCardFeatures({ support: "priority", monthlySoundscapes: 20 }, false)
    expect(lines.at(-1)).toBe("Priority support")
    expect(lines.filter((line) => line.includes("soundscapes"))).toHaveLength(1)
  })

  it("lists what every account gets on the free card", () => {
    const lines = planCardFeatures({ support: "community" }, true)
    expect(lines[1]).toBe("4 sounds and 4 backgrounds")
    expect(lines.at(-1)).toBe("Community support")
  })
})
