import { describe, expect, it } from "vitest"

import {
  cleanPublicGridColumns,
  publicGridColumnsClassName,
} from "@/lib/layout/grid-columns"
import {
  cleanListingsRowSettings,
  cleanPickedRowSettings,
} from "@/lib/directory/front-page-kinds"

/**
 * A column count is typed into a settings window and stored in a bag of fields
 * nothing validates on the way back out, so the two rules worth holding are
 * that rubbish never reaches a class name and that a row saved before the
 * field existed keeps drawing exactly as it did.
 */

describe("what a stored column count may be", () => {
  it("keeps 1 to 4", () => {
    for (const columns of [1, 2, 3, 4]) {
      expect(cleanPublicGridColumns(columns)).toBe(columns)
    }
  })

  it("falls back to the grid's own for anything else", () => {
    for (const value of [0, -1, 5, 2.5, "3", null, undefined, {}]) {
      expect(cleanPublicGridColumns(value)).toBe(0)
    }
  })
})

describe("the classes a column count draws", () => {
  it("never puts more than one card on a phone", () => {
    for (const columns of [1, 2, 3, 4]) {
      // Every class either carries a breakpoint or is the single column, so
      // nothing widens the grid below `sm`.
      for (const name of publicGridColumnsClassName(columns, "").split(" ")) {
        expect(name.includes(":") || name === "grid-cols-1").toBe(true)
      }
    }
  })

  it("ramps up to four rather than jumping straight there", () => {
    expect(publicGridColumnsClassName(4, "fallback")).toBe(
      "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    )
  })

  it("leaves a row that never chose one exactly as it was", () => {
    expect(publicGridColumnsClassName(undefined, "fallback")).toBe("fallback")
    expect(publicGridColumnsClassName(0, "fallback")).toBe("fallback")
  })
})

describe("a row saved before the field existed", () => {
  it("opens with the grid's own arrangement, not one column", () => {
    expect(cleanListingsRowSettings({ count: 6 }).columns).toBe(0)
    expect(cleanPickedRowSettings({ count: 3 }).columns).toBe(0)
  })

  it("keeps a chosen count through a save and a reload", () => {
    const saved = cleanPickedRowSettings({ count: 3, columns: 2 })
    expect(cleanPickedRowSettings({ ...saved })).toEqual(saved)
  })
})
