import { describe, expect, it } from "vitest"

import { joinedSegmentNode, readJoinedSegment } from "./joined-segment"

describe("Joined segment trigger", () => {
  it("requires a segment before the flow can compile", () => {
    expect(
      joinedSegmentNode.settingsSchema.safeParse({
        segmentId: "",
        segmentName: "",
      }).success
    ).toBe(false)
  })

  it("names the saved segment without trusting unreadable settings", () => {
    expect(
      joinedSegmentNode.description({
        segmentId: "s1",
        segmentName: "Warm leads",
      })
    ).toContain("Warm leads")
    expect(readJoinedSegment({ segmentId: 7 })).toEqual({
      segmentId: "",
      segmentName: "",
    })
  })
})
