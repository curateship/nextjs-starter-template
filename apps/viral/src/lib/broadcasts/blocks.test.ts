import { describe, expect, it } from "vitest"

import {
  describeAudienceFilter,
  parseAudienceFilter,
} from "@/lib/broadcasts/blocks"

/**
 * Who a newsletter is for, read back off the stored setting.
 *
 * Reading it wrong in the safe direction is fine — a half-written draft can say
 * "everyone" and nothing happens. Reading it wrong in the other direction is
 * the one mistake nobody can take back, so the checks below are mostly about
 * what does *not* quietly become "everyone".
 */
describe("parseAudienceFilter", () => {
  it("reads the three real shapes back unchanged", () => {
    expect(parseAudienceFilter({ kind: "all" })).toEqual({ kind: "all" })
    expect(parseAudienceFilter({ kind: "tags", tags: ["vip"] })).toEqual({
      kind: "tags",
      tags: ["vip"],
    })
    expect(parseAudienceFilter({ kind: "segment", segmentId: "seg-1" })).toEqual(
      { kind: "segment", segmentId: "seg-1" }
    )
  })

  it("falls back to everyone only when the shape itself is unreadable", () => {
    expect(parseAudienceFilter(null)).toEqual({ kind: "all" })
    expect(parseAudienceFilter({ kind: "segment" })).toEqual({ kind: "all" })
    expect(parseAudienceFilter({ kind: "tags", tags: [] })).toEqual({
      kind: "all",
    })
  })

  it("keeps a segment id that no longer exists, rather than dropping it", () => {
    // The whole point. A deleted segment still reads as a segment, so the send
    // path is the one that looks it up and refuses — "we could not find who
    // this was for" never turns into "send it to everybody".
    expect(
      parseAudienceFilter({ kind: "segment", segmentId: "seg-deleted" })
    ).toEqual({ kind: "segment", segmentId: "seg-deleted" })
  })
})

describe("describeAudienceFilter", () => {
  it("names the segment when the caller passed the names in", () => {
    expect(
      describeAudienceFilter(
        { kind: "segment", segmentId: "seg-1" },
        { "seg-1": "Paying customers" }
      )
    ).toBe("Segment: Paying customers")
  })

  it("says a segment is gone rather than pretending it is still there", () => {
    expect(
      describeAudienceFilter({ kind: "segment", segmentId: "seg-1" }, {})
    ).toBe("A segment that has since been deleted")
  })

  it("still says the other two the way it always did", () => {
    expect(describeAudienceFilter({ kind: "all" })).toBe(
      "All subscribed contacts"
    )
    expect(describeAudienceFilter({ kind: "tags", tags: ["vip", "beta"] })).toBe(
      "Tagged: vip, beta"
    )
  })
})
