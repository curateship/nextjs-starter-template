import { describe, expect, it } from "vitest"

import {
  bracketPercent,
  bracketPrice,
  bracketTyped,
} from "@/lib/trade/brackets"

describe("bracketPercent", () => {
  it("says how far a price sits from the entry", () => {
    expect(bracketPercent(100, 105)).toBe("5")
    expect(bracketPercent(100, 98)).toBe("2")
  })

  it("is empty when there is nothing to measure", () => {
    expect(bracketPercent(100, null)).toBe("")
    expect(bracketPercent(0, 105)).toBe("")
  })
})

describe("bracketPrice", () => {
  it("puts a long's target above the entry and its stop below", () => {
    expect(
      bracketPrice({ entryPx: 100, percent: "5", long: true, winning: true })
    ).toBe(105)
    expect(
      bracketPrice({ entryPx: 100, percent: "2", long: true, winning: false })
    ).toBe(98)
  })

  it("swaps both sides on a short", () => {
    expect(
      bracketPrice({ entryPx: 100, percent: "5", long: false, winning: true })
    ).toBe(95)
    expect(
      bracketPrice({ entryPx: 100, percent: "2", long: false, winning: false })
    ).toBe(102)
  })

  it("refuses a distance that takes the price through zero", () => {
    // A long's stop is the side that can: 120% below the entry is nowhere.
    expect(
      bracketPrice({ entryPx: 100, percent: "120", long: true, winning: false })
    ).toBeNull()
    // The same 120% as a long's target is fine — it is above the entry.
    expect(
      bracketPrice({ entryPx: 100, percent: "120", long: true, winning: true })
    ).toBeCloseTo(220, 9)
  })

  it("treats empty, nonsense and zero as no line at all", () => {
    for (const percent of ["", "   ", "abc", "0", "-3"]) {
      expect(
        bracketPrice({ entryPx: 100, percent, long: true, winning: true })
      ).toBeNull()
    }
  })
})

describe("bracketTyped", () => {
  it("is true only when something typed does not work out", () => {
    expect(bracketTyped("abc", null)).toBe(true)
    expect(bracketTyped("", null)).toBe(false)
    expect(bracketTyped("5", 105)).toBe(false)
  })
})
