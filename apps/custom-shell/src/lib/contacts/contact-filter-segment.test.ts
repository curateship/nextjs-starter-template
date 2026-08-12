import { describe, expect, it } from "vitest"

import {
  contactSearchAffectsDisplayedTotal,
  segmentConditionsFromContactFilters,
} from "@/lib/contacts/contact-filter-segment"
import type { SegmentCondition } from "@/lib/contacts/contact-segments"

describe("turning contact filters into a segment draft", () => {
  it("keeps tag and status filters exactly as they appear on the list", () => {
    const filters: SegmentCondition[] = [
      { type: "tag", operator: "includes", tags: ["member"] },
      { type: "status", operator: "is", status: "subscribed" },
    ]

    expect(segmentConditionsFromContactFilters(filters)).toEqual(filters)
  })

  it("returns an independent draft that cannot change the active filters", () => {
    const filters: SegmentCondition[] = [
      { type: "tag", operator: "includes", tags: ["member"] },
    ]
    const draft = segmentConditionsFromContactFilters(filters)

    if (draft[0]?.type === "tag") draft[0].tags.push("staff")

    expect(filters).toEqual([
      { type: "tag", operator: "includes", tags: ["member"] },
    ])
  })
})

describe("deciding whether the visible count includes search", () => {
  it("covers search words that were just typed", () => {
    expect(contactSearchAffectsDisplayedTotal("ada", "")).toBe(true)
  })

  it("covers applied search words that were just cleared", () => {
    expect(contactSearchAffectsDisplayedTotal("", "ada")).toBe(true)
  })

  it("uses the list total once both search values are blank", () => {
    expect(contactSearchAffectsDisplayedTotal(" ", "")).toBe(false)
  })
})
