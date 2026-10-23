import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  deserializeDeletionImpactIds,
  isDeletionImpactRequest,
  serializeDeletionImpactIds,
} from "./deletion-impact-contract"

describe("deletion impact request contract", () => {
  it("round-trips text IDs without treating commas as separators", () => {
    const ids = ["user,with,commas", "regular-user"]
    assert.deepEqual(deserializeDeletionImpactIds(serializeDeletionImpactIds(ids)), ids)
  })

  it("rejects malformed serialized IDs", () => {
    assert.deepEqual(deserializeDeletionImpactIds("not-json"), [])
    assert.deepEqual(deserializeDeletionImpactIds(JSON.stringify(["valid", 2])), [])
  })

  it("rejects unknown targets before they can reach a deletion-impact query", () => {
    assert.equal(isDeletionImpactRequest({ ids: ["id"], siteId: "site", target: "unknown" }), false)
    assert.equal(isDeletionImpactRequest({ ids: ["id"], target: "user" }), true)
    assert.equal(isDeletionImpactRequest({ ids: ["id"], siteId: "site", target: "site" }), true)
  })

  it("bounds the number and size of target IDs", () => {
    assert.equal(isDeletionImpactRequest({ ids: [], target: "user" }), false)
    assert.equal(isDeletionImpactRequest({ ids: Array.from({ length: 101 }, (_, index) => String(index)), target: "user" }), false)
    assert.equal(isDeletionImpactRequest({ ids: ["x".repeat(1025)], target: "user" }), false)
  })
})
