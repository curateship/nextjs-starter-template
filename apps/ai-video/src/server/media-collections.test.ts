import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cleanCollectionName,
  COLLECTION_NAME_REQUIRED_MESSAGE,
  MEDIA_COLLECTION_NAME_MAX,
} from "../lib/media-collections.ts"

describe("cleanCollectionName", () => {
  it("trims surrounding whitespace", () => {
    assert.equal(cleanCollectionName("  Logos  "), "Logos")
  })

  // The unique index compares lower(name), so two names that differ only by
  // inner spacing must collapse to one or the index would let both through.
  it("collapses runs of inner whitespace", () => {
    assert.equal(cleanCollectionName("B-roll   —\tgym"), "B-roll — gym")
  })

  it("keeps a name that needs no cleaning", () => {
    assert.equal(cleanCollectionName("B-roll — gym"), "B-roll — gym")
  })

  it("rejects a name that is empty or only whitespace", () => {
    for (const value of ["", "   ", "\t\n"]) {
      assert.throws(
        () => cleanCollectionName(value),
        new RegExp(COLLECTION_NAME_REQUIRED_MESSAGE)
      )
    }
  })

  it("truncates to the column width instead of failing the insert", () => {
    const cleaned = cleanCollectionName("a".repeat(MEDIA_COLLECTION_NAME_MAX + 40))
    assert.equal(cleaned.length, MEDIA_COLLECTION_NAME_MAX)
  })
})
