import { describe, expect, it } from "vitest"

import { outlierFor } from "@/lib/viral/outlier"
import { outlierBadge } from "@/lib/viral/viral"

const usual = { a: 10_000, b: 9_000, c: 11_000, d: 10_000, e: 12_000, hit: 400_000 }

describe("the Outlier figure", () => {
  it("compares a video with the channel's typical video, leaving itself out", () => {
    const outlier = outlierFor({ platformVideoId: "hit", views: 400_000 }, usual)
    expect(outlier.typicalViews).toBe(10_000)
    expect(outlier.times).toBe(40)
    expect(outlierBadge(outlier)).toBe("40x usual")
  })

  it("says nothing for a channel with fewer than 5 other videos", () => {
    expect(outlierFor({ platformVideoId: "a", views: 50_000 }, { a: 1, b: 2, c: 3, d: 4, e: 5 }).times).toBeNull()
    expect(outlierFor({ platformVideoId: "x", views: 50_000 }, undefined).times).toBeNull()
  })

  it("shows no badge under 2x", () => {
    expect(outlierBadge(outlierFor({ platformVideoId: "x", views: 15_000 }, usual))).toBeNull()
    expect(outlierBadge({ times: 2.34, typicalViews: 1 })).toBe("2.3x usual")
  })
})
