import { describe, expect, it } from "vitest"

import { instagramGuide } from "@/lib/video/carousel-guides"

describe("Instagram guides", () => {
  it("shades the story's top 14, bottom 35 and 6 on each side", () => {
    const guide = instagramGuide("9:16")
    expect(guide.zones[0]).toEqual({ x: 0, y: 0, width: 1, height: 0.14 })
    expect(guide.zones[1].y).toBeCloseTo(0.65, 10)
    expect(guide.zones[2].width).toBe(0.06)
    expect(guide.source).toContain("Meta Ads Guide")
  })

  it("cuts 33.75 pixels off each side of a 4:5 slide for a 3:4 tile", () => {
    const [left, right] = instagramGuide("4:5").zones
    expect(left.width * 1080).toBeCloseTo(33.75, 6)
    expect((1 - right.x) * 1080).toBeCloseTo(33.75, 6)
  })

  it("cuts 135 pixels off each side of a square slide", () => {
    const [left] = instagramGuide("1:1").zones
    expect(left.width * 1080).toBeCloseTo(135, 6)
  })
})
