import { describe, expect, it } from "vitest"

import { segmentRulesFromContactFilters } from "@/lib/contacts/contact-filter-segment"
import type { SegmentRules } from "@/lib/contacts/contact-segments"

describe("turning contact filters into a segment draft", () => {
  it("keeps tag and status filters exactly as they appear on the list", () => {
    const filters: SegmentRules = {
      match: "any",
      conditions: [
        { type: "tag", operator: "includes", tags: ["member"] },
        { type: "status", operator: "is", status: "subscribed" },
      ],
    }

    expect(segmentRulesFromContactFilters(filters)).toEqual(filters)
  })

  it("returns an independent draft that cannot change the active filters", () => {
    const filters: SegmentRules = {
      conditions: [
        { type: "tag", operator: "includes", tags: ["member"] },
      ],
    }
    const draft = segmentRulesFromContactFilters(filters)

    if (draft.conditions[0]?.type === "tag") {
      draft.conditions[0].tags.push("staff")
    }

    expect(filters).toEqual({
      conditions: [
        { type: "tag", operator: "includes", tags: ["member"] },
      ],
    })
  })
})
