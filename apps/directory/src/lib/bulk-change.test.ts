import { describe, expect, it } from "vitest"

import {
  bulkChangeVerb,
  countBulkChange,
  describeBulkRefusals,
  RECORD_IS_GONE,
  statusOnly,
  withoutFeatured,
} from "@/lib/bulk-change"
import { describeBulkResult } from "@/lib/format/bulk-result"

/**
 * The three piles a bulk change comes back in, and the sentence they turn into.
 * A part-done run is the case that matters: the count has to be checkable
 * against the rows still on screen.
 */

describe("counting a bulk change", () => {
  it("calls an id that neither changed nor matched gone", () => {
    const result = countBulkChange(["a", "b", "c"], ["a"], ["b"])
    expect(result.done).toEqual(["a"])
    expect(result.same).toEqual(["b"])
    expect(result.kept).toEqual([{ id: "c", reason: RECORD_IS_GONE }])
  })

  it("has nothing to refuse when every id is accounted for", () => {
    expect(countBulkChange(["a", "b"], ["a", "b"], []).kept).toEqual([])
  })
})

describe("the result line", () => {
  it("reads correctly when a batch only got part way", () => {
    expect(
      describeBulkResult({
        done: 36,
        same: 3,
        kept: 1,
        one: "listing",
        many: "listings",
        verb: "published",
      })
    ).toBe(
      "36 listings published, 3 were already published, 1 could not be published."
    )
  })

  it("says one thing when everything went through", () => {
    expect(
      describeBulkResult({
        done: 1,
        same: 0,
        kept: 0,
        one: "listing",
        many: "listings",
        verb: "published",
      })
    ).toBe("1 listing published.")
  })

  it("leads with the already-that-way pile when nothing needed changing", () => {
    expect(
      describeBulkResult({
        done: 0,
        same: 1,
        kept: 0,
        one: "post",
        many: "posts",
        verb: "unpublished",
      })
    ).toBe("1 post was already unpublished.")
  })

  it("still reads the old way for a delete, which has no already-that-way pile", () => {
    expect(
      describeBulkResult({
        done: 2,
        kept: 3,
        one: "workspace",
        many: "workspaces",
        verb: "deleted",
      })
    ).toBe("2 workspaces deleted, 3 could not be deleted.")
  })

  it("keeps a nothing-went delete counting from zero, not from the wrong pile", () => {
    expect(
      describeBulkResult({
        done: 0,
        kept: 2,
        one: "workspace",
        many: "workspaces",
        verb: "deleted",
      })
    ).toBe("0 workspaces deleted, 2 could not be deleted.")
  })
})

describe("what happened, in words", () => {
  it("names the category and which of the two actions ran", () => {
    expect(
      bulkChangeVerb(
        { kind: "category", categoryId: "x", mode: "add" },
        "Cafés"
      )
    ).toBe("added to Cafés")
    expect(
      bulkChangeVerb(
        { kind: "category", categoryId: "x", mode: "replace" },
        "Cafés"
      )
    ).toBe("filed under Cafés only")
  })

  it("avoids 'unfeatured', which nobody says", () => {
    expect(bulkChangeVerb({ kind: "featured", featured: false }, "")).toBe(
      "taken off the featured list"
    )
  })
})

describe("naming the refusals", () => {
  it("groups the names under their one reason", () => {
    const words = describeBulkRefusals(
      [
        { id: "a", reason: RECORD_IS_GONE },
        { id: "b", reason: RECORD_IS_GONE },
      ],
      (id) => (id === "a" ? "Joe's Diner" : "Sea Breeze Cafe")
    )
    expect(words).toBe(
      "Joe's Diner and Sea Breeze Cafe could not be changed: it no longer exists."
    )
  })

  it("is empty when nothing was refused, so no failure is reported", () => {
    expect(describeBulkRefusals([], () => "x")).toBe("")
  })
})

describe("narrowing a change to what a screen offers", () => {
  it("refuses a featured change anywhere but events", () => {
    expect(() => withoutFeatured({ kind: "featured", featured: true })).toThrow(
      "Only an event has a free featured flag"
    )
    expect(withoutFeatured({ kind: "status", status: "draft" })).toEqual({
      kind: "status",
      status: "draft",
    })
  })

  it("refuses anything but publishing on deals", () => {
    expect(() =>
      statusOnly({ kind: "category", categoryId: "x", mode: "add" })
    ).toThrow("A deal has no categories")
  })
})
