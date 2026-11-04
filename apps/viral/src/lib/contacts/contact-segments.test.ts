import { describe, expect, it } from "vitest"

import {
  defaultSegmentRules,
  describeSegmentRules,
  newSegmentCondition,
  parseSegmentRules,
  readSegmentRulesParam,
  segmentCountIsNearlyEveryone,
  segmentConditionIsComplete,
  segmentReferences,
  segmentRulesMatch,
  type SegmentCondition,
} from "@/lib/contacts/contact-segments"

/**
 * The shape a segment's rules take, and what happens to a saved one that no
 * longer reads.
 *
 * The block that matters most is the last: every wrong answer this file could
 * give is a *wider* group of people than the writer asked for, and wider is the
 * one direction a mailing list must never move on its own.
 */

describe("reading saved rules", () => {
  it("keeps old rows on all rules and accepts any-rule rows", () => {
    expect(segmentRulesMatch(parseSegmentRules({ conditions: [] }))).toBe("all")
    expect(
      parseSegmentRules({ match: "any", conditions: [] })
    ).toEqual({ match: "any", conditions: [] })
  })

  it("keeps a list of conditions it understands", () => {
    const rules = parseSegmentRules({
      conditions: [
        { type: "tag", operator: "includes", tags: ["beta"] },
        { type: "status", operator: "is", status: "subscribed" },
      ],
    })

    expect(rules.conditions).toHaveLength(2)
    expect(rules.conditions[0]).toEqual({
      type: "tag",
      operator: "includes",
      tags: ["beta"],
    })
  })

  it("keeps an empty list as an empty list", () => {
    expect(parseSegmentRules({ conditions: [] })).toEqual({ conditions: [] })
  })

  it("keeps valid conditions but drops an unknown mode back to all", () => {
    expect(
      parseSegmentRules({
        match: "some",
        conditions: [
          { type: "status", operator: "is", status: "subscribed" },
        ],
      })
    ).toEqual({
      conditions: [
        { type: "status", operator: "is", status: "subscribed" },
      ],
    })
  })

  it("drops one condition it cannot read and keeps the rest", () => {
    const rules = parseSegmentRules({
      conditions: [
        { type: "tag", operator: "includes", tags: ["beta"] },
        { type: "wormhole", operator: "is" },
      ],
    })

    expect(rules.conditions).toHaveLength(1)
    expect(rules.conditions[0]?.type).toBe("tag")
  })

  it("reads all three ways of asking about sending history", () => {
    const rules = parseSegmentRules({
      conditions: [
        { type: "emailed", operator: "within", days: 7 },
        { type: "emailed", operator: "before", days: 90 },
        { type: "emailed", operator: "never", days: 90 },
      ],
    })

    expect(rules.conditions).toHaveLength(3)
    expect(rules.conditions[1]).toEqual({
      type: "emailed",
      operator: "before",
      days: 90,
    })
  })

  it("refuses a sending-history rule with a silly number of days", () => {
    const rules = parseSegmentRules({
      conditions: [{ type: "emailed", operator: "before", days: 100000 }],
    })

    // Everything was thrown away, so this is the "matches nobody" shape below.
    expect(rules.conditions).toHaveLength(2)
    expect(rules.conditions.every((c) => c.type === "status")).toBe(true)
  })

  it("leaves rules saved before sending history existed exactly as they were", () => {
    const before = {
      match: "any" as const,
      conditions: [
        { type: "tag" as const, operator: "includes" as const, tags: ["beta"] },
        { type: "joined" as const, operator: "before" as const, days: 30 },
        { type: "account" as const, operator: "hasnt" as const },
      ],
    }

    expect(parseSegmentRules(before)).toEqual(before)
  })

  it("refuses a joined rule with a silly number of days", () => {
    const rules = parseSegmentRules({
      conditions: [{ type: "joined", operator: "within", days: 100000 }],
    })

    // Everything was thrown away, so this is the "matches nobody" shape below.
    expect(rules.conditions).toHaveLength(2)
    expect(rules.conditions.every((c) => c.type === "status")).toBe(true)
  })
})

describe("reading rules from a contacts-list link", () => {
  it("keeps an any-rule filter in the address", () => {
    expect(
      readSegmentRulesParam({
        match: "any",
        conditions: [
          { type: "status", operator: "is", status: "subscribed" },
        ],
      })
    ).toEqual({
      match: "any",
      conditions: [
        { type: "status", operator: "is", status: "subscribed" },
      ],
    })
  })

  it("carries a sending-history rule through the address unchanged", () => {
    const filter = {
      conditions: [
        { type: "emailed" as const, operator: "before" as const, days: 90 },
      ],
    }

    // The contacts list writes its filters into the address as JSON and reads
    // them back here, so a rule that does not survive this trip is one that
    // silently disappears on a reload.
    expect(
      readSegmentRulesParam(JSON.parse(JSON.stringify(filter)))
    ).toEqual(filter)
  })

  it("carries an in-segment rule through the address unchanged", () => {
    const filter = {
      conditions: [{ type: "in" as const, segmentIds: ["vip"] }],
    }

    expect(
      readSegmentRulesParam(JSON.parse(JSON.stringify(filter)))
    ).toEqual(filter)
  })

  it("drops the whole filter when its mode is junk", () => {
    expect(
      readSegmentRulesParam({
        match: "some",
        conditions: [
          { type: "status", operator: "is", status: "subscribed" },
        ],
      })
    ).toBeUndefined()
  })
})

describe("a rule that no longer reads never widens the segment", () => {
  /** On the list and opted out at once: true of nobody, by design. */
  const matchesNobody = { conditions: expect.arrayContaining([
    { type: "status", operator: "is", status: "subscribed" },
    { type: "status", operator: "is", status: "unsubscribed" },
  ]) }

  it("turns a column that is not rules at all into nobody", () => {
    expect(parseSegmentRules(null)).toEqual(matchesNobody)
    expect(parseSegmentRules("everyone")).toEqual(matchesNobody)
    expect(parseSegmentRules({})).toEqual(matchesNobody)
    expect(parseSegmentRules({ conditions: "all" })).toEqual(matchesNobody)
  })

  it("turns rules whose every condition was dropped into nobody", () => {
    expect(
      parseSegmentRules({ conditions: [{ type: "wormhole" }, { type: "brick" }] })
    ).toEqual(matchesNobody)
  })

  it("pins unreadable any-mode rules to the all-rules safety shape", () => {
    const rules = parseSegmentRules({
      match: "any",
      conditions: [{ type: "wormhole" }, { type: "brick" }],
    })

    expect(segmentRulesMatch(rules)).toBe("all")
    expect(rules).toEqual(matchesNobody)
  })

  it("does not confuse that with a segment saved with no rules at all", () => {
    // An empty list is a real answer — "every contact" — and stays one.
    expect(parseSegmentRules({ conditions: [] }).conditions).toHaveLength(0)
  })
})

describe("a half-finished rule is spotted before it is saved", () => {
  it("calls an empty tag, source, plan or segment reference unfinished", () => {
    expect(segmentConditionIsComplete(newSegmentCondition("tag"))).toBe(false)
    expect(segmentConditionIsComplete(newSegmentCondition("source"))).toBe(false)
    expect(segmentConditionIsComplete(newSegmentCondition("plan"))).toBe(false)
    expect(segmentConditionIsComplete(newSegmentCondition("in"))).toBe(false)
    expect(segmentConditionIsComplete(newSegmentCondition("notIn"))).toBe(false)
  })

  it("calls the ones with nothing left to fill in finished", () => {
    expect(segmentConditionIsComplete(newSegmentCondition("status"))).toBe(true)
    expect(segmentConditionIsComplete(newSegmentCondition("joined"))).toBe(true)
    expect(segmentConditionIsComplete(newSegmentCondition("account"))).toBe(true)
    expect(segmentConditionIsComplete(newSegmentCondition("emailed"))).toBe(true)
  })
})

describe("the nearly-everyone nudge", () => {
  it("starts at four in five contacts", () => {
    expect(segmentCountIsNearlyEveryone(20, 25)).toBe(true)
    expect(segmentCountIsNearlyEveryone(19, 25)).toBe(false)
  })

  it("stays quiet for nobody and an empty list", () => {
    expect(segmentCountIsNearlyEveryone(0, 25)).toBe(false)
    expect(segmentCountIsNearlyEveryone(0, 0)).toBe(false)
  })
})

describe("what a segment says in words", () => {
  it("starts a new segment on the rule people almost always mean", () => {
    expect(describeSegmentRules(defaultSegmentRules())).toBe("on the list")
  })

  it("joins every rule with 'and', because all of them have to be true", () => {
    const conditions: SegmentCondition[] = [
      { type: "tag", operator: "includes", tags: ["beta"] },
      { type: "account", operator: "has" },
    ]

    expect(describeSegmentRules({ conditions })).toBe(
      "tagged beta, and has an account"
    )
  })

  it("says plainly when any one rule is enough", () => {
    const conditions: SegmentCondition[] = [
      { type: "tag", operator: "includes", tags: ["beta"] },
      { type: "account", operator: "has" },
    ]

    expect(describeSegmentRules({ match: "any", conditions })).toBe(
      "Any of: tagged beta, or has an account"
    )
  })

  it("says all three sending-history rules in plain words", () => {
    expect(
      describeSegmentRules({
        conditions: [{ type: "emailed", operator: "within", days: 7 }],
      })
    ).toBe("emailed in the last 7 days")
    expect(
      describeSegmentRules({
        conditions: [{ type: "emailed", operator: "before", days: 90 }],
      })
    ).toBe("not emailed in the last 90 days")
    // The number is still carried, and must not turn up in the words.
    expect(
      describeSegmentRules({
        conditions: [{ type: "emailed", operator: "never", days: 90 }],
      })
    ).toBe("never emailed")
  })

  it("says a segment with no rules is every contact, not nobody", () => {
    expect(describeSegmentRules({ conditions: [] })).toBe(
      "Every contact, with no rules"
    )
  })

  it("names the segments an exclusion points at", () => {
    expect(
      describeSegmentRules(
        { conditions: [{ type: "notIn", segmentIds: ["a", "b"] }] },
        { a: "Staff", b: "Refunded" }
      )
    ).toBe("not in Staff or Refunded")
  })

  it("names the segments an inclusion points at", () => {
    expect(
      describeSegmentRules(
        { conditions: [{ type: "in", segmentIds: ["a", "b"] }] },
        { a: "VIPs", b: "Founders" }
      )
    ).toBe("in VIPs or Founders")
  })
})

describe("finding what a segment points at", () => {
  it("lists every included or excluded segment, with no repeats", () => {
    expect(
      segmentReferences({
        conditions: [
          { type: "in", segmentIds: ["a", "b"] },
          { type: "notIn", segmentIds: ["a", "b"] },
          { type: "notIn", segmentIds: ["b", "c"] },
          { type: "account", operator: "has" },
        ],
      })
    ).toEqual(["a", "b", "c"])
  })

  it("finds nothing in a segment that points at nothing", () => {
    expect(segmentReferences(defaultSegmentRules())).toEqual([])
  })
})
